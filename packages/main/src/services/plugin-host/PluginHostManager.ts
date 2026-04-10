/**
 * Main-process plugin host manager stage 2.
 * It loads plugin entry modules, instantiates plugins, and drives lifecycle transitions against the host runtime bridge.
 */

import Module = require('node:module');
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as PluginSdk from '@note-studio/plugin';
import {
  Plugin,
  type AppProtocolData,
  type PluginConstructor,
  type PluginFailureContext,
  type PluginReleaseChannel,
} from '@note-studio/plugin';
import {
  PLUGIN_INTERNAL_ENABLE,
  PLUGIN_INTERNAL_FAIL,
  PLUGIN_INTERNAL_GET_SNAPSHOT,
  PLUGIN_INTERNAL_LOAD,
  PLUGIN_INTERNAL_UNLOAD,
} from '@note-studio/plugin/internal/runtime';
import type { PluginLifecycleSnapshot } from '@note-studio/plugin';
import type {
  AIPanelContributionEntry,
  JsonValue,
  PluginUiEntrySnapshot,
  WorkbenchContributionSnapshot,
} from '@note-studio/shared';
import { EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT } from '@note-studio/shared';
import { installMainProcessDomShim } from './MainProcessDomShim';
import { MainProcessPluginRuntime } from './MainProcessPluginRuntime';
import { PluginDiscoveryService } from './PluginDiscoveryService';
import type {
  InstalledPluginSummary,
  MainProcessEditorBridge,
  PluginDescriptor,
  PluginSettingTabSummary,
} from './types';
import type { MainProcessAppFacadeDependencies } from './MainProcessAppFacade';
import {
  closePluginRuntimeMenu,
  closePluginRuntimeModal,
  closePluginRuntimeSuggestModal,
  configurePluginRuntimeViewRequestBridge,
  emitPluginRuntimeNotice,
  openPluginRuntimeMenu,
  openPluginRuntimeModal,
  openPluginRuntimeSuggestModal,
  updatePluginRuntimeSuggestModal,
} from '../../ipc/pluginRuntimeHandlers';

interface PluginModuleNamespace {
  readonly default?: PluginConstructor;
}

interface LoadedPluginRecord {
  readonly descriptor: PluginDescriptor;
  readonly instance: Plugin;
  readonly snapshot: PluginLifecycleSnapshot;
}

type ModuleWithInternals = typeof Module & {
  _load(request: string, parent: NodeJS.Module | null, isMain: boolean): object;
};

type PluginLifecycleVoidMethod = () => Promise<void>;
type PluginFailureMethod = (error: Error) => Promise<PluginFailureContext>;
type PluginSnapshotMethod = () => PluginLifecycleSnapshot;
type PluginInternalMethod =
  | PluginLifecycleVoidMethod
  | PluginFailureMethod
  | PluginSnapshotMethod;

export interface PluginHostManagerDependencies {
  readonly settingsManager: MainProcessAppFacadeDependencies['settingsManager'];
  readonly workspaceManager: MainProcessAppFacadeDependencies['workspaceManager'];
  readonly editorBridge: MainProcessEditorBridge;
}

function toPluginAssetUrl(
  descriptor: PluginDescriptor,
  assetPath: string | null,
): string | null {
  if (assetPath === null) {
    return null;
  }

  const relativeAssetPath = path.relative(descriptor.rootDirectory, assetPath);

  if (
    relativeAssetPath.length === 0
    || relativeAssetPath.startsWith('..')
    || path.isAbsolute(relativeAssetPath)
  ) {
    return null;
  }

  const encodedAssetPath = relativeAssetPath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `wstudio-extension://${encodeURIComponent(descriptor.manifest.id)}/${encodedAssetPath}`;
}

function toLocalFileAssetUrl(assetPath: string | null): string | null {
  if (assetPath === null) {
    return null;
  }

  const normalizedAbsolutePath = path.resolve(assetPath).replace(/\\/g, '/');
  const encodedPath = normalizedAbsolutePath
    .split('/')
    .map((segment, index) => {
      if (segment.length === 0) {
        return index === 0 ? '' : segment;
      }

      return /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment);
    })
    .join('/');
  const protocolPath = encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`;

  return `local-file://${protocolPath}`;
}

function descriptorToInstalledPluginSummary(
  descriptor: PluginDescriptor,
  enabled: boolean,
  failureMessage: string | null,
): InstalledPluginSummary {
  const releaseChannel: PluginReleaseChannel = descriptor.manifest.releaseChannel ?? 'stable';

  return {
    id: descriptor.manifest.id,
    name: descriptor.manifest.name,
    version: descriptor.manifest.version,
    publisher: descriptor.manifest.author,
    description: descriptor.manifest.description,
    fundingUrl: descriptor.manifest.fundingUrl ?? null,
    iconPath: toPluginAssetUrl(descriptor, descriptor.iconPath),
    releaseChannel,
    enabled,
    failureMessage,
  };
}

function normalizeError(error: Error | null, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

let pluginSdkAliasInstalled = false;
const HOST_PLUGIN_SDK_ALIASES = new Set<string>([
  '@note-studio/plugin',
  'wstudio-api',
]);
const GLOBAL_PLUGIN_INTERNAL_LOAD = Symbol.for('wstudio.plugin.internal.load');
const GLOBAL_PLUGIN_INTERNAL_ENABLE = Symbol.for('wstudio.plugin.internal.enable');
const GLOBAL_PLUGIN_INTERNAL_UNLOAD = Symbol.for('wstudio.plugin.internal.unload');
const GLOBAL_PLUGIN_INTERNAL_FAIL = Symbol.for('wstudio.plugin.internal.fail');
const GLOBAL_PLUGIN_INTERNAL_GET_SNAPSHOT = Symbol.for('wstudio.plugin.internal.getSnapshot');

function resolvePluginMethod<TMethod extends PluginInternalMethod>(
  instance: Plugin,
  primaryKey: symbol,
  fallbackKey: symbol,
): TMethod | null {
  const methodBag = instance as Plugin & Partial<Record<symbol, PluginInternalMethod>>;
  const candidate = methodBag[primaryKey] ?? methodBag[fallbackKey];
  return typeof candidate === 'function' ? candidate as TMethod : null;
}

function installPluginSdkAlias(): void {
  if (pluginSdkAliasInstalled) {
    return;
  }

  const moduleWithInternals = Module as ModuleWithInternals;
  const originalLoad = moduleWithInternals._load.bind(Module);

  moduleWithInternals._load = (
    request: string,
    parent: NodeJS.Module | null,
    isMain: boolean,
  ): object => {
    if (HOST_PLUGIN_SDK_ALIASES.has(request)) {
      return PluginSdk;
    }

    return originalLoad(request, parent, isMain);
  };

  pluginSdkAliasInstalled = true;
}

interface PluginHostUiBridgeOwner {
  __wstudioPluginHostUiBridge?: {
    showNotice(payload: {
      readonly message: string;
      readonly level: 'success' | 'error' | 'warning' | 'info';
    }): void;
    openModal(payload: {
      readonly title: string;
      readonly description: string | null;
    }): void;
    closeModal(): void;
    openSuggestModal(payload: {
      readonly title: string;
      readonly placeholder: string;
      readonly query: string;
      readonly emptyStateText: string;
      readonly instructions: readonly {
        readonly command: string;
        readonly purpose: string;
      }[];
      readonly items: readonly {
        readonly id: string;
        readonly title: string;
        readonly description: string | null;
      }[];
      readonly onQueryChange: (query: string) => Promise<void> | void;
      readonly onSelect: (itemId: string) => void;
      readonly onClose?: () => void;
    }): string;
    updateSuggestModal(payload: {
      readonly modalId: string;
      readonly title: string;
      readonly placeholder: string;
      readonly query: string;
      readonly emptyStateText: string;
      readonly instructions: readonly {
        readonly command: string;
        readonly purpose: string;
      }[];
      readonly items: readonly {
        readonly id: string;
        readonly title: string;
        readonly description: string | null;
      }[];
    }): void;
    closeSuggestModal(modalId: string): void;
    openMenu(payload: {
      readonly items: readonly {
        readonly id: string;
        readonly title: string;
        readonly icon: string | null;
        readonly checked: boolean | null;
        readonly disabled: boolean;
        readonly warning: boolean;
        readonly label: boolean;
        readonly section: string;
        readonly separator: boolean;
      }[];
      readonly position: {
        readonly x: number;
        readonly y: number;
        readonly width?: number;
        readonly overlap?: boolean;
        readonly left?: boolean;
      } | null;
      readonly noIcon: boolean;
      readonly useNativeMenu: boolean;
      readonly onSelect: (itemId: string) => void;
      readonly onHide?: () => void;
    }): string;
    closeMenu(menuId: string): void;
  };
}

interface PluginHostProtocolBridgeOwner {
  __wstudioPluginHostProtocolBridge?: {
    dispatchProtocol(data: AppProtocolData): Promise<boolean>;
  };
}

interface PluginHostBasesBridgeOwner {
  __wstudioPluginHostBasesBridge?: {
    renderBasesViewSnapshot(
      pluginId: string,
      viewId: string,
    ): Promise<import('./MainProcessPluginRuntime').BasesViewSnapshot | null>;
  };
}

function installPluginHostUiBridge(): void {
  const owner = globalThis as typeof globalThis & PluginHostUiBridgeOwner;

  owner.__wstudioPluginHostUiBridge = {
    showNotice(payload): void {
      emitPluginRuntimeNotice(payload);
    },
    openModal(payload): void {
      openPluginRuntimeModal(payload);
    },
    closeModal(): void {
      closePluginRuntimeModal();
    },
    openSuggestModal(payload): string {
      return openPluginRuntimeSuggestModal(payload);
    },
    updateSuggestModal(payload): void {
      updatePluginRuntimeSuggestModal(payload);
    },
    closeSuggestModal(modalId): void {
      closePluginRuntimeSuggestModal(modalId);
    },
    openMenu(payload): string {
      return openPluginRuntimeMenu(payload);
    },
    closeMenu(menuId): void {
      closePluginRuntimeMenu(menuId);
    },
  };
}

function installPluginHostProtocolBridge(
  dispatchProtocol: (data: AppProtocolData) => Promise<boolean>,
): void {
  const owner = globalThis as typeof globalThis & PluginHostProtocolBridgeOwner;

  owner.__wstudioPluginHostProtocolBridge = {
    dispatchProtocol,
  };
}

function installPluginHostBasesBridge(
  renderBasesViewSnapshot: (
    pluginId: string,
    viewId: string,
  ) => Promise<import('./MainProcessPluginRuntime').BasesViewSnapshot | null>,
): void {
  const owner = globalThis as typeof globalThis & PluginHostBasesBridgeOwner;

  owner.__wstudioPluginHostBasesBridge = {
    renderBasesViewSnapshot,
  };
}

export class PluginHostManager {
  private readonly loadFailures = new Map<string, Error>();
  private readonly loadedPlugins = new Map<string, LoadedPluginRecord>();
  private readonly pluginUiListeners = new Set<() => void>();
  private installedPlugins: readonly InstalledPluginSummary[] = [];
  private pendingPluginUiNotification = false;
  private pluginUiNotificationBatchDepth = 0;
  private pluginUiUnsubscribe: (() => void) | null = null;
  private runtime: MainProcessPluginRuntime | null = null;

  public constructor(
    private readonly discoveryService: PluginDiscoveryService,
    private readonly getDependencies: () => PluginHostManagerDependencies | null,
  ) {}

  public async initialize(): Promise<void> {
    await this.runWithBatchedPluginUiNotifications(async () => {
      await this.initializeRuntime();
      await this.loadDiscoveredPlugins();
    });
  }

  public async reloadAll(): Promise<void> {
    await this.runWithBatchedPluginUiNotifications(async () => {
      await this.unloadAllPlugins();
      await this.discoveryService.reload();
      await this.initializeRuntime();
      await this.loadDiscoveredPlugins();
    });
  }

  public getInstalledPlugins(): readonly InstalledPluginSummary[] {
    return this.installedPlugins;
  }

  public getWorkbenchContributionSnapshot(): WorkbenchContributionSnapshot {
    const resolvePluginDisplayName = (pluginId: string): string => {
      return this.discoveryService.getById(pluginId)?.manifest.name ?? pluginId;
    };

    const fileIconThemes = this.discoveryService.getAll().flatMap((descriptor) => {
      if (descriptor.fileIconTheme === null) {
        return [];
      }

      return [{
        id: descriptor.fileIconTheme.id,
        extensionId: descriptor.fileIconTheme.extensionId,
        extensionDisplayName: descriptor.fileIconTheme.extensionDisplayName,
        label: descriptor.fileIconTheme.label,
        file: toLocalFileAssetUrl(descriptor.fileIconTheme.fileIconPath) ?? '',
        directory: toLocalFileAssetUrl(descriptor.fileIconTheme.directoryIconPath) ?? '',
        directoryExpanded: descriptor.fileIconTheme.directoryExpandedIconPath === null
          ? null
          : toLocalFileAssetUrl(descriptor.fileIconTheme.directoryExpandedIconPath),
        mappings: descriptor.fileIconTheme.mappings.map((mapping) => ({
          icon: toLocalFileAssetUrl(mapping.iconPath) ?? '',
          extensions: mapping.extensions,
          fileNames: mapping.fileNames,
        })),
      }];
    });

    if (this.runtime === null) {
      return {
        ...EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
        fileIconThemes,
      };
    }

    return {
      ...EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
      commands: this.runtime.getCommandContributions(resolvePluginDisplayName),
      fileIconThemes,
    };
  }

  public getPluginSettingTabs(): readonly PluginSettingTabSummary[] {
    if (this.runtime === null) {
      return [];
    }

    const resolvePluginDisplayName = (pluginId: string): string => {
      return this.discoveryService.getById(pluginId)?.manifest.name ?? pluginId;
    };

    return this.runtime.getSettingTabSummaries(resolvePluginDisplayName);
  }

  public getPluginUiEntries(): readonly PluginUiEntrySnapshot[] {
    return this.runtime?.ui.getEntries() ?? [];
  }

  public executePluginUiEntry(entryId: string): boolean {
    return this.runtime?.ui.executeEntry(entryId) ?? false;
  }

  public subscribePluginUiEntries(listener: () => void): () => void {
    this.pluginUiListeners.add(listener);

    return () => {
      this.pluginUiListeners.delete(listener);
    };
  }

  public async activateForAIPanelItem(_item: AIPanelContributionEntry): Promise<void> {
    return undefined;
  }

  public async executeContributedCommand(
    commandId: string,
    _args: readonly JsonValue[] = [],
  ): Promise<JsonValue | null> {
    if (this.runtime === null) {
      return null;
    }

    await this.runtime.commands.executeCommand(commandId);
    return null;
  }

  public async deliverRuntimeWebviewMessage(
    _extensionId: string,
    _panelInstanceKey: string,
    _message: JsonValue,
  ): Promise<void> {
    return undefined;
  }

  public async notifyRuntimeWebviewDisposed(
    _extensionId: string,
    _panelInstanceKey: string,
  ): Promise<void> {
    return undefined;
  }

  private async initializeRuntime(): Promise<void> {
    installMainProcessDomShim();
    installPluginSdkAlias();
    installPluginHostUiBridge();
    this.loadFailures.clear();
    this.loadedPlugins.clear();
    this.pluginUiUnsubscribe?.();
    this.pluginUiUnsubscribe = null;

    const dependencies = this.getDependencies();

    if (dependencies === null) {
      throw new Error('Plugin host dependencies are not configured.');
    }

    this.runtime = new MainProcessPluginRuntime({
      settingsManager: dependencies.settingsManager,
      workspaceManager: dependencies.workspaceManager,
      editorBridge: dependencies.editorBridge,
      resolveViewCreator: () => null,
      resolveViewTypeForExtension: () => null,
    });
    configurePluginRuntimeViewRequestBridge({
      activateView: async (leafId: string) => {
        this.runtime?.app.workspace.activateLeafById(leafId);
      },
      closeView: async (leafId: string) => {
        this.runtime?.app.workspace.detachLeafById(leafId);
      },
      openWorkspaceFile: async (filePath: string, options?: { readonly forceNewLeaf?: boolean }) => {
        return await this.runtime?.app.workspace.openWorkspaceFileByPath(filePath, options) ?? false;
      },
      syncRenamedWorkspaceFile: async (oldPath: string, newPath: string) => {
        await this.runtime?.app.workspace.syncRenamedWorkspaceFilePath(oldPath, newPath);
      },
      syncDeletedWorkspaceFile: async (filePath: string) => {
        await this.runtime?.app.workspace.syncDeletedWorkspaceFilePath(filePath);
      },
      dispatchViewEvent: async (
        leafId: string,
        nodeId: string,
        request: {
          readonly type: string;
          readonly key?: string;
          readonly clientX?: number;
          readonly clientY?: number;
          readonly button?: number;
          readonly elementX?: number;
          readonly elementY?: number;
          readonly deltaX?: number;
          readonly deltaY?: number;
          readonly surfaceWidth?: number;
          readonly surfaceHeight?: number;
          readonly value?: string;
          readonly checked?: boolean;
          readonly dataTransferTypes?: readonly string[];
          readonly dataTransferText?: string;
          readonly dataTransferUriList?: string;
          readonly dataTransferWorkspaceFilePath?: string;
        },
      ) => {
        return this.runtime?.app.workspace.dispatchRendererEventToLeaf(leafId, nodeId, request) ?? false;
      },
    });
    installPluginHostProtocolBridge(async (data) => {
      if (this.runtime === null) {
        return false;
      }

      return this.runtime.protocols.dispatchProtocol(data);
    });
    installPluginHostBasesBridge(async (pluginId, viewId) => {
      if (this.runtime === null) {
        return null;
      }

      return this.runtime.bases.renderRegisteredView(pluginId, viewId);
    });
    this.pluginUiUnsubscribe = this.runtime.ui.subscribe(() => {
      this.emitPluginUiEntriesChanged();
    });
    this.emitPluginUiEntriesChanged();
  }

  private async loadDiscoveredPlugins(): Promise<void> {
    for (const descriptor of this.discoveryService.getAll()) {
      await this.loadPlugin(descriptor);
    }

    this.refreshInstalledPlugins();
  }

  private async loadPlugin(descriptor: PluginDescriptor): Promise<void> {
    if (this.runtime === null) {
      return;
    }

    if (descriptor.entryPath === null) {
      return;
    }

    this.clearPluginModuleCache(descriptor.rootDirectory);

    let instance: Plugin | null = null;

    try {
      const pluginModule = await this.loadPluginModule(descriptor.entryPath);
      const pluginConstructor = pluginModule.default;

      if (pluginConstructor === undefined) {
        throw new Error(`Plugin "${descriptor.manifest.id}" does not export a default plugin class.`);
      }

      instance = new pluginConstructor(this.runtime.app, descriptor.manifest);

      if (!(instance instanceof Plugin)) {
        throw new Error(`Plugin "${descriptor.manifest.id}" must extend the host Plugin base class.`);
      }

      const load = resolvePluginMethod<PluginLifecycleVoidMethod>(
        instance,
        PLUGIN_INTERNAL_LOAD,
        GLOBAL_PLUGIN_INTERNAL_LOAD,
      );
      const enable = resolvePluginMethod<PluginLifecycleVoidMethod>(
        instance,
        PLUGIN_INTERNAL_ENABLE,
        GLOBAL_PLUGIN_INTERNAL_ENABLE,
      );
      const getSnapshot = resolvePluginMethod<PluginSnapshotMethod>(
        instance,
        PLUGIN_INTERNAL_GET_SNAPSHOT,
        GLOBAL_PLUGIN_INTERNAL_GET_SNAPSHOT,
      );

      if (load === null || enable === null || getSnapshot === null) {
        throw new Error(`Plugin "${descriptor.manifest.id}" is missing internal lifecycle handlers.`);
      }

      await load.call(instance);
      await enable.call(instance);

      this.loadedPlugins.set(descriptor.manifest.id, {
        descriptor,
        instance,
        snapshot: getSnapshot.call(instance),
      });
    } catch (error) {
      const normalizedError = normalizeError(
        error instanceof Error ? error : null,
        `Plugin "${descriptor.manifest.id}" failed to load.`,
      );
      console.error(`[PluginHostManager] plugin "${descriptor.manifest.id}" failed to load:`, normalizedError);
      this.loadFailures.set(descriptor.manifest.id, normalizedError);

      if (instance !== null) {
        try {
          const fail = resolvePluginMethod<PluginFailureMethod>(
            instance,
            PLUGIN_INTERNAL_FAIL,
            GLOBAL_PLUGIN_INTERNAL_FAIL,
          );

          if (fail !== null) {
            await fail.call(instance, normalizedError);
          }
        } catch {
          // Ignore secondary failure notifications so host reload can continue.
        }
      }

      this.runtime.clearPlugin(descriptor.manifest.id);
    }
  }

  private async unloadAllPlugins(): Promise<void> {
    if (this.runtime === null) {
      return;
    }

    for (const record of [...this.loadedPlugins.values()].reverse()) {
      try {
        const unload = resolvePluginMethod<PluginLifecycleVoidMethod>(
          record.instance,
          PLUGIN_INTERNAL_UNLOAD,
          GLOBAL_PLUGIN_INTERNAL_UNLOAD,
        );

        if (unload !== null) {
          await unload.call(record.instance);
        }
      } catch {
        // Best-effort teardown during reload.
      }

      this.runtime.clearPlugin(record.descriptor.manifest.id);
    }

    this.loadedPlugins.clear();
    this.installedPlugins = [];
    this.emitPluginUiEntriesChanged();
  }

  private async loadPluginModule(entryPath: string): Promise<PluginModuleNamespace> {
    if (entryPath.endsWith('.mjs')) {
      return import(pathToFileURL(entryPath).toString()) as Promise<PluginModuleNamespace>;
    }

    const requireForEntry = Module.createRequire(entryPath);
    return requireForEntry(entryPath) as PluginModuleNamespace;
  }

  private clearPluginModuleCache(rootDirectory: string): void {
    const normalizedRoot = rootDirectory.replace(/\\/g, '/').toLowerCase();

    for (const cachedPath of Object.keys(require.cache)) {
      if (cachedPath.replace(/\\/g, '/').toLowerCase().startsWith(normalizedRoot)) {
        delete require.cache[cachedPath];
      }
    }
  }

  private refreshInstalledPlugins(): void {
    this.installedPlugins = this.discoveryService.getAll().map((descriptor) => {
      const loaded = this.loadedPlugins.get(descriptor.manifest.id);
      const failure = this.loadFailures.get(descriptor.manifest.id);
      return descriptorToInstalledPluginSummary(
        descriptor,
        descriptor.entryPath === null || loaded?.snapshot.state === 'enabled',
        failure?.message ?? null,
      );
    });
    this.emitPluginUiEntriesChanged();
  }

  private emitPluginUiEntriesChanged(): void {
    if (this.pluginUiNotificationBatchDepth > 0) {
      this.pendingPluginUiNotification = true;
      return;
    }

    for (const listener of [...this.pluginUiListeners]) {
      listener();
    }
  }

  private async runWithBatchedPluginUiNotifications<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    this.pluginUiNotificationBatchDepth += 1;

    try {
      return await operation();
    } finally {
      this.pluginUiNotificationBatchDepth = Math.max(this.pluginUiNotificationBatchDepth - 1, 0);

      if (this.pluginUiNotificationBatchDepth === 0 && this.pendingPluginUiNotification) {
        this.pendingPluginUiNotification = false;
        this.emitPluginUiEntriesChanged();
      }
    }
  }
}
