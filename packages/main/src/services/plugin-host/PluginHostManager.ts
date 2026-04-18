/**
 * Main-process plugin host manager stage 2.
 * It loads plugin entry modules, instantiates plugins, and drives lifecycle transitions against the host runtime bridge.
 */

import Module = require('node:module');
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as PluginSdk from '@note-studio/plugin';
import {
  Plugin,
  type JsonValue as PluginJsonValue,
  type AppProtocolData,
  type EditorSuggest,
  type EditorSuggestContext,
  type PluginConstructor,
  type PluginFailureContext,
  type PluginReleaseChannel,
  type SuggestionValue,
} from '@note-studio/plugin';
import {
  EDITOR_SUGGEST_INTERNAL_REFRESH,
  EDITOR_SUGGEST_INTERNAL_HANDLE_KEY,
  type InternalEditorSuggestRuntime,
  PLUGIN_INTERNAL_ENABLE,
  PLUGIN_INTERNAL_FAIL,
  PLUGIN_INTERNAL_GET_SNAPSHOT,
  PLUGIN_INTERNAL_LOAD,
  PLUGIN_INTERNAL_UNLOAD,
  type PluginRuntimeAnchorRect,
} from '@note-studio/plugin/internal/runtime';
import type { PluginLifecycleSnapshot } from '@note-studio/plugin';
import type {
  AIPanelContributionEntry,
  JsonValue,
  PluginUiRuntimeEditorActionRequest,
  PluginUiRuntimeSettingTabSummary,
  PluginUiRuntimeEditorTextEdit,
  PluginUiEntrySnapshot,
  PluginUiRuntimeSurfaceDescriptor,
  WorkbenchCommandContributionEntry,
  WorkbenchContributionSnapshot,
} from '@note-studio/shared';
import { EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT } from '@note-studio/shared';
import {
  installMainProcessDomShim,
} from './MainProcessDomShim';
import { MainProcessPluginRuntime } from './MainProcessPluginRuntime';
import { PluginDiscoveryService } from './PluginDiscoveryService';
import { PluginSupervisorService } from './PluginSupervisorService';
import { pluginSurfaceViewService } from '../plugin-surface/PluginSurfaceViewService';
import type {
  PluginSupervisorPluginRuntimeSnapshot,
  PluginSupervisorViewInstanceSnapshot,
} from './pluginSupervisorProtocol';
import {
  getCurrentPluginExecutionContextPluginId,
  runWithPluginExecutionContext,
} from './pluginExecutionContext';
import type {
  InstalledPluginSummary,
  MainProcessEditorBridge,
  PluginDescriptor,
  PluginSettingTabSummary,
} from './types';
import type { MainProcessAppFacadeDependencies } from './MainProcessAppFacade';
import {
  closePluginRuntimeMenu,
  closePluginRuntimeOverlayFrame,
  configurePluginRuntimeViewRequestBridge,
  emitPluginRuntimeNotice,
  openPluginRuntimeMenu,
  openPluginRuntimeOverlayFrame,
  updatePluginRuntimeOverlayFrame,
} from '../../ipc/pluginRuntimeHandlers';

interface PluginModuleNamespace {
  readonly default?: PluginConstructor;
}

interface LoadedPluginRecord {
  readonly descriptor: PluginDescriptor;
  readonly instance: Plugin;
  readonly snapshot: PluginLifecycleSnapshot;
}

interface PluginRuntimeDomOverlayOptions {
  readonly title: string;
  readonly titleElement?: HTMLElement;
  readonly contentElement: HTMLElement;
  readonly runtimeSurface?: PluginUiRuntimeSurfaceDescriptor | null;
  readonly width: number;
  readonly height: number;
  readonly closeOnBackdrop: boolean;
  readonly chrome: 'dialog' | 'popover';
  readonly anchorRect?: PluginRuntimeAnchorRect | null;
  readonly interactionMode?: 'default' | 'editorSuggest';
  readonly onRuntimeAction?: (action: JsonValue | null) => void;
  readonly onClose?: () => void;
}

interface CompatibleEditorSuggestRuntime {
  context: EditorSuggestContext | null;
  limit: number;
  getSuggestions(
    context: EditorSuggestContext,
  ): readonly SuggestionValue[] | Promise<readonly SuggestionValue[]>;
  open(): void;
  close(): void;
  setSuggestions(values: readonly SuggestionValue[]): void;
  setHostPopoverAnchorRect(anchorRect: PluginRuntimeAnchorRect | null): void;
  moveSelection(direction: -1 | 1): boolean;
  selectActiveSuggestion(evt: KeyboardEvent): boolean;
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

function resolveInstalledPluginSupervisorOverlay(
  enabled: boolean,
  failureMessage: string | null,
  supervisorRuntimeState: PluginSupervisorPluginRuntimeSnapshot | null,
): {
  readonly enabled: boolean;
  readonly failureMessage: string | null;
} {
  if (
    supervisorRuntimeState?.owner === 'supervisor'
    && supervisorRuntimeState.status === 'enabled'
  ) {
    return {
      enabled: true,
      failureMessage: null,
    };
  }

  if (supervisorRuntimeState?.status !== 'failed') {
    return {
      enabled,
      failureMessage,
    };
  }

  return {
    enabled: false,
    failureMessage: failureMessage ?? supervisorRuntimeState.failureMessage,
  };
}

function toPluginJsonValue(value: JsonValue | null): PluginJsonValue | null {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const entries: PluginJsonValue[] = [];

    for (const entry of value) {
      const normalizedEntry = toPluginJsonValue(entry);
      entries.push(normalizedEntry);
    }

    return entries;
  }

  const normalizedObject: Record<string, PluginJsonValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    normalizedObject[key] = toPluginJsonValue(entry);
  }

  return normalizedObject;
}

function toSharedJsonValue(value: PluginJsonValue | null): JsonValue | null {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const entries: JsonValue[] = [];

    for (const entry of value) {
      const normalizedEntry = toSharedJsonValue(entry);
      entries.push(normalizedEntry);
    }

    return entries;
  }

  const normalizedObject: Record<string, JsonValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    normalizedObject[key] = toSharedJsonValue(entry);
  }

  return normalizedObject;
}

function toPluginJsonObject(value: JsonValue | null): Record<string, PluginJsonValue> {
  const normalizedValue = toPluginJsonValue(value);

  if (
    normalizedValue === null
    || Array.isArray(normalizedValue)
    || typeof normalizedValue !== 'object'
  ) {
    return {};
  }

  const normalizedObject: Record<string, PluginJsonValue> = {};

  for (const [key, entry] of Object.entries(normalizedValue)) {
    normalizedObject[key] = entry;
  }

  return normalizedObject;
}

interface PendingSupervisorViewLeaf extends PluginSdk.WorkspaceLeaf {
  consumePendingSupervisorViewInstanceToken(viewType: string): string | null;
}

function consumePendingSupervisorViewInstanceToken(
  leaf: PluginSdk.WorkspaceLeaf,
  viewType: string,
): string | null {
  if (
    'consumePendingSupervisorViewInstanceToken' in leaf
    && typeof leaf.consumePendingSupervisorViewInstanceToken === 'function'
  ) {
    return (leaf as PendingSupervisorViewLeaf).consumePendingSupervisorViewInstanceToken(viewType);
  }

  return null;
}

class SupervisorBackedView extends PluginSdk.View {
  private displayText: string;
  private state: Record<string, PluginJsonValue>;

  public constructor(
    leaf: PluginSdk.WorkspaceLeaf,
    private readonly viewType: string,
    private readonly pluginSupervisorService: PluginSupervisorService,
  ) {
    super(leaf);
    this.displayText = viewType;
    this.state = {};
  }

  public getViewType(): string {
    return this.viewType;
  }

  public getDisplayText(): string {
    return this.displayText;
  }

  public getState(): Record<string, PluginJsonValue> {
    return this.state;
  }

  public override async onOpen(): Promise<void> {
    const snapshot = await this.pluginSupervisorService.openRemoteViewInstance(
      this.leaf.id,
      this.viewType,
      consumePendingSupervisorViewInstanceToken(this.leaf, this.viewType),
    );

    if (snapshot === null) {
      throw new Error(`Plugin supervisor failed to open remote view "${this.viewType}".`);
    }

    this.applySnapshot(snapshot);
  }

  public override async setState(
    state: Record<string, PluginJsonValue>,
    _result: PluginSdk.ViewStateResult,
  ): Promise<void> {
    const snapshot = await this.pluginSupervisorService.updateRemoteViewInstance(
      this.leaf.id,
      this.viewType,
      toSharedJsonValue(state),
    );

    if (snapshot === null) {
      throw new Error(`Plugin supervisor failed to update remote view "${this.viewType}".`);
    }

    this.applySnapshot(snapshot);
  }

  public override onResize(): void {
    void this.pluginSupervisorService.resizeRemoteViewInstance(this.leaf.id)
      .then((snapshot) => {
        if (snapshot !== null) {
          this.applySnapshot(snapshot);
        }
      })
      .catch((error) => {
        console.warn(
          '[PluginHostManager] Failed to resize remote supervisor view:',
          error instanceof Error ? error.message : error,
        );
      });
  }

  public override async onClose(): Promise<void> {
    await this.pluginSupervisorService.closeRemoteViewInstance(this.leaf.id);
  }

  private applySnapshot(snapshot: PluginSupervisorViewInstanceSnapshot): void {
    this.displayText = snapshot.displayText;
    this.icon = snapshot.icon;
    this.state = toPluginJsonObject(snapshot.state);
  }
}

function normalizeError(error: Error | null, fallbackMessage: string): Error {
  return error instanceof Error ? error : new Error(fallbackMessage);
}

function isSharedJsonPrimitive(value: JsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function isPluginJsonPrimitive(value: PluginJsonValue): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function sharedJsonToPlugin(value: JsonValue): PluginJsonValue {
  if (isSharedJsonPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sharedJsonToPlugin(item));
  }

  const result: Record<string, PluginJsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = sharedJsonToPlugin(item);
  }

  return result;
}

function pluginJsonToShared(value: PluginJsonValue): JsonValue {
  if (isPluginJsonPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => pluginJsonToShared(item));
  }

  const result: Record<string, JsonValue> = {};

  for (const [key, item] of Object.entries(value)) {
    result[key] = pluginJsonToShared(item);
  }

  return result;
}

function createSyntheticEditorSuggestKeyboardEvent(key: string): KeyboardEvent {
  return {
    key,
    preventDefault(): void {
      return;
    },
    stopPropagation(): void {
      return;
    },
  } as KeyboardEvent;
}

function mergeWorkbenchCommandContributions(
  ...sources: readonly (readonly WorkbenchCommandContributionEntry[])[]
): readonly WorkbenchCommandContributionEntry[] {
  const mergedEntries = new Map<string, WorkbenchCommandContributionEntry>();

  for (const source of sources) {
    for (const entry of source) {
      const contributionKey = `${entry.extensionId}:${entry.commandId}`;

      if (!mergedEntries.has(contributionKey)) {
        mergedEntries.set(contributionKey, entry);
      }
    }
  }

  return [...mergedEntries.values()];
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
      readonly duration?: number;
    }): void;
    openModal(payload: {
      readonly title: string;
      readonly titleElement: HTMLElement;
      readonly contentElement: HTMLElement;
      readonly surfaceId?: string | null;
      readonly onClose?: () => void;
    }): string;
    closeModal(modalId: string): void;
    openPopover(payload: {
      readonly title: string;
      readonly contentElement: HTMLElement;
      readonly surfaceId?: string | null;
      readonly runtimeState?: JsonValue | null;
      readonly onRuntimeAction?: (action: JsonValue | null) => void;
      readonly width?: number;
      readonly height?: number;
      readonly anchorRect?: PluginRuntimeAnchorRect | null;
      readonly interactionMode?: 'default' | 'editorSuggest';
      readonly onClose?: () => void;
    }): string;
    updatePopover(popoverId: string, payload: {
      readonly title?: string;
      readonly runtimeState?: JsonValue | null;
      readonly width?: number;
      readonly height?: number;
      readonly anchorRect?: PluginRuntimeAnchorRect | null;
      readonly interactionMode?: 'default' | 'editorSuggest';
    }): void;
    closePopover(popoverId: string): void;
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

interface ActivePluginRuntimeDomOverlay {
  readonly stopWatchingSurface: () => void;
  readonly markRuntimeSurfaceActive: () => void;
  syncSurface(
    patch?: Partial<Pick<PluginRuntimeDomOverlayOptions, 'title' | 'width' | 'height' | 'anchorRect' | 'interactionMode'>>
      & {
        readonly runtimeState?: JsonValue | null;
      },
  ): void;
}

const activePluginRuntimeDomOverlays = new Map<string, ActivePluginRuntimeDomOverlay>();

function cleanupPluginRuntimeDomOverlay(overlayId: string): void {
  const activeOverlay = activePluginRuntimeDomOverlays.get(overlayId);

  if (activeOverlay === undefined) {
    return;
  }

  activePluginRuntimeDomOverlays.delete(overlayId);
  activeOverlay.stopWatchingSurface();
}

function markPluginRuntimeDomOverlaySurfaceActive(overlayId: string): void {
  const activeOverlay = activePluginRuntimeDomOverlays.get(overlayId);

  if (activeOverlay === undefined) {
    return;
  }

  activeOverlay.markRuntimeSurfaceActive();
}

function resolvePluginRuntimeModalTitle(titleElement: HTMLElement, fallbackTitle: string): string {
  const normalizedTitle = titleElement.textContent?.trim() ?? '';
  return normalizedTitle.length > 0 ? normalizedTitle : fallbackTitle;
}

function openPluginRuntimeDomOverlaySurface(options: PluginRuntimeDomOverlayOptions): string {
  let currentOptions = options;

  const resolveOverlayPayload = () => {
    return {
      title: currentOptions.titleElement === undefined
        ? currentOptions.title
        : resolvePluginRuntimeModalTitle(currentOptions.titleElement, currentOptions.title),
      runtimeSurface: currentOptions.runtimeSurface ?? null,
      width: currentOptions.width,
      height: currentOptions.height,
      closeOnBackdrop: currentOptions.closeOnBackdrop,
      chrome: currentOptions.chrome,
      anchorRect: currentOptions.anchorRect ?? null,
      interactionMode: currentOptions.interactionMode ?? 'default',
    };
  };

  const overlayId = openPluginRuntimeOverlayFrame({
    ...resolveOverlayPayload(),
    dispatchRuntimeAction: currentOptions.onRuntimeAction,
    onClose: () => {
      cleanupPluginRuntimeDomOverlay(overlayId);
      currentOptions.onClose?.();
    },
  });

  const syncOverlaySurface = (
    patch?: Partial<Pick<PluginRuntimeDomOverlayOptions, 'title' | 'width' | 'height' | 'anchorRect' | 'interactionMode'>>
      & {
        readonly runtimeState?: JsonValue | null;
      },
  ): void => {
    if (patch !== undefined) {
      const nextRuntimeSurface: PluginUiRuntimeSurfaceDescriptor | null | undefined = patch.runtimeState === undefined
        || currentOptions.runtimeSurface === null
        || currentOptions.runtimeSurface === undefined
        ? currentOptions.runtimeSurface
        : {
            ...currentOptions.runtimeSurface,
            state: patch.runtimeState,
          };

      currentOptions = {
        ...currentOptions,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.width === undefined ? {} : { width: patch.width }),
        ...(patch.height === undefined ? {} : { height: patch.height }),
        ...(patch.anchorRect === undefined ? {} : { anchorRect: patch.anchorRect }),
        ...(patch.interactionMode === undefined ? {} : { interactionMode: patch.interactionMode }),
        runtimeSurface: nextRuntimeSurface,
      };
    }

    updatePluginRuntimeOverlayFrame({
      overlayId,
      ...resolveOverlayPayload(),
    });
  };

  activePluginRuntimeDomOverlays.set(overlayId, {
    stopWatchingSurface: (): void => {
      return undefined;
    },
    markRuntimeSurfaceActive: () => {
      return undefined;
    },
    syncSurface: syncOverlaySurface,
  });

  return overlayId;
}

function installPluginHostUiBridge(
  resolveModalRuntimeSurface: (
    pluginId: string,
    modalSurfaceId: string,
  ) => PluginUiRuntimeSurfaceDescriptor | null,
  resolvePopoverRuntimeSurface: (
    pluginId: string,
    popoverSurfaceId: string,
    runtimeState: JsonValue | null,
  ) => PluginUiRuntimeSurfaceDescriptor | null,
): void {
  const owner = globalThis as typeof globalThis & PluginHostUiBridgeOwner;

  owner.__wstudioPluginHostUiBridge = {
    showNotice(payload): void {
      emitPluginRuntimeNotice(payload);
    },
    openModal(payload): string {
      const pluginId = getCurrentPluginExecutionContextPluginId();
      const normalizedSurfaceId = payload.surfaceId?.trim() ?? '';

      return openPluginRuntimeDomOverlaySurface({
        title: payload.title,
        titleElement: payload.titleElement,
        contentElement: payload.contentElement,
        runtimeSurface: pluginId === null || normalizedSurfaceId.length === 0
          ? null
          : resolveModalRuntimeSurface(pluginId, normalizedSurfaceId),
        width: 640,
        height: 360,
        closeOnBackdrop: true,
        chrome: 'dialog',
        onClose: payload.onClose,
      });
    },
    closeModal(modalId): void {
      cleanupPluginRuntimeDomOverlay(modalId);
      closePluginRuntimeOverlayFrame(modalId);
    },
    openPopover(payload): string {
      const pluginId = getCurrentPluginExecutionContextPluginId();
      const normalizedSurfaceId = payload.surfaceId?.trim() ?? '';

      return openPluginRuntimeDomOverlaySurface({
        title: payload.title,
        contentElement: payload.contentElement,
        runtimeSurface: pluginId === null || normalizedSurfaceId.length === 0
          ? null
          : resolvePopoverRuntimeSurface(pluginId, normalizedSurfaceId, payload.runtimeState ?? null),
        width: payload.width ?? 420,
        height: payload.height ?? 320,
        closeOnBackdrop: true,
        chrome: 'popover',
        anchorRect: payload.anchorRect ?? null,
        interactionMode: payload.interactionMode ?? 'default',
        onRuntimeAction: payload.onRuntimeAction,
        onClose: payload.onClose,
      });
    },
    updatePopover(popoverId, payload): void {
      const activeOverlay = activePluginRuntimeDomOverlays.get(popoverId);

      if (activeOverlay === undefined) {
        return;
      }

      activeOverlay.syncSurface({
        title: payload.title,
        runtimeState: payload.runtimeState,
        width: payload.width,
        height: payload.height,
        anchorRect: payload.anchorRect,
        interactionMode: payload.interactionMode,
      });
    },
    closePopover(popoverId): void {
      cleanupPluginRuntimeDomOverlay(popoverId);
      closePluginRuntimeOverlayFrame(popoverId);
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
  private pluginCommandUnsubscribe: (() => void) | null = null;
  private editorBridgeUnsubscribe: (() => void) | null = null;
  private activeEditorSuggest: EditorSuggest<SuggestionValue> | null = null;
  private activeEditorSuggestPluginId: string | null = null;
  private pendingEditorSuggestRefreshTimer: NodeJS.Timeout | null = null;
  private editorSuggestRefreshSequence = 0;
  private runtime: MainProcessPluginRuntime | null = null;
  private readonly pluginSupervisorService: PluginSupervisorService;

  public constructor(
    private readonly discoveryService: PluginDiscoveryService,
    private readonly getDependencies: () => PluginHostManagerDependencies | null,
  ) {
    this.pluginSupervisorService = new PluginSupervisorService(() => {
      return this.getDependencies()?.settingsManager ?? null;
    }, () => {
      return this.getDependencies()?.workspaceManager.getWorkspaceDir() ?? null;
    }, () => {
      return this.runtime?.app ?? null;
    });
    this.pluginSupervisorService.subscribeCommandContributions(() => {
      this.emitPluginUiEntriesChanged();
    });
    this.pluginSupervisorService.subscribeSettingTabs(() => {
      this.emitPluginUiEntriesChanged();
    });
    this.pluginSupervisorService.subscribePluginUiEntries(() => {
      this.emitPluginUiEntriesChanged();
    });
    this.pluginSupervisorService.subscribePluginRuntimeStates(() => {
      this.refreshInstalledPlugins();
    });
  }

  public async initialize(): Promise<void> {
    await this.runWithBatchedPluginUiNotifications(async () => {
      await this.initializeRuntime();
      await this.initializePluginSupervisor();
      await this.loadDiscoveredPlugins();
    });
  }

  public async reloadAll(): Promise<void> {
    await this.runWithBatchedPluginUiNotifications(async () => {
      await this.unloadAllPlugins();
      await this.discoveryService.reload();
      await this.initializeRuntime();
      await this.initializePluginSupervisor();
      await this.loadDiscoveredPlugins();
    });
  }

  public async shutdown(): Promise<void> {
    await this.unloadAllPlugins();
    await this.pluginSupervisorService.shutdown();
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
        commands: this.pluginSupervisorService.getCommandContributions(resolvePluginDisplayName),
        fileIconThemes,
      };
    }

    return {
      ...EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
      commands: mergeWorkbenchCommandContributions(
        this.pluginSupervisorService.getCommandContributions(resolvePluginDisplayName),
        this.runtime.getCommandContributions(resolvePluginDisplayName),
      ),
      fileIconThemes,
    };
  }

  public getPluginSettingTabs(): readonly PluginSettingTabSummary[] {
    const resolvePluginDisplayName = (pluginId: string): string => {
      return this.discoveryService.getById(pluginId)?.manifest.name ?? pluginId;
    };

    const remoteSettingTabs = this.pluginSupervisorService.getSettingTabSummaries(resolvePluginDisplayName);
    const mainSettingTabs = this.runtime?.getSettingTabSummaries(resolvePluginDisplayName) ?? [];

    return [...remoteSettingTabs, ...mainSettingTabs]
      .map((entry) => ({
        ...entry,
        runtimeSurface: this.resolveSettingTabRuntimeSurface(entry.pluginId, entry.id),
      }));
  }

  private getPluginRuntimeSettingTabSummaries(
    pluginId: string,
  ): readonly PluginUiRuntimeSettingTabSummary[] {
    return this.getPluginSettingTabs()
      .filter((entry) => entry.pluginId === pluginId)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        preview: entry.preview,
        previewLines: entry.previewLines,
      }));
  }

  public getPluginUiEntries(): readonly PluginUiEntrySnapshot[] {
    const remoteEntries = this.pluginSupervisorService.getPluginUiEntries();
    const mainEntries = this.runtime?.ui.getEntries() ?? [];

    return [...remoteEntries, ...mainEntries];
  }

  public async executePluginUiEntry(entryId: string): Promise<boolean> {
    const handledByMain = await this.runtime?.ui.executeEntry(entryId) ?? false;

    if (handledByMain) {
      return true;
    }

    return await this.pluginSupervisorService.executeRemoteUiEntry(entryId);
  }

  private resolveRegisteredViewCreator(viewType: string): PluginSdk.ViewCreator | null {
    const pluginId = this.pluginSupervisorService.getPluginIdForViewType(viewType);

    if (
      pluginId === null
      || !this.pluginSupervisorService.isPluginOwnedBySupervisor(pluginId)
      || this.resolveViewRuntimeSurface(viewType) === null
    ) {
      return null;
    }

    return (leaf: PluginSdk.WorkspaceLeaf) => {
      return new SupervisorBackedView(leaf, viewType, this.pluginSupervisorService);
    };
  }

  private resolveRegisteredViewPluginId(viewType: string): string | null {
    return this.runtime?.views.getPluginId(viewType)
      ?? this.pluginSupervisorService.getPluginIdForViewType(viewType);
  }

  private resolveRegisteredViewTypeForExtension(extension: string): string | null {
    return this.runtime?.extensions.getViewTypeForExtension(extension)
      ?? this.pluginSupervisorService.getViewTypeForExtension(extension);
  }

  private resolveViewRuntimeSurface(viewType: string): PluginUiRuntimeSurfaceDescriptor | null {
    const pluginId = this.resolveRegisteredViewPluginId(viewType);

    if (pluginId === null) {
      return null;
    }

    const descriptor = this.discoveryService.getById(pluginId);
    const entryPath = descriptor?.uiEntrypoints?.views[viewType] ?? null;
    const entryUrl = descriptor === undefined ? null : toPluginAssetUrl(descriptor, entryPath);

    if (entryUrl === null) {
      return null;
    }

    return {
      pluginId,
      surfaceKind: 'view',
      surfaceId: viewType,
      entryUrl,
      state: null,
    };
  }

  private resolveSettingTabRuntimeSurface(
    pluginId: string,
    settingTabId: string,
  ): PluginUiRuntimeSurfaceDescriptor | null {
    const descriptor = this.discoveryService.getById(pluginId);
    const entryPath = descriptor?.uiEntrypoints?.settings ?? null;
    const entryUrl = descriptor === undefined ? null : toPluginAssetUrl(descriptor, entryPath);

    if (entryUrl === null) {
      return null;
    }

    return {
      pluginId,
      surfaceKind: 'settingTab',
      surfaceId: settingTabId,
      entryUrl,
      state: null,
    };
  }

  private resolveModalRuntimeSurface(
    pluginId: string,
    modalSurfaceId: string,
  ): PluginUiRuntimeSurfaceDescriptor | null {
    const descriptor = this.discoveryService.getById(pluginId);
    const entryPath = descriptor?.uiEntrypoints?.modals[modalSurfaceId] ?? null;
    const entryUrl = descriptor === undefined ? null : toPluginAssetUrl(descriptor, entryPath);

    if (entryUrl === null) {
      return null;
    }

    return {
      pluginId,
      surfaceKind: 'modal',
      surfaceId: modalSurfaceId,
      entryUrl,
      state: null,
    };
  }

  private resolvePopoverRuntimeSurface(
    pluginId: string,
    popoverSurfaceId: string,
    runtimeState: JsonValue | null,
  ): PluginUiRuntimeSurfaceDescriptor | null {
    const descriptor = this.discoveryService.getById(pluginId);
    const entryPath = descriptor?.uiEntrypoints?.modals[popoverSurfaceId] ?? null;
    const entryUrl = descriptor === undefined ? null : toPluginAssetUrl(descriptor, entryPath);

    if (entryUrl === null) {
      return null;
    }

    return {
      pluginId,
      surfaceKind: 'popover',
      surfaceId: popoverSurfaceId,
      entryUrl,
      state: runtimeState,
    };
  }

  private async readRuntimeEntrySource(surface: PluginUiRuntimeSurfaceDescriptor): Promise<string | null> {
    const descriptor = this.discoveryService.getById(surface.pluginId);

    if (descriptor === undefined || descriptor.uiEntrypoints === null) {
      return null;
    }

    let entryPath: string | null = null;

    if (surface.surfaceKind === 'view') {
      entryPath = descriptor.uiEntrypoints.views[surface.surfaceId] ?? null;
    } else if (surface.surfaceKind === 'settingTab') {
      entryPath = descriptor.uiEntrypoints.settings;
    } else if (surface.surfaceKind === 'modal' || surface.surfaceKind === 'popover') {
      entryPath = descriptor.uiEntrypoints.modals[surface.surfaceId] ?? null;
    }

    if (entryPath === null) {
      return null;
    }

    return await fs.readFile(entryPath, 'utf8');
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
    args: readonly JsonValue[] = [],
  ): Promise<JsonValue | null> {
    if (this.runtime?.commands.shouldPreferSupervisorExecution(commandId) ?? false) {
      const remoteResult = await this.pluginSupervisorService.executeRemoteCommand(commandId, args);

      if (remoteResult.handled) {
        return remoteResult.result;
      }

      if (!remoteResult.fallbackToMain) {
        return null;
      }

      if (this.runtime !== null) {
        const handled = await this.runtime.commands.tryExecuteCommand(commandId);

        if (handled) {
          return null;
        }
      }

      return null;
    }

    if (this.runtime !== null) {
      const handled = await this.runtime.commands.tryExecuteCommand(commandId);

      if (handled) {
        return null;
      }
    }

    const result = await this.pluginSupervisorService.executeRemoteCommand(commandId, args);
    return result.handled ? result.result : null;
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

  private async initializePluginSupervisor(): Promise<void> {
    try {
      await this.pluginSupervisorService.initialize(this.discoveryService.getAll());
      const snapshot = this.pluginSupervisorService.getSnapshot();
      console.log(
        `[PluginHostManager] plugin supervisor ready (pid=${snapshot.pid ?? 'n/a'}, plugins=${snapshot.pluginCount})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize plugin supervisor.';
      console.error('[PluginHostManager] plugin supervisor initialization failed:', message);
    }
  }

  private async initializeRuntime(): Promise<void> {
    installMainProcessDomShim();
    installPluginSdkAlias();
    installPluginHostUiBridge((pluginId, modalSurfaceId) => {
      return this.resolveModalRuntimeSurface(pluginId, modalSurfaceId);
    }, (pluginId, popoverSurfaceId, runtimeState) => {
      return this.resolvePopoverRuntimeSurface(pluginId, popoverSurfaceId, runtimeState);
    });
    this.loadFailures.clear();
    this.loadedPlugins.clear();
    this.pluginUiUnsubscribe?.();
    this.pluginUiUnsubscribe = null;
    this.pluginCommandUnsubscribe?.();
    this.pluginCommandUnsubscribe = null;
    this.editorBridgeUnsubscribe?.();
    this.editorBridgeUnsubscribe = null;
    this.clearPendingEditorSuggestRefresh();
    this.closeActiveEditorSuggest();

    const dependencies = this.getDependencies();

    if (dependencies === null) {
      throw new Error('Plugin host dependencies are not configured.');
    }

    this.runtime = new MainProcessPluginRuntime({
      settingsManager: dependencies.settingsManager,
      workspaceManager: dependencies.workspaceManager,
      editorBridge: dependencies.editorBridge,
      resolveViewCreator: (type: string) => this.resolveRegisteredViewCreator(type),
      resolveViewPluginId: (type: string) => this.resolveRegisteredViewPluginId(type),
      resolveViewTypeForExtension: (extension: string) => this.resolveRegisteredViewTypeForExtension(extension),
      resolveViewRuntimeSurface: (type: string) => this.resolveViewRuntimeSurface(type),
    });
    configurePluginRuntimeViewRequestBridge({
      activateView: async (leafId: string) => {
        this.runtime?.app.workspace.activateLeafById(leafId);
        pluginSurfaceViewService.bringSurfaceToFront(`leaf:${leafId}`);
      },
      closeView: async (leafId: string) => {
        this.runtime?.app.workspace.detachLeafById(leafId);
      },
      markViewRuntimeActive: async (leafId: string) => {
        this.runtime?.app.workspace.markLeafRuntimeSurfaceActive(leafId);
        pluginSurfaceViewService.bringSurfaceToFront(`leaf:${leafId}`);
      },
      markOverlayRuntimeActive: async (overlayId: string) => {
        markPluginRuntimeDomOverlaySurfaceActive(overlayId);
      },
      openWorkspaceFile: async (filePath: string, options?: { readonly forceNewLeaf?: boolean }) => {
        return await this.runtime?.app.workspace.openWorkspaceFileByPath(filePath, options) ?? false;
      },
      getEditorState: async (documentUri: string | null) => {
        return await dependencies.editorBridge.requestState(documentUri);
      },
      applyEditorTextEdits: async (
        documentUri: string,
        edits: readonly PluginUiRuntimeEditorTextEdit[],
      ) => {
        await dependencies.editorBridge.applyTextEdits(documentUri, edits);
      },
      performEditorAction: async (request: PluginUiRuntimeEditorActionRequest) => {
        await dependencies.editorBridge.performAction(request);
      },
      loadPluginData: async (pluginId: string) => {
        const value = await this.runtime?.data.loadData<PluginJsonValue>(pluginId) ?? null;
        return value === null ? null : pluginJsonToShared(value);
      },
      savePluginData: async (pluginId: string, data: JsonValue | null) => {
        if (this.runtime === null) {
          return;
        }

        if (data === null) {
          await this.runtime.data.deleteData(pluginId);
          return;
        }

        await this.runtime.data.saveData(pluginId, sharedJsonToPlugin(data));
      },
      deletePluginData: async (pluginId: string) => {
        await this.runtime?.data.deleteData(pluginId);
      },
      getPluginSettingTabs: async (pluginId: string) => {
        return this.getPluginRuntimeSettingTabSummaries(pluginId);
      },
      syncRenamedWorkspaceFile: async (oldPath: string, newPath: string) => {
        await this.runtime?.app.workspace.syncRenamedWorkspaceFilePath(oldPath, newPath);
      },
      syncDeletedWorkspaceFile: async (filePath: string) => {
        await this.runtime?.app.workspace.syncDeletedWorkspaceFilePath(filePath);
      },
      readRuntimeEntrySource: async (surface: PluginUiRuntimeSurfaceDescriptor) => {
        return await this.readRuntimeEntrySource(surface);
      },
      handleEditorSuggestKey: async (key: string) => {
        return this.handleActiveEditorSuggestKey(key);
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
      if (this.runtime !== null) {
        const handledInMain = await this.runtime.protocols.dispatchProtocol(data);

        if (handledInMain) {
          return true;
        }
      }

      const remoteResult = await this.pluginSupervisorService.executeRemoteProtocol(data);
      return remoteResult.handled;
    });
    installPluginHostBasesBridge(async (pluginId, viewId) => {
      if (this.runtime !== null) {
        const snapshot = await this.runtime.bases.renderRegisteredView(pluginId, viewId);

        if (snapshot !== null) {
          return snapshot;
        }
      }

      const remoteResult = await this.pluginSupervisorService.executeRemoteBasesView(pluginId, viewId);
      return remoteResult.snapshot;
    });
    this.pluginUiUnsubscribe = this.runtime.ui.subscribe(() => {
      this.emitPluginUiEntriesChanged();
    });
    this.pluginCommandUnsubscribe = this.runtime.commands.subscribe(() => {
      void this.syncSupervisorCommands();
      this.emitPluginUiEntriesChanged();
    });
    this.editorBridgeUnsubscribe = dependencies.editorBridge.subscribeStateChanges(() => {
      this.scheduleActiveEditorSuggestRefresh();
    });
    await this.syncSupervisorCommands();
    this.emitPluginUiEntriesChanged();
  }

  private async syncSupervisorCommands(): Promise<void> {
    try {
      await this.pluginSupervisorService.syncCommandContributions(
        this.runtime?.commands.getSupervisorCommandSnapshots() ?? [],
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to synchronize plugin command contributions to the plugin supervisor.';
      console.error('[PluginHostManager] plugin supervisor command sync failed:', message);
    }
  }

  private async loadDiscoveredPlugins(): Promise<void> {
    for (const descriptor of this.discoveryService.getAll()) {
      if (this.pluginSupervisorService.isPluginOwnedBySupervisor(descriptor.manifest.id)) {
        continue;
      }

      await this.loadPlugin(descriptor);
    }

    this.refreshInstalledPlugins();
    this.scheduleActiveEditorSuggestRefresh();
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

      await runWithPluginExecutionContext(descriptor.manifest.id, async () => {
        await load.call(instance);
        await enable.call(instance);
      });

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
            await runWithPluginExecutionContext(descriptor.manifest.id, async () => {
              await fail.call(instance, normalizedError);
            });
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

    this.clearPendingEditorSuggestRefresh();
    this.closeActiveEditorSuggest();

    for (const record of [...this.loadedPlugins.values()].reverse()) {
      try {
        const unload = resolvePluginMethod<PluginLifecycleVoidMethod>(
          record.instance,
          PLUGIN_INTERNAL_UNLOAD,
          GLOBAL_PLUGIN_INTERNAL_UNLOAD,
        );

        if (unload !== null) {
          await runWithPluginExecutionContext(record.descriptor.manifest.id, async () => {
            await unload.call(record.instance);
          });
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

  private clearPendingEditorSuggestRefresh(): void {
    if (this.pendingEditorSuggestRefreshTimer === null) {
      return;
    }

    clearTimeout(this.pendingEditorSuggestRefreshTimer);
    this.pendingEditorSuggestRefreshTimer = null;
  }

  private scheduleActiveEditorSuggestRefresh(): void {
    this.clearPendingEditorSuggestRefresh();
    this.pendingEditorSuggestRefreshTimer = setTimeout(() => {
      this.pendingEditorSuggestRefreshTimer = null;
      void this.refreshActiveEditorSuggest();
    }, 0);
  }

  private closeActiveEditorSuggest(
    except: EditorSuggest<SuggestionValue> | null = null,
    pluginId: string | null = null,
  ): void {
    if (this.activeEditorSuggest !== null && this.activeEditorSuggest !== except) {
      if (this.activeEditorSuggestPluginId === null) {
        this.activeEditorSuggest.close();
      } else {
        runWithPluginExecutionContext(this.activeEditorSuggestPluginId, () => {
          this.activeEditorSuggest?.close();
        });
      }
    }

    if (except === null) {
      this.activeEditorSuggest = null;
      this.activeEditorSuggestPluginId = null;
    } else {
      this.activeEditorSuggest = except;
      this.activeEditorSuggestPluginId = pluginId;
    }
  }

  private async refreshEditorSuggestCompat(
    editorSuggest: EditorSuggest<SuggestionValue>,
    context: EditorSuggestContext,
    anchorRect: PluginRuntimeAnchorRect | null,
  ): Promise<boolean> {
    const internalEditorSuggest = editorSuggest as EditorSuggest<SuggestionValue> & InternalEditorSuggestRuntime;
    const refreshHandler = internalEditorSuggest[EDITOR_SUGGEST_INTERNAL_REFRESH];

    if (typeof refreshHandler === 'function') {
      return await refreshHandler.call(editorSuggest, {
        context,
        anchorRect,
      });
    }

    const compatibleEditorSuggest = editorSuggest as EditorSuggest<SuggestionValue> & CompatibleEditorSuggestRuntime;
    compatibleEditorSuggest.context = context;
    compatibleEditorSuggest.setHostPopoverAnchorRect(anchorRect);
    const suggestions = (await compatibleEditorSuggest.getSuggestions(context)).slice(0, compatibleEditorSuggest.limit);

    if (suggestions.length === 0) {
      compatibleEditorSuggest.close();
      return false;
    }

    compatibleEditorSuggest.setSuggestions(suggestions);
    compatibleEditorSuggest.open();
    return true;
  }

  private handleEditorSuggestCompatKey(
    editorSuggest: EditorSuggest<SuggestionValue>,
    key: string,
  ): boolean {
    const internalEditorSuggest = editorSuggest as EditorSuggest<SuggestionValue> & InternalEditorSuggestRuntime;
    const handleKeyHandler = internalEditorSuggest[EDITOR_SUGGEST_INTERNAL_HANDLE_KEY];

    if (typeof handleKeyHandler === 'function') {
      return handleKeyHandler.call(editorSuggest, key);
    }

    const compatibleEditorSuggest = editorSuggest as EditorSuggest<SuggestionValue> & CompatibleEditorSuggestRuntime;

    if (key === 'ArrowDown') {
      return compatibleEditorSuggest.moveSelection(1);
    }

    if (key === 'ArrowUp') {
      return compatibleEditorSuggest.moveSelection(-1);
    }

    if (key === 'Enter') {
      return compatibleEditorSuggest.selectActiveSuggestion(
        createSyntheticEditorSuggestKeyboardEvent('Enter'),
      );
    }

    if (key === 'Escape') {
      compatibleEditorSuggest.close();
      return true;
    }

    return false;
  }

  private handleActiveEditorSuggestKey(key: string): boolean {
    if (this.activeEditorSuggest === null) {
      return false;
    }

    if (this.activeEditorSuggestPluginId === null) {
      return this.handleEditorSuggestCompatKey(this.activeEditorSuggest, key);
    }

    return runWithPluginExecutionContext(this.activeEditorSuggestPluginId, () => {
      return this.handleEditorSuggestCompatKey(this.activeEditorSuggest as EditorSuggest<SuggestionValue>, key);
    });
  }

  private async refreshActiveEditorSuggest(): Promise<void> {
    const runtime = this.runtime;
    const refreshSequence = ++this.editorSuggestRefreshSequence;

    try {
      if (runtime === null) {
        this.closeActiveEditorSuggest();
        return;
      }

      const dependencies = this.getDependencies();

      if (dependencies === null) {
        this.closeActiveEditorSuggest();
        return;
      }

      let activeEditor = await runtime.app.workspace.refreshActiveEditorState();

      if (refreshSequence !== this.editorSuggestRefreshSequence || runtime !== this.runtime) {
        return;
      }

      if (activeEditor === null) {
        const fallbackDocumentUri = dependencies.editorBridge.getLastKnownDocumentUri();

        if (fallbackDocumentUri !== null) {
          activeEditor = await runtime.app.workspace.refreshActiveEditorState(fallbackDocumentUri);

          if (refreshSequence !== this.editorSuggestRefreshSequence || runtime !== this.runtime) {
            return;
          }
        }
      }

      if (
        activeEditor === null
        || activeEditor.editor === undefined
        || activeEditor.file === null
      ) {
        this.closeActiveEditorSuggest();
        return;
      }

      const activeEditorInstance = activeEditor.editor;

      if (!activeEditorInstance.hasFocus()) {
        this.closeActiveEditorSuggest();
        return;
      }

      const anchorRect = runtime.app.workspace.getActiveEditorCaretRect();

      if (anchorRect === null) {
        this.closeActiveEditorSuggest();
        return;
      }

      const registeredSuggests = [...runtime.editors.getRegisteredSuggests()].reverse();

      for (const entry of registeredSuggests) {
        const editorSuggest = entry.editorSuggest;
        const trigger = runWithPluginExecutionContext(entry.pluginId, () => {
          return editorSuggest.onTrigger(
            activeEditorInstance.getCursor(),
            activeEditorInstance,
            activeEditor.file,
          );
        });

        if (trigger === null) {
          continue;
        }

        const context: EditorSuggestContext = {
          ...trigger,
          editor: activeEditorInstance,
          file: activeEditor.file,
        };
        const opened = await runWithPluginExecutionContext(entry.pluginId, async () => {
          return await this.refreshEditorSuggestCompat(
            editorSuggest,
            context,
            anchorRect,
          );
        });

        if (refreshSequence !== this.editorSuggestRefreshSequence || runtime !== this.runtime) {
          return;
        }

        if (!opened) {
          continue;
        }

        this.closeActiveEditorSuggest(editorSuggest, entry.pluginId);
        return;
      }

      this.closeActiveEditorSuggest();
    } catch (error) {
      if (refreshSequence !== this.editorSuggestRefreshSequence || runtime !== this.runtime) {
        return;
      }

      this.closeActiveEditorSuggest();
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      console.warn('[PluginHostManager] Failed to refresh active editor suggest.', normalizedError);
    }
  }

  private refreshInstalledPlugins(): void {
    this.installedPlugins = this.discoveryService.getAll().map((descriptor) => {
      const loaded = this.loadedPlugins.get(descriptor.manifest.id);
      const failure = this.loadFailures.get(descriptor.manifest.id);
      const supervisorRuntimeState = this.pluginSupervisorService.getPluginRuntimeState(descriptor.manifest.id);
      const runtimeState = resolveInstalledPluginSupervisorOverlay(
        descriptor.entryPath === null || loaded?.snapshot.state === 'enabled',
        failure?.message ?? null,
        supervisorRuntimeState,
      );

      return descriptorToInstalledPluginSummary(
        descriptor,
        runtimeState.enabled,
        runtimeState.failureMessage,
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
