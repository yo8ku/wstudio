/**
 * Abstract plugin base class exposed to third-party plugin authors.
 */

import { Component } from './Component';
import { Notice } from './Notice';
import type { PluginSettingTab } from './SettingTab';
import type { EditorSuggest } from './Suggest';
import {
  COMPONENT_INTERNAL_LOAD,
  COMPONENT_INTERNAL_UNLOAD,
  PLUGIN_INTERNAL_DISABLE,
  PLUGIN_INTERNAL_ENABLE,
  PLUGIN_INTERNAL_FAIL,
  PLUGIN_INTERNAL_GET_SNAPSHOT,
  PLUGIN_INTERNAL_LOAD,
  PLUGIN_INTERNAL_UNLOAD,
} from '../internal/runtime';
import type { App } from '../types/app';
import type { BasesViewRegistration } from '../types/bases';
import type { Command } from '../types/command';
import type { CommandRegistry } from '../types/command';
import type { PluginDataStore } from '../types/data';
import type { Disposable } from '../types/disposable';
import type { EditorExtension } from '../types/editor';
import type { JsonValue } from '../types/json';
import type {
  MarkdownCodeBlockProcessor,
  MarkdownPostProcessor,
} from '../types/markdown';
import type { PluginUiActionHandler } from '../types/plugin-ui-runtime';
import type { AppProtocolHandler } from '../types/protocol';
import type { HoverLinkSource } from '../types/render';
import type {
  ResourceExplorerItemRegistration,
  ResourceExplorerItemRegistry,
} from '../types/resource-explorer';
import type { SettingsRegistry } from '../types/settings';
import type { SuggestionValue } from '../types/suggest';
import {
  PluginLifecycleError,
  type PluginFailureContext,
  type PluginLifecycleOperation,
  type PluginLifecycleSnapshot,
  type PluginLifecycleState,
} from '../types/lifecycle';
import type { PluginManifest } from '../types/manifest';
import type { IconName, RibbonIconOptions, StatusBarItem, UIRegistry } from '../types/ui';
import type { ViewCreator } from '../types/view';

interface PluginTransition {
  readonly operation: PluginLifecycleOperation;
  readonly allowedStates: readonly PluginLifecycleState[];
  readonly pendingState: PluginLifecycleState;
  readonly successState: PluginLifecycleState;
  readonly execute: () => Promise<void>;
}

function normalizeError(error: Error | null, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

interface PluginViewRegistry {
  registerView(pluginId: string, type: string, viewCreator: ViewCreator): Disposable;
}

interface PluginHoverRegistry {
  registerHoverLinkSource(
    pluginId: string,
    id: string,
    source: HoverLinkSource,
  ): Disposable;
}

interface PluginExtensionRegistry {
  registerExtensions(pluginId: string, extensions: readonly string[], viewType: string): Disposable;
}

interface PluginBasesRegistry {
  registerBasesView(
    pluginId: string,
    viewId: string,
    registration: BasesViewRegistration,
  ): Disposable | null;
}

interface PluginMarkdownRegistry {
  registerPostProcessor(pluginId: string, postProcessor: MarkdownPostProcessor): Disposable;
  registerCodeBlockProcessor(
    pluginId: string,
    language: string,
    handler: MarkdownCodeBlockProcessor,
    postProcessor: MarkdownPostProcessor,
  ): Disposable;
}

interface PluginEditorRegistry {
  registerEditorExtension(pluginId: string, extension: EditorExtension): Disposable;
  registerEditorSuggest<TValue extends SuggestionValue>(
    pluginId: string,
    editorSuggest: EditorSuggest<TValue>,
  ): Disposable;
}

interface PluginProtocolRegistry {
  registerAppProtocolHandler(
    pluginId: string,
    action: string,
    handler: AppProtocolHandler,
  ): Disposable;
}

interface PluginUiLogicRegistry {
  registerUiAction(
    pluginId: string,
    actionId: string,
    handler: PluginUiActionHandler,
  ): Disposable;
}

interface PluginRuntimeHost {
  readonly bases: PluginBasesRegistry;
  readonly commands: CommandRegistry;
  readonly data: PluginDataStore;
  readonly editors: PluginEditorRegistry;
  readonly extensions: PluginExtensionRegistry;
  readonly hover: PluginHoverRegistry;
  readonly logic: PluginUiLogicRegistry;
  readonly markdown: PluginMarkdownRegistry;
  readonly protocols: PluginProtocolRegistry;
  readonly resourceExplorer: ResourceExplorerItemRegistry;
  readonly settings: SettingsRegistry;
  readonly ui: UIRegistry;
  readonly views: PluginViewRegistry;
}

interface PluginRuntimeApp extends App {
  readonly __pluginRuntime: PluginRuntimeHost;
}

export abstract class Plugin extends Component {
  public readonly app: App;
  public readonly manifest: PluginManifest;

  private lifecycleState: PluginLifecycleState = 'created';
  private lastFailure: PluginFailureContext | null = null;

  public constructor(app: App, manifest: PluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }

  private get runtime(): PluginRuntimeHost {
    return (this.app as PluginRuntimeApp).__pluginRuntime;
  }

  addRibbonIcon(
    icon: IconName,
    title: string,
    onClick: (evt: MouseEvent) => Promise<void> | void,
    options?: RibbonIconOptions,
  ): HTMLElement {
    const ribbonIcon = this.runtime.ui.addRibbonIcon(this.manifest.id, {
      id: options?.id,
      icon,
      title,
      onClick,
      location: options?.location,
      scope: options?.scope,
    });

    this.registerDisposable(ribbonIcon);

    return ribbonIcon;
  }

  addStatusBarItem(): StatusBarItem {
    const statusBarItem = this.runtime.ui.createStatusBarItem(this.manifest.id);
    this.registerDisposable(statusBarItem);
    return statusBarItem;
  }

  addCommand(command: Command): Command {
    this.registerDisposable(this.runtime.commands.registerCommand(this.manifest.id, command));
    return command;
  }

  removeCommand(commandId: string): void {
    this.runtime.commands.removeCommand(commandId);
  }

  registerUiAction(actionId: string, handler: PluginUiActionHandler): void {
    this.registerDisposable(
      this.runtime.logic.registerUiAction(this.manifest.id, actionId, handler),
    );
  }

  addSettingTab<TSettingTab extends PluginSettingTab<this>>(settingTab: TSettingTab): void {
    this.registerDisposable(this.runtime.settings.registerSettingTab(this.manifest.id, settingTab));
  }

  registerView(type: string, viewCreator: ViewCreator): void {
    this.registerDisposable(this.runtime.views.registerView(this.manifest.id, type, viewCreator));
  }

  registerResourceExplorerItem(
    itemId: string,
    registration: ResourceExplorerItemRegistration,
  ): void {
    this.registerDisposable(
      this.runtime.resourceExplorer.registerResourceExplorerItem(
        this.manifest.id,
        itemId,
        registration,
      ),
    );
  }

  registerHoverLinkSource(id: string, source: HoverLinkSource): void {
    this.registerDisposable(this.runtime.hover.registerHoverLinkSource(this.manifest.id, id, source));
  }

  registerHoverPreviewSource(id: string, source: HoverLinkSource): void {
    this.registerHoverLinkSource(id, source);
  }

  registerExtensions(extensions: readonly string[], viewType: string): void {
    this.registerDisposable(this.runtime.extensions.registerExtensions(this.manifest.id, extensions, viewType));
  }

  registerBasesView(viewId: string, registration: BasesViewRegistration): boolean {
    const disposable = this.runtime.bases.registerBasesView(this.manifest.id, viewId, registration);

    if (disposable === null) {
      return false;
    }

    this.registerDisposable(disposable);
    return true;
  }

  registerMarkdownPostProcessor(
    postProcessor: MarkdownPostProcessor,
    sortOrder?: number,
  ): MarkdownPostProcessor {
    if (sortOrder !== undefined) {
      postProcessor.sortOrder = sortOrder;
    }

    this.registerDisposable(this.runtime.markdown.registerPostProcessor(this.manifest.id, postProcessor));
    return postProcessor;
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    handler: MarkdownCodeBlockProcessor,
    sortOrder?: number,
  ): MarkdownPostProcessor {
    const postProcessor: MarkdownPostProcessor = () => undefined;

    if (sortOrder !== undefined) {
      postProcessor.sortOrder = sortOrder;
    }

    this.registerDisposable(
      this.runtime.markdown.registerCodeBlockProcessor(
        this.manifest.id,
        language,
        handler,
        postProcessor,
      ),
    );
    return postProcessor;
  }

  registerEditorExtension(extension: EditorExtension): void {
    this.registerDisposable(this.runtime.editors.registerEditorExtension(this.manifest.id, extension));
  }

  registerEditorSuggest<TValue extends SuggestionValue>(
    editorSuggest: EditorSuggest<TValue>,
  ): void {
    this.registerDisposable(
      this.runtime.editors.registerEditorSuggest(this.manifest.id, editorSuggest),
    );
  }

  registerAppProtocolHandler(action: string, handler: AppProtocolHandler): void {
    this.registerDisposable(
      this.runtime.protocols.registerAppProtocolHandler(this.manifest.id, action, handler),
    );
  }

  registerObsidianProtocolHandler(action: string, handler: AppProtocolHandler): void {
    this.registerAppProtocolHandler(action, handler);
  }

  loadData<TData extends JsonValue = JsonValue>(): Promise<TData | null> {
    return this.runtime.data.loadData<TData>(this.manifest.id);
  }

  saveData<TData extends JsonValue>(data: TData): Promise<void> {
    return this.runtime.data.saveData(this.manifest.id, data);
  }

  public async [PLUGIN_INTERNAL_LOAD](): Promise<void> {
    await this.runTransition({
      operation: 'load',
      allowedStates: ['created', 'unloaded'],
      pendingState: 'loading',
      successState: 'loaded',
      execute: async () => {
        await this[COMPONENT_INTERNAL_LOAD]();
      },
    });
  }

  public async [PLUGIN_INTERNAL_ENABLE](): Promise<void> {
    await this.runTransition({
      operation: 'enable',
      allowedStates: ['loaded', 'disabled'],
      pendingState: 'enabling',
      successState: 'enabled',
      execute: async () => {
        await this.onEnable();
      },
    });
  }

  public async [PLUGIN_INTERNAL_DISABLE](): Promise<void> {
    await this.runTransition({
      operation: 'disable',
      allowedStates: ['enabled'],
      pendingState: 'disabling',
      successState: 'disabled',
      execute: async () => {
        await this.onDisable();
      },
    });
  }

  public async [PLUGIN_INTERNAL_UNLOAD](): Promise<void> {
    if (this.lifecycleState === 'enabled') {
      await this[PLUGIN_INTERNAL_DISABLE]();
    }

    await this.runTransition({
      operation: 'unload',
      allowedStates: ['loaded', 'disabled', 'failed'],
      pendingState: 'unloading',
      successState: 'unloaded',
      execute: async () => {
        await this[COMPONENT_INTERNAL_UNLOAD]();
      },
    });
  }

  public async [PLUGIN_INTERNAL_FAIL](error: Error): Promise<PluginFailureContext> {
    return this.recordFailure('fail', error);
  }

  public [PLUGIN_INTERNAL_GET_SNAPSHOT](): PluginLifecycleSnapshot {
    return {
      manifest: this.manifest,
      state: this.lifecycleState,
      lastFailure: this.lastFailure,
    };
  }

  public abstract override onload(): Promise<void> | void;

  public abstract override onunload(): Promise<void> | void;

  public abstract onEnable(): Promise<void> | void;

  public abstract onDisable(): Promise<void> | void;

  public abstract onFailed(failure: PluginFailureContext): Promise<void> | void;

  public onUserEnable(): Promise<void> | void {
    return undefined;
  }

  public onExternalSettingsChange?(): Promise<void> | void;

  private async runTransition(transition: PluginTransition): Promise<void> {
    this.assertOperationAllowed(transition.operation, transition.allowedStates);
    this.lifecycleState = transition.pendingState;

    try {
      await transition.execute();
      this.lastFailure = null;
      this.lifecycleState = transition.successState;
    } catch (error) {
      const normalizedError = normalizeError(
        error instanceof Error ? error : null,
        `Plugin "${this.manifest.id}" failed during "${transition.operation}".`,
      );
      await this.recordFailure(transition.operation, normalizedError);
      throw normalizedError;
    }
  }

  private assertOperationAllowed(
    operation: PluginLifecycleOperation,
    allowedStates: readonly PluginLifecycleState[],
  ): void {
    if (allowedStates.includes(this.lifecycleState)) {
      return;
    }

    throw new PluginLifecycleError(this.manifest.id, operation, this.lifecycleState, allowedStates);
  }

  private async recordFailure(
    operation: PluginLifecycleOperation,
    error: Error,
  ): Promise<PluginFailureContext> {
    const failure: PluginFailureContext = {
      pluginId: this.manifest.id,
      pluginName: this.manifest.name,
      operation,
      state: this.lifecycleState,
      error,
    };

    this.lastFailure = failure;
    this.lifecycleState = 'failed';

    try {
      await this.onFailed(failure);
    } catch (failureHandlerError) {
      const normalizedFailureHandlerError = normalizeError(
        failureHandlerError instanceof Error ? failureHandlerError : null,
        `Plugin "${this.manifest.id}" failed while handling its failure state.`,
      );
      new Notice(normalizedFailureHandlerError.message);
    }

    return failure;
  }
}
