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
import { getRegisteredIconSvgContent } from '@note-studio/plugin/internal/icons';
import type { PluginDataStore } from '@note-studio/plugin/types/data';
import type { SettingsRegistry } from '@note-studio/plugin/types/settings';
import type { ViewOption } from '@note-studio/plugin/types/bases';
import type {
  JsonValue as SharedJsonValue,
  PluginUiEntryKind,
  PluginUiEntrySnapshot,
  PluginUiRuntimeSurfaceDescriptor,
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
import { runWithPluginExecutionContext } from './pluginExecutionContext';
import type { PluginSupervisorCommandSnapshot } from './pluginSupervisorProtocol';

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

function resolvePluginUiEntryIconSvg(iconId: string | null): string | null {
  const normalizedIconId = iconId?.trim() ?? '';

  if (normalizedIconId.length === 0) {
    return null;
  }

  const iconSvgContent = getRegisteredIconSvgContent(normalizedIconId);

  if (iconSvgContent === null) {
    return null;
  }

  return iconSvgContent.trim().length > 0 ? iconSvgContent : null;
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
  readonly title: string;
  readonly icon: string | null;
  readonly scope: PluginUiEntryScope | null;
  readonly element: HTMLElement & Disposable;
  readonly execute: (() => Promise<void>) | null;
}

export interface BasesViewSnapshot {
  readonly registrationName: string;
  readonly icon: string;
  readonly textContent: string;
  readonly dataset: Readonly<Record<string, string>>;
  readonly optionSummary: readonly string[];
}

const GLOBAL_SETTING_TAB_INTERNAL_ATTACH = Symbol.for('wstudio.settingTab.internal.attach');

export class MainProcessCommandRegistry implements CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommandEntry>();
  private readonly listeners = new Set<() => void>();

  public constructor(private readonly getApp: () => MainProcessAppFacade) {}

  public registerCommand(pluginId: string, command: Command): Disposable {
    const qualifiedId = `${pluginId}:${command.id}`;
    this.commands.set(qualifiedId, {
      pluginId,
      qualifiedId,
      command,
    });
    this.emitChanged();

    return createDisposable(() => {
      this.commands.delete(qualifiedId);
      this.emitChanged();
    });
  }

  public removeCommand(commandId: string): void {
    if (this.commands.delete(commandId)) {
      this.emitChanged();
      return;
    }

    let changed = false;

    for (const [qualifiedId, entry] of [...this.commands.entries()]) {
      if (entry.command.id === commandId) {
        this.commands.delete(qualifiedId);
        changed = true;
      }
    }

    if (changed) {
      this.emitChanged();
    }
  }

  public async executeCommand(commandId: string): Promise<void> {
    await this.tryExecuteCommand(commandId);
  }

  public shouldPreferSupervisorExecution(commandId: string): boolean {
    const entry = this.resolveCommand(commandId);

    if (entry === null) {
      return false;
    }

    return entry.command.editorCallback === undefined
      && entry.command.editorCheckCallback === undefined;
  }

  public async tryExecuteCommand(commandId: string): Promise<boolean> {
    const entry = this.resolveCommand(commandId);

    if (entry === null) {
      return false;
    }

    if (entry.command.checkCallback !== undefined) {
      const allowed = await runWithPluginExecutionContext(entry.pluginId, () => {
        return entry.command.checkCallback?.(false) ?? true;
      });

      if (allowed === false) {
        return true;
      }
    }

    if (entry.command.callback !== undefined) {
      await runWithPluginExecutionContext(entry.pluginId, () => {
        return entry.command.callback?.();
      });
      return true;
    }

    if (entry.command.editorCallback === undefined && entry.command.editorCheckCallback === undefined) {
      return true;
    }

    const activeEditor = await this.getApp().workspace.refreshActiveEditorState();

    if (activeEditor === null || activeEditor.editor === undefined) {
      return true;
    }

    const activeEditorInstance = activeEditor.editor;

    if (entry.command.editorCheckCallback !== undefined) {
      const allowed = await runWithPluginExecutionContext(entry.pluginId, () => {
        return entry.command.editorCheckCallback?.(false, activeEditorInstance, activeEditor) ?? true;
      });

      if (allowed === false) {
        return true;
      }
    }

    if (entry.command.editorCallback !== undefined) {
      await runWithPluginExecutionContext(entry.pluginId, () => {
        return entry.command.editorCallback?.(activeEditorInstance, activeEditor);
      });
    }

    return true;
  }

  public clearPlugin(pluginId: string): void {
    let changed = false;

    for (const [qualifiedId, entry] of [...this.commands.entries()]) {
      if (entry.pluginId === pluginId) {
        this.commands.delete(qualifiedId);
        changed = true;
      }
    }

    if (changed) {
      this.emitChanged();
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

  public getSupervisorCommandSnapshots(): readonly PluginSupervisorCommandSnapshot[] {
    return [...this.commands.values()].map((entry) => ({
      pluginId: entry.pluginId,
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

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChanged(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
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

    runWithPluginExecutionContext(pluginId, () => {
      attach.call(settingTab, document.createElement('div'));
    });
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
        const constructorName = entry.settingTab.constructor.name.trim();
        const title = constructorName.length > 0
          ? constructorName
          : resolvePluginDisplayName(pluginId);

        result.push({
          id: entry.id,
          pluginId,
          pluginName: resolvePluginDisplayName(pluginId),
          title,
          preview: null,
          previewLines: [],
          runtimeSurface: null,
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

function summarizeBasesOption(option: ViewOption): readonly string[] {
  if (option.type === 'group') {
    const groupLabel = option.displayName.trim();
    const groupLines = groupLabel.length > 0 ? [groupLabel] : [];
    return [...groupLines, ...option.items.flatMap((item) => summarizeBasesOption(item))];
  }

  const line = option.displayName.trim();
  return line.length > 0 ? [line] : [];
}

export class MainProcessUIRegistry implements UIRegistry {
  private readonly entries = new Map<string, RegisteredPluginUiEntry>();
  private readonly listeners = new Set<() => void>();
  private nextEntryId = 0;

  public addRibbonIcon(
    pluginId: string,
    spec: {
      readonly icon: string;
      readonly title: string;
      readonly onClick: (evt: MouseEvent) => Promise<void> | void;
      readonly location?: PluginUiEntryLocation;
      readonly scope?: PluginUiEntryScope;
    },
  ): HTMLElement & Disposable {
    this.nextEntryId += 1;
    const id = `${pluginId}:ui:${this.nextEntryId}`;
    const element = createManagedElement('ns-plugin-ui-entry');
    element.title = spec.title;
    this.entries.set(id, {
      id,
      pluginId,
      location: spec.location ?? 'activityBar',
      kind: 'iconButton',
      title: spec.title,
      icon: spec.icon,
      scope: spec.scope ?? null,
      element,
      execute: async () => {
        await runWithPluginExecutionContext(pluginId, () => spec.onClick(new MouseEvent('click')));
      },
    });
    this.emitChanged();
    return Object.assign(element, {
      dispose: (): void => {
        element.remove();
        this.entries.delete(id);
        this.emitChanged();
      },
    });
  }

  public createStatusBarItem(pluginId: string): StatusBarItem {
    this.nextEntryId += 1;
    const id = `${pluginId}:ui:${this.nextEntryId}`;
    const element = createManagedElement('ns-plugin-status-bar-item');
    this.entries.set(id, {
      id,
      pluginId,
      location: 'statusBar',
      kind: 'statusBarItem',
      title: '',
      icon: null,
      scope: null,
      element,
      execute: null,
    });
    this.emitChanged();
    return Object.assign(element, {
      setText: (text: string): void => {
        element.textContent = text;
        this.emitChanged();
      },
      show: (): void => {
        element.hidden = false;
        this.emitChanged();
      },
      hide: (): void => {
        element.hidden = true;
        this.emitChanged();
      },
      dispose: (): void => {
        element.remove();
        this.entries.delete(id);
        this.emitChanged();
      },
    });
  }

  public getEntries(): readonly PluginUiEntrySnapshot[] {
    return [...this.entries.values()]
      .filter((entry) => entry.element.hidden === false)
      .map((entry) => ({
        id: entry.id,
        pluginId: entry.pluginId,
        location: entry.location,
        kind: entry.kind,
        title: entry.title,
        tooltip: entry.title.length > 0 ? entry.title : null,
        text: entry.kind === 'statusBarItem' ? entry.element.textContent?.trim() ?? '' : null,
        icon: entry.icon,
        iconSvg: resolvePluginUiEntryIconSvg(entry.icon),
        scope: entry.scope,
      }));
  }

  public async executeEntry(entryId: string): Promise<boolean> {
    const entry = this.entries.get(entryId);

    if (entry === undefined || entry.execute === null) {
      return false;
    }

    await entry.execute();
    return true;
  }

  public clearPlugin(pluginId: string): void {
    let changed = false;

    for (const [id, entry] of [...this.entries.entries()]) {
      if (entry.pluginId !== pluginId) {
        continue;
      }

      entry.element.remove();
      this.entries.delete(id);
      changed = true;
    }

    if (changed) {
      this.emitChanged();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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

  public getCreator(type: string): ViewCreator | null {
    return this.entries.get(type)?.creator ?? null;
  }

  public getPluginId(type: string): string | null {
    return this.entries.get(type)?.pluginId ?? null;
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
  private readonly sources = new Map<string, HoverLinkSource>();

  public registerHoverLinkSource(pluginId: string, id: string, source: HoverLinkSource): Disposable {
    const key = `${pluginId}:${id}`;
    this.sources.set(key, source);
    return createDisposable(() => {
      this.sources.delete(key);
    });
  }

  public clearPlugin(pluginId: string): void {
    for (const key of [...this.sources.keys()]) {
      if (key.startsWith(`${pluginId}:`)) {
        this.sources.delete(key);
      }
    }
  }
}

export class MainProcessExtensionRegistry {
  private readonly entries = new Map<string, RegisteredExtensionEntry>();

  public registerExtensions(pluginId: string, extensions: readonly string[], viewType: string): Disposable {
    const normalizedExtensions = extensions
      .map((extension) => extension.trim().toLowerCase())
      .filter((extension) => extension.length > 0);

    for (const extension of normalizedExtensions) {
      this.entries.set(extension, {
        pluginId,
        extension,
        viewType,
      });
    }

    return createDisposable(() => {
      for (const extension of normalizedExtensions) {
        const current = this.entries.get(extension);
        if (current?.pluginId === pluginId && current.viewType === viewType) {
          this.entries.delete(extension);
        }
      }
    });
  }

  public getViewTypeForExtension(extension: string): string | null {
    return this.entries.get(extension.trim().toLowerCase())?.viewType ?? null;
  }

  public clearPlugin(pluginId: string): void {
    for (const [extension, entry] of [...this.entries.entries()]) {
      if (entry.pluginId === pluginId) {
        this.entries.delete(extension);
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

  public getRegisteredSuggests(): readonly {
    readonly pluginId: string;
    readonly editorSuggest: EditorSuggest<SuggestionValue>;
  }[] {
    const entries: Array<{
      readonly pluginId: string;
      readonly editorSuggest: EditorSuggest<SuggestionValue>;
    }> = [];

    for (const [pluginId, suggests] of this.suggests.entries()) {
      for (const editorSuggest of suggests) {
        entries.push({
          pluginId,
          editorSuggest,
        });
      }
    }

    return entries;
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

    await runWithPluginExecutionContext(match.pluginId, () => {
      return match.handler(data);
    });
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
      resolveViewCreator: (type: string) => this.views.getCreator(type) ?? dependencies.resolveViewCreator(type),
      resolveViewPluginId: (type: string) => this.views.getPluginId(type) ?? dependencies.resolveViewPluginId(type),
      resolveViewTypeForExtension: (extension: string) => {
        return this.extensions.getViewTypeForExtension(extension) ?? dependencies.resolveViewTypeForExtension(extension);
      },
      resolveViewRuntimeSurface: (type: string): PluginUiRuntimeSurfaceDescriptor | null => {
        return dependencies.resolveViewRuntimeSurface(type);
      },
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
