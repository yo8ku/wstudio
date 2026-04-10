/**
 * Main-process plugin runtime registries.
 * They back the plugin SDK host bridge and allow PluginHostManager to clear plugin-scoped registrations safely.
 */

import {
  QueryController,
  MarkdownPreviewRenderer,
  type AppProtocolData,
  type AppProtocolHandler,
  type BasesViewRegistration,
  type Command,
  type CommandRegistry,
  type Disposable,
  type EditorExtension,
  type EditorSuggest,
  type HoverLinkSource,
  type JsonValue as PluginJsonValue,
  type MarkdownCodeBlockProcessor,
  type MarkdownPostProcessor,
  type PluginUiEntryScope,
  type PluginUiEntryLocation,
  type SettingTab,
  type StatusBarItem,
  type SuggestionValue,
  type UIRegistry,
  type ViewCreator,
} from '@note-studio/plugin';
import type { PluginDataStore } from '@note-studio/plugin/types/data';
import type { SettingsRegistry } from '@note-studio/plugin/types/settings';
import type {
  JsonValue as SharedJsonValue,
  PluginUiEntryKind,
  PluginUiEntrySnapshot,
  WorkbenchCommandContributionEntry,
} from '@note-studio/shared';
import {
  COMPONENT_INTERNAL_LOAD,
  COMPONENT_INTERNAL_UNLOAD,
  SETTING_TAB_INTERNAL_ATTACH,
} from '@note-studio/plugin/internal/runtime';
import { MainProcessAppFacade, type MainProcessAppFacadeDependencies } from './MainProcessAppFacade';
import type { SettingsManager } from '../../config/SettingsManager';
import type { PluginSettingTabSummary } from './types';

export interface PluginRuntimeHostBridge {
  readonly bases: MainProcessBasesRegistry;
  readonly commands: MainProcessCommandRegistry;
  readonly data: MainProcessDataStore;
  readonly editors: MainProcessEditorRegistry;
  readonly extensions: MainProcessExtensionRegistry;
  readonly hover: MainProcessHoverRegistry;
  readonly markdown: MainProcessMarkdownRegistry;
  readonly protocols: MainProcessProtocolRegistry;
  readonly settings: MainProcessSettingsRegistry;
  readonly ui: MainProcessUIRegistry;
  readonly views: MainProcessViewRegistry;
}

type ComponentLifecycleMethodName = 'onload' | 'onunload';

interface ComponentLifecycleTarget {
  readonly [COMPONENT_INTERNAL_LOAD]?: () => Promise<void>;
  readonly [COMPONENT_INTERNAL_UNLOAD]?: () => Promise<void>;
  readonly onload?: () => Promise<void> | void;
  readonly onunload?: () => Promise<void> | void;
}

function createDisposable(callback: () => void): Disposable {
  let active = true;

  return {
    dispose(): void {
      if (!active) {
        return;
      }

      active = false;
      callback();
    },
  };
}

async function invokeComponentLifecycle(
  target: ComponentLifecycleTarget,
  symbolKey: typeof COMPONENT_INTERNAL_LOAD | typeof COMPONENT_INTERNAL_UNLOAD,
  fallbackName: ComponentLifecycleMethodName,
): Promise<void> {
  const symbolMethod = target[symbolKey];

  if (typeof symbolMethod === 'function') {
    await symbolMethod.call(target);
    return;
  }

  const fallbackMethod = target[fallbackName];

  if (typeof fallbackMethod === 'function') {
    await Promise.resolve(fallbackMethod.call(target));
    return;
  }

  throw new Error(`Component lifecycle method "${fallbackName}" is not available.`);
}

function isSharedPrimitive(value: SharedJsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isPluginPrimitive(value: PluginJsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function sharedToPlugin(value: SharedJsonValue): PluginJsonValue {
  if (isSharedPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sharedToPlugin(item));
  }

  const result: Record<string, PluginJsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = sharedToPlugin(item);
  }

  return result;
}

function pluginToShared(value: PluginJsonValue): SharedJsonValue {
  if (isPluginPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => pluginToShared(item));
  }

  const result: Record<string, SharedJsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = pluginToShared(item);
  }

  return result;
}


interface RegisteredCommandEntry {
  readonly pluginId: string;
  readonly qualifiedId: string;
  readonly command: Command;
}

interface RegisteredSettingTabEntry {
  readonly id: string;
  readonly pluginId: string;
  readonly settingTab: SettingTab;
}

interface RegisteredViewEntry {
  readonly pluginId: string;
  readonly type: string;
  readonly creator: ViewCreator;
}

interface RegisteredExtensionEntry {
  readonly pluginId: string;
  readonly extension: string;
  readonly viewType: string;
}

interface RegisteredBasesEntry {
  readonly pluginId: string;
  readonly viewId: string;
  readonly registration: BasesViewRegistration;
}

interface RegisteredPluginUiEntry {
  readonly id: string;
  readonly pluginId: string;
  readonly location: PluginUiEntryLocation;
  readonly kind: PluginUiEntryKind;
  readonly icon: string | null;
  readonly scope: PluginUiEntryScope | null;
  readonly element: HTMLElement & Disposable;
}

export interface BasesViewSnapshot {
  readonly registrationName: string;
  readonly icon: string;
  readonly textContent: string;
  readonly dataset: Readonly<Record<string, string>>;
  readonly domSnapshot: readonly string[];
  readonly optionSummary: readonly string[];
}

const GLOBAL_SETTING_TAB_INTERNAL_ATTACH = Symbol.for('wstudio.settingTab.internal.attach');

export class MainProcessCommandRegistry implements CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommandEntry>();

  public constructor(private readonly getApp: () => MainProcessAppFacade) {}

  public registerCommand(pluginId: string, command: Command): Disposable {
    const qualifiedId = `${pluginId}:${command.id}`;
    this.commands.set(qualifiedId, {
      pluginId,
      qualifiedId,
      command,
    });

    return createDisposable(() => {
      this.commands.delete(qualifiedId);
    });
  }

  public removeCommand(commandId: string): void {
    if (this.commands.delete(commandId)) {
      return;
    }

    for (const [qualifiedId, entry] of [...this.commands.entries()]) {
      if (entry.command.id === commandId) {
        this.commands.delete(qualifiedId);
      }
    }
  }

  public async executeCommand(commandId: string): Promise<void> {
    const entry = this.resolveCommand(commandId);

    if (entry === null) {
      return;
    }

    if (entry.command.checkCallback !== undefined) {
      const allowed = await entry.command.checkCallback(false);

      if (allowed === false) {
        return;
      }
    }

    if (entry.command.callback !== undefined) {
      await entry.command.callback();
      return;
    }

    if (entry.command.editorCallback === undefined && entry.command.editorCheckCallback === undefined) {
      return;
    }

    const activeEditor = await this.getApp().workspace.refreshActiveEditorState();

    if (activeEditor === null || activeEditor.editor === undefined) {
      return;
    }

    if (entry.command.editorCheckCallback !== undefined) {
      const allowed = await entry.command.editorCheckCallback(false, activeEditor.editor, activeEditor);

      if (allowed === false) {
        return;
      }
    }

    if (entry.command.editorCallback !== undefined) {
      await entry.command.editorCallback(activeEditor.editor, activeEditor);
    }
  }

  public clearPlugin(pluginId: string): void {
    for (const [qualifiedId, entry] of [...this.commands.entries()]) {
      if (entry.pluginId === pluginId) {
        this.commands.delete(qualifiedId);
      }
    }
  }

  public getCommandContributions(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly WorkbenchCommandContributionEntry[] {
    return [...this.commands.values()].map((entry) => ({
      extensionId: entry.pluginId,
      extensionDisplayName: resolvePluginDisplayName(entry.pluginId),
      commandId: entry.command.id,
      title: entry.command.name,
      category: entry.command.category ?? null,
      icon: entry.command.icon ?? null,
    }));
  }

  private resolveCommand(commandId: string): RegisteredCommandEntry | null {
    const direct = this.commands.get(commandId);

    if (direct !== undefined) {
      return direct;
    }

    const matches = [...this.commands.values()].filter((entry) => entry.command.id === commandId);
    return matches.length === 1 ? matches[0] : null;
  }
}

export class MainProcessDataStore implements PluginDataStore {
  public constructor(private readonly settingsManager: SettingsManager) {}

  public async loadData<TData extends PluginJsonValue = PluginJsonValue>(pluginId: string): Promise<TData | null> {
    const value = this.settingsManager.getPluginSetting<SharedJsonValue>(`plugin.data.${pluginId}`);

    if (value === undefined) {
      return null;
    }

    return sharedToPlugin(value) as TData;
  }

  public async saveData<TData extends PluginJsonValue>(pluginId: string, data: TData): Promise<void> {
    await this.settingsManager.updatePluginSetting(`plugin.data.${pluginId}`, pluginToShared(data), 'user');
  }

  public async deleteData(pluginId: string): Promise<void> {
    await this.settingsManager.resetSettingValue(`plugin.data.${pluginId}`, 'user');
  }
}

export class MainProcessSettingsRegistry implements SettingsRegistry {
  private readonly tabs = new Map<string, RegisteredSettingTabEntry[]>();
  private nextTabId = 0;

  public registerSettingTab(pluginId: string, settingTab: SettingTab): Disposable {
    const runtimeTab = settingTab as SettingTab & Partial<Record<symbol, (containerEl: HTMLElement) => void>>;
    const attach = runtimeTab[SETTING_TAB_INTERNAL_ATTACH] ?? runtimeTab[GLOBAL_SETTING_TAB_INTERNAL_ATTACH];

    if (typeof attach !== 'function') {
      throw new Error(`Plugin "${pluginId}" registered a setting tab without an attach lifecycle method.`);
    }

    attach.call(settingTab, document.createElement('div'));
    const entries = this.tabs.get(pluginId) ?? [];
    this.nextTabId += 1;
    entries.push({
      id: `${pluginId}:setting-tab:${this.nextTabId}`,
      pluginId,
      settingTab,
    });
    this.tabs.set(pluginId, entries);

    return createDisposable(() => {
      const remaining = (this.tabs.get(pluginId) ?? []).filter((item) => item.settingTab !== settingTab);

      if (remaining.length === 0) {
        this.tabs.delete(pluginId);
      } else {
        this.tabs.set(pluginId, remaining);
      }
    });
  }

  public clearPlugin(pluginId: string): void {
    this.tabs.delete(pluginId);
  }

  public getSettingTabSummaries(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly PluginSettingTabSummary[] {
    const result: PluginSettingTabSummary[] = [];

    for (const [pluginId, entries] of this.tabs.entries()) {
      for (const entry of entries) {
        entry.settingTab.hide();
        entry.settingTab.display();

        const containerEl = entry.settingTab.containerEl;
        const previewLines = Array.from(
          containerEl.querySelectorAll<HTMLElement>('.ns-plugin-setting'),
        ).map((settingEl) => {
          const name = settingEl.querySelector<HTMLElement>('.ns-plugin-setting__name')?.textContent?.trim() ?? '';
          const description = settingEl.querySelector<HTMLElement>('.ns-plugin-setting__desc')?.textContent?.trim() ?? '';

          if (name.length > 0 && description.length > 0) {
            return `${name}：${description}`;
          }

          return name.length > 0 ? name : description;
        }).filter((line) => line.length > 0);
        const title = containerEl.querySelector('h1')?.textContent?.trim()
          ?? containerEl.querySelector('h2')?.textContent?.trim()
          ?? containerEl.querySelector('h3')?.textContent?.trim()
          ?? resolvePluginDisplayName(pluginId);
        const previewText = previewLines.length > 0
          ? previewLines.join('\n')
          : containerEl.textContent?.trim() ?? '';

        result.push({
          id: entry.id,
          pluginId,
          pluginName: resolvePluginDisplayName(pluginId),
          title,
          preview: previewText.length > 0 ? previewText : null,
          previewLines,
        });
      }
    }

    return result;
  }
}

function createManagedElement(className: string): HTMLElement & Disposable {
  const element = document.createElement('div');
  element.className = className;
  const managedElement = Object.assign(element, {
    dispose(): void {
      element.remove();
    },
  });
  return managedElement;
}

function serializeBasesDomTree(node: Node, depth = 0): readonly string[] {
  const indent = '  '.repeat(depth);

  if (node instanceof Text) {
    const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
    return text.length === 0 ? [] : [`${indent}TEXT "${text}"`];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const classSuffix = node.className.trim().length === 0
    ? ''
    : `.${node.className.trim().split(/\s+/).join('.')}`;
  const line = `${indent}${node.tagName}${classSuffix}`;
  const childLines = Array.from(node.childNodes).flatMap((childNode) => serializeBasesDomTree(childNode, depth + 1));
  return [line, ...childLines];
}

function summarizeBasesOption(option: import('@note-studio/plugin').ViewOption): readonly string[] {
  if (option.type === 'group') {
    const nested = option.items.map((item) => `${item.type}:${item.key}:${item.displayName}`);
    return [`group:${option.displayName}:${nested.join('|')}`];
  }

  return [`${option.type}:${option.key}:${option.displayName}`];
}

export class MainProcessUIRegistry implements UIRegistry {
  private readonly entries = new Map<string, RegisteredPluginUiEntry>();
  private readonly listeners = new Set<() => void>();
  private nextEntryId = 0;

  public addRibbonIcon(pluginId: string, spec: import('@note-studio/plugin').RibbonIconSpec): import('@note-studio/plugin').RibbonIconRef {
    const element = createManagedElement('ns-plugin-ribbon-item') as import('@note-studio/plugin').RibbonIconRef;
    const entryId = this.createEntryId(pluginId, 'iconButton');
    element.dataset.pluginId = pluginId;
    element.dataset.icon = spec.icon;
    element.dataset.location = spec.location ?? 'activityBar';
    if (spec.scope?.viewType !== undefined) {
      element.dataset.scopeViewType = spec.scope.viewType;
    }
    if (spec.scope?.fileExtensions !== undefined) {
      element.dataset.scopeFileExtensions = spec.scope.fileExtensions.join(',');
    }
    element.title = spec.title;
    element.setAttribute('role', 'button');
    element.tabIndex = 0;
    element.textContent = spec.title;
    element.addEventListener('click', (event) => {
      void spec.onClick(event as MouseEvent);
    });
    this.track({
      id: entryId,
      pluginId,
      location: spec.location ?? 'activityBar',
      kind: 'iconButton',
      icon: spec.icon,
      scope: spec.scope ?? null,
      element,
    });
    return element;
  }

  public createStatusBarItem(pluginId: string): StatusBarItem {
    const element = createManagedElement('ns-plugin-status-bar-item') as StatusBarItem;
    const entryId = this.createEntryId(pluginId, 'statusBarItem');
    element.dataset.pluginId = pluginId;
    element.dataset.location = 'statusBar';
    element.setText = (text: string): void => {
      element.textContent = text;
      this.emitChanged();
    };
    element.show = (): void => {
      element.hidden = false;
      this.emitChanged();
    };
    element.hide = (): void => {
      element.hidden = true;
      this.emitChanged();
    };
    this.track({
      id: entryId,
      pluginId,
      location: 'statusBar',
      kind: 'statusBarItem',
      icon: null,
      scope: null,
      element,
    });
    return element;
  }

  public getEntries(): readonly PluginUiEntrySnapshot[] {
    return [...this.entries.values()]
      .filter((entry) => entry.element.hidden !== true)
      .map((entry) => {
        const title = this.resolveEntryTitle(entry);
        return {
          id: entry.id,
          pluginId: entry.pluginId,
          location: entry.location,
          kind: entry.kind,
          title,
          tooltip: entry.element.title.trim().length > 0 ? entry.element.title.trim() : null,
          text: entry.kind === 'statusBarItem' ? this.resolveStatusBarText(entry.element) : null,
          icon: entry.icon,
          scope: entry.scope,
        };
      });
  }

  public executeEntry(entryId: string): boolean {
    const entry = this.entries.get(entryId);

    if (entry === undefined) {
      return false;
    }

    entry.element.click();
    return true;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  public clearPlugin(pluginId: string): void {
    for (const entry of [...this.entries.values()]) {
      if (entry.pluginId === pluginId) {
        entry.element.dispose();
      }
    }
  }

  private createEntryId(pluginId: string, kind: PluginUiEntryKind): string {
    this.nextEntryId += 1;
    return `${pluginId}:${kind}:${this.nextEntryId}`;
  }

  private resolveEntryTitle(entry: RegisteredPluginUiEntry): string {
    const title = entry.element.title.trim();

    if (title.length > 0) {
      return title;
    }

    const textContent = entry.element.textContent?.trim() ?? '';
    return textContent.length > 0 ? textContent : entry.pluginId;
  }

  private resolveStatusBarText(element: HTMLElement): string | null {
    const textContent = element.textContent?.trim() ?? '';
    return textContent.length > 0 ? textContent : null;
  }

  private track(entry: RegisteredPluginUiEntry): void {
    const originalDispose = entry.element.dispose.bind(entry.element);
    let disposed = false;

    entry.element.dispose = (): void => {
      if (disposed) {
        return;
      }

      disposed = true;
      originalDispose();
      this.entries.delete(entry.id);
      this.emitChanged();
    };

    this.entries.set(entry.id, entry);
    this.emitChanged();
  }

  private emitChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

export class MainProcessViewRegistry {
  private readonly entries = new Map<string, RegisteredViewEntry>();

  public registerView(pluginId: string, type: string, creator: ViewCreator): Disposable {
    this.entries.set(type, {
      pluginId,
      type,
      creator,
    });

    return createDisposable(() => {
      const current = this.entries.get(type);

      if (current?.creator === creator) {
        this.entries.delete(type);
      }
    });
  }

  public createView(type: string, leaf: import('@note-studio/plugin').WorkspaceLeaf): import('@note-studio/plugin').View | null {
    const entry = this.entries.get(type);
    return entry === undefined ? null : entry.creator(leaf);
  }

  public getCreator(type: string): ViewCreator | null {
    return this.entries.get(type)?.creator ?? null;
  }

  public clearPlugin(pluginId: string): void {
    for (const [type, entry] of [...this.entries.entries()]) {
      if (entry.pluginId === pluginId) {
        this.entries.delete(type);
      }
    }
  }
}

export class MainProcessHoverRegistry {
  private readonly entries = new Map<string, HoverLinkSource>();

  public registerHoverLinkSource(pluginId: string, id: string, source: HoverLinkSource): Disposable {
    const key = `${pluginId}:${id}`;
    this.entries.set(key, source);
    return createDisposable(() => {
      this.entries.delete(key);
    });
  }

  public clearPlugin(pluginId: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(`${pluginId}:`)) {
        this.entries.delete(key);
      }
    }
  }
}

export class MainProcessExtensionRegistry {
  private readonly entries = new Map<string, RegisteredExtensionEntry>();

  public registerExtensions(pluginId: string, extensions: readonly string[], viewType: string): Disposable {
    const ownedKeys: string[] = [];

    for (const extension of extensions) {
      const normalizedExtension = extension.replace(/^\./, '').toLowerCase();
      const key = `${pluginId}:${normalizedExtension}`;
      this.entries.set(key, {
        pluginId,
        extension: normalizedExtension,
        viewType,
      });
      ownedKeys.push(key);
    }

    return createDisposable(() => {
      for (const key of ownedKeys) {
        this.entries.delete(key);
      }
    });
  }

  public getViewTypeForExtension(extension: string): string | null {
    const normalizedExtension = extension.toLowerCase();

    for (const entry of this.entries.values()) {
      if (entry.extension === normalizedExtension) {
        return entry.viewType;
      }
    }

    return null;
  }

  public clearPlugin(pluginId: string): void {
    for (const [key, entry] of [...this.entries.entries()]) {
      if (entry.pluginId === pluginId) {
        this.entries.delete(key);
      }
    }
  }
}

export class MainProcessBasesRegistry {
  private readonly entries = new Map<string, RegisteredBasesEntry>();

  public constructor(private readonly getApp: () => MainProcessAppFacade) {}

  public registerBasesView(
    pluginId: string,
    viewId: string,
    registration: BasesViewRegistration,
  ): Disposable | null {
    const key = `${pluginId}:${viewId}`;
    this.entries.set(key, {
      pluginId,
      viewId,
      registration,
    });
    return createDisposable(() => {
      this.entries.delete(key);
    });
  }

  public async renderRegisteredView(
    pluginId: string,
    viewId: string,
  ): Promise<BasesViewSnapshot | null> {
    const entry = this.entries.get(`${pluginId}:${viewId}`);

    if (entry === undefined) {
      return null;
    }

    const controller = new QueryController(this.getApp());
    const containerEl = document.createElement('div');
    const view = entry.registration.factory(controller, containerEl);

    await invokeComponentLifecycle(controller, COMPONENT_INTERNAL_LOAD, 'onload');
    await invokeComponentLifecycle(view, COMPONENT_INTERNAL_LOAD, 'onload');

    try {
      view.onDataUpdated();

      const datasetEntries = Object.fromEntries(
        Object.entries(containerEl.dataset).filter((entry): entry is [string, string] => entry[1] !== undefined),
      );

      return {
        registrationName: entry.registration.name,
        icon: entry.registration.icon,
        textContent: containerEl.textContent?.trim() ?? '',
        dataset: datasetEntries,
        domSnapshot: serializeBasesDomTree(containerEl),
        optionSummary: (entry.registration.options?.() ?? []).flatMap((option) => summarizeBasesOption(option)),
      };
    } finally {
      await invokeComponentLifecycle(view, COMPONENT_INTERNAL_UNLOAD, 'onunload');
      await invokeComponentLifecycle(controller, COMPONENT_INTERNAL_UNLOAD, 'onunload');
    }
  }

  public clearPlugin(pluginId: string): void {
    for (const [key, entry] of [...this.entries.entries()]) {
      if (entry.pluginId === pluginId) {
        this.entries.delete(key);
      }
    }
  }
}

export class MainProcessMarkdownRegistry {
  private readonly postProcessors = new Map<string, MarkdownPostProcessor>();

  public registerPostProcessor(pluginId: string, postProcessor: MarkdownPostProcessor): Disposable {
    const key = `${pluginId}:post:${this.postProcessors.size + 1}`;
    this.postProcessors.set(key, postProcessor);
    MarkdownPreviewRenderer.registerPostProcessor(postProcessor, postProcessor.sortOrder);
    return createDisposable(() => {
      this.postProcessors.delete(key);
      MarkdownPreviewRenderer.unregisterPostProcessor(postProcessor);
    });
  }

  public registerCodeBlockProcessor(
    pluginId: string,
    language: string,
    handler: MarkdownCodeBlockProcessor,
    postProcessor: MarkdownPostProcessor,
  ): Disposable {
    const actualPostProcessor = MarkdownPreviewRenderer.createCodeBlockPostProcessor(
      language,
      handler,
    ) as MarkdownPostProcessor;
    actualPostProcessor.sortOrder = postProcessor.sortOrder;
    return this.registerPostProcessor(pluginId, actualPostProcessor);
  }

  public clearPlugin(pluginId: string): void {
    for (const [key, postProcessor] of [...this.postProcessors.entries()]) {
      if (key.startsWith(`${pluginId}:`)) {
        this.postProcessors.delete(key);
        MarkdownPreviewRenderer.unregisterPostProcessor(postProcessor);
      }
    }
  }
}

export class MainProcessEditorRegistry {
  private readonly extensions = new Map<string, readonly EditorExtension[]>();
  private readonly suggests = new Map<string, readonly EditorSuggest<SuggestionValue>[]>();

  public registerEditorExtension(pluginId: string, extension: EditorExtension): Disposable {
    const current = this.extensions.get(pluginId) ?? [];
    this.extensions.set(pluginId, [...current, extension]);
    return createDisposable(() => {
      const remaining = (this.extensions.get(pluginId) ?? []).filter((item) => item !== extension);

      if (remaining.length === 0) {
        this.extensions.delete(pluginId);
      } else {
        this.extensions.set(pluginId, remaining);
      }
    });
  }

  public registerEditorSuggest<TValue extends SuggestionValue>(
    pluginId: string,
    editorSuggest: EditorSuggest<TValue>,
  ): Disposable {
    const current = this.suggests.get(pluginId) ?? [];
    this.suggests.set(pluginId, [...current, editorSuggest as EditorSuggest<SuggestionValue>]);
    return createDisposable(() => {
      const remaining = (this.suggests.get(pluginId) ?? []).filter((item) => item !== editorSuggest);

      if (remaining.length === 0) {
        this.suggests.delete(pluginId);
      } else {
        this.suggests.set(pluginId, remaining);
      }
    });
  }

  public clearPlugin(pluginId: string): void {
    this.extensions.delete(pluginId);
    this.suggests.delete(pluginId);
  }
}

export class MainProcessProtocolRegistry {
  private readonly handlers = new Map<string, {
    readonly pluginId: string;
    readonly action: string;
    readonly handler: AppProtocolHandler;
  }>();

  public registerAppProtocolHandler(pluginId: string, action: string, handler: AppProtocolHandler): Disposable {
    const key = `${pluginId}:${action}`;
    this.handlers.set(key, {
      pluginId,
      action,
      handler,
    });
    return createDisposable(() => {
      this.handlers.delete(key);
    });
  }

  public async dispatchProtocol(data: AppProtocolData): Promise<boolean> {
    const match = [...this.handlers.values()]
      .filter((entry) => entry.action === data.action)
      .at(-1);

    if (match === undefined) {
      return false;
    }

    await match.handler(data);
    return true;
  }

  public clearPlugin(pluginId: string): void {
    for (const key of [...this.handlers.keys()]) {
      if (key.startsWith(`${pluginId}:`)) {
        this.handlers.delete(key);
      }
    }
  }
}

export class MainProcessPluginRuntime {
  public readonly commands: MainProcessCommandRegistry;
  public readonly data: MainProcessDataStore;
  public readonly settings: MainProcessSettingsRegistry;
  public readonly ui: MainProcessUIRegistry;
  public readonly views: MainProcessViewRegistry;
  public readonly hover: MainProcessHoverRegistry;
  public readonly extensions: MainProcessExtensionRegistry;
  public readonly bases: MainProcessBasesRegistry;
  public readonly markdown: MainProcessMarkdownRegistry;
  public readonly editors: MainProcessEditorRegistry;
  public readonly protocols: MainProcessProtocolRegistry;
  public readonly app: MainProcessAppFacade;

  public constructor(dependencies: MainProcessAppFacadeDependencies) {
    this.views = new MainProcessViewRegistry();
    this.extensions = new MainProcessExtensionRegistry();
    this.commands = new MainProcessCommandRegistry(() => this.app);
    this.data = new MainProcessDataStore(dependencies.settingsManager);
    this.settings = new MainProcessSettingsRegistry();
    this.ui = new MainProcessUIRegistry();
    this.hover = new MainProcessHoverRegistry();
    this.bases = new MainProcessBasesRegistry(() => this.app);
    this.markdown = new MainProcessMarkdownRegistry();
    this.editors = new MainProcessEditorRegistry();
    this.protocols = new MainProcessProtocolRegistry();

    this.app = new MainProcessAppFacade({
      ...dependencies,
      resolveViewCreator: (type: string) => this.views.getCreator(type),
      resolveViewTypeForExtension: (extension: string) => this.extensions.getViewTypeForExtension(extension),
    });

    const runtimeHost = this.getHostBridge();
    Object.defineProperty(this.app, '__pluginRuntime', {
      configurable: true,
      enumerable: false,
      value: runtimeHost,
    });
  }

  public getHostBridge(): PluginRuntimeHostBridge {
    return {
      bases: this.bases,
      commands: this.commands,
      data: this.data,
      editors: this.editors,
      extensions: this.extensions,
      hover: this.hover,
      markdown: this.markdown,
      protocols: this.protocols,
      settings: this.settings,
      ui: this.ui,
      views: this.views,
    };
  }

  public getCommandContributions(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly WorkbenchCommandContributionEntry[] {
    return this.commands.getCommandContributions(resolvePluginDisplayName);
  }

  public getSettingTabSummaries(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly PluginSettingTabSummary[] {
    return this.settings.getSettingTabSummaries(resolvePluginDisplayName);
  }

  public clearPlugin(pluginId: string): void {
    this.commands.clearPlugin(pluginId);
    this.settings.clearPlugin(pluginId);
    this.ui.clearPlugin(pluginId);
    this.views.clearPlugin(pluginId);
    this.hover.clearPlugin(pluginId);
    this.extensions.clearPlugin(pluginId);
    this.bases.clearPlugin(pluginId);
    this.markdown.clearPlugin(pluginId);
    this.editors.clearPlugin(pluginId);
    this.protocols.clearPlugin(pluginId);
  }
}
