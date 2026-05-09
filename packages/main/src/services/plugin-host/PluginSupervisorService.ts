/**
 * Main-process manager for the shared plugin supervisor utility process.
 * This is the phase-2 fault-domain foundation: the service can spawn,
 * health-check, and synchronize plugin discovery state with a dedicated worker
 * process before plugin lifecycle execution migrates out of the main process.
 */

import { app, utilityProcess, type UtilityProcess } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  AppProtocolData,
  JsonValue as PluginJsonValue,
  WorkspaceLeaf,
} from '@note-studio/plugin';
import type {
  JsonValue as SharedJsonValue,
  PluginUiEntrySnapshot,
  WorkbenchCommandContributionEntry,
  WorkbenchResourceExplorerItemContributionEntry,
} from '@note-studio/shared';
import type { SettingsManager } from '../../config/SettingsManager';
import {
  type MainProcessAppFacade,
  MainProcessWorkspaceLeaf,
} from './MainProcessAppFacade';
import type { BasesViewSnapshot } from './MainProcessPluginRuntime';
import type { PluginDescriptor, PluginSettingTabSummary } from './types';
import { URL_BROWSER_VIEW_TYPE } from '../UrlBrowserDownloadService';
import {
  descriptorToSupervisorSnapshot,
  type PluginSupervisorChildMessage,
  type PluginSupervisorCommandSnapshot,
  type PluginSupervisorDescriptorSnapshot,
  type PluginSupervisorExtensionSnapshot,
  type PluginSupervisorHostResponsePayload,
  type PluginSupervisorPluginRuntimeSnapshot,
  type PluginSupervisorProtocolSnapshot,
  type PluginSupervisorResourceExplorerItemSnapshot,
  type PluginSupervisorSettingTabSnapshot,
  type PluginSupervisorViewInstanceSnapshot,
  type PluginSupervisorViewSnapshot,
  type PluginSupervisorWorkspaceEventPayload,
  type PluginSupervisorWorkspaceLeafSnapshot,
  type PluginSupervisorHostRequestMessage,
  type PluginSupervisorHostRequestPayload,
  type PluginSupervisorParentMessage,
  type PluginSupervisorParentControlMessage,
  type PluginSupervisorStateSnapshot,
  type PluginSupervisorWorkspaceSnapshot,
} from './pluginSupervisorProtocol';
import { emitPluginRuntimeNotice } from '../../ipc/pluginRuntimeHandlers';
import { rememberPersistentResourceExplorerItem } from './PersistentResourceExplorerItems';
import { resolvePluginRuntimeOwner } from './pluginRuntimeOwnership';

interface PendingSupervisorRequest {
  readonly type:
    | 'pong'
    | 'sync-complete'
    | 'commands-sync-complete'
    | 'shutdown-complete'
    | 'plugin-started'
    | 'command-executed'
    | 'protocol-executed'
    | 'bases-view-rendered'
    | 'ui-entry-executed'
    | 'ui-action-executed'
    | 'view-instance-opened'
    | 'view-instance-updated'
    | 'view-instance-resized'
    | 'view-instance-closed';
  readonly resolve: (message: PluginSupervisorChildMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const SUPERVISOR_START_TIMEOUT_MS = 30_000;
const SUPERVISOR_READY_TIMEOUT_MS = 30_000;
const SUPERVISOR_REQUEST_TIMEOUT_MS = 15_000;
const SUPERVISOR_HEARTBEAT_INTERVAL_MS = 15_000;
const SUPERVISOR_SERVICE_NAME = 'Plugin Supervisor';
const SUPERVISOR_UNEXPECTED_EXIT_NOTICE = '某插件后台服务异常退出，已尝试重启';
const SUPERVISOR_PLUGIN_FATAL_FAILURE_WINDOW_MS = 60_000;
const SUPERVISOR_PLUGIN_FATAL_FAILURE_LIMIT = 3;
const SUPERVISOR_LOG_RATE_WINDOW_MS = 5_000;
const SUPERVISOR_LOG_RATE_LIMIT = 12;
const SUPERVISOR_LOG_MESSAGE_MAX_LENGTH = 4_096;

type SupervisorChildProcessGoneType =
  | 'Utility'
  | 'Zygote'
  | 'Sandbox helper'
  | 'GPU'
  | 'Pepper Plugin'
  | 'Pepper Plugin Broker'
  | 'Unknown';

type SupervisorChildProcessGoneReason =
  | 'clean-exit'
  | 'abnormal-exit'
  | 'killed'
  | 'crashed'
  | 'oom'
  | 'launch-failed'
  | 'integrity-failure';

interface SupervisorChildProcessGoneDetails {
  readonly type: SupervisorChildProcessGoneType;
  readonly reason: SupervisorChildProcessGoneReason;
  readonly exitCode: number;
  readonly serviceName?: string;
  readonly name?: string;
}

interface TemporarilyDisabledPluginRecord {
  readonly message: string;
  readonly disabledAt: number;
}

type SupervisorLogChannel = 'stdout' | 'stderr' | 'worker-error';

interface SupervisorLogRateState {
  readonly windowStartedAt: number;
  readonly forwardedCount: number;
  readonly suppressedCount: number;
  readonly suppressionNoticeEmitted: boolean;
}

const SUPERVISOR_CRASH_REASONS = new Set<SupervisorChildProcessGoneReason>([
  'abnormal-exit',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
]);

type PluginSupervisorRequestMessage = Exclude<PluginSupervisorParentControlMessage, { readonly type: 'initialize' }>;
type PluginSupervisorTrackedRequestMessage = Exclude<
  PluginSupervisorRequestMessage,
  { readonly type: 'push-workspace-event' }
>;

interface PendingSupervisorViewWorkspaceLeaf extends WorkspaceLeaf {
  registerPendingSupervisorViewInstanceToken(viewType: string, pendingViewInstanceId: string): void;
}

function resolveWorkspaceLeafMode(
  hostApp: MainProcessAppFacade,
  mode: 'default' | 'force-new' | 'tab' | 'split' | 'window',
): WorkspaceLeaf {
  if (mode === 'tab') {
    return hostApp.workspace.getLeaf('tab');
  }

  if (mode === 'split') {
    return hostApp.workspace.getLeaf('split');
  }

  if (mode === 'window') {
    return hostApp.workspace.getLeaf('window');
  }

  if (mode === 'force-new') {
    return hostApp.workspace.getLeaf(true);
  }

  return hostApp.workspace.getLeaf();
}

export function resolveWorkspaceLeafForViewStateRequest(
  hostApp: MainProcessAppFacade,
  request: Extract<PluginSupervisorHostRequestPayload, { readonly kind: 'workspace:leaf-set-view-state' }>,
  existingLeaf: WorkspaceLeaf | null,
): WorkspaceLeaf {
  if (request.viewType === URL_BROWSER_VIEW_TYPE) {
    if (existingLeaf?.getViewState().type === request.viewType) {
      return existingLeaf;
    }

    const [singletonLeaf] = hostApp.workspace.getLeavesOfType(request.viewType);

    if (singletonLeaf !== undefined) {
      return singletonLeaf;
    }
  }

  return existingLeaf ?? resolveWorkspaceLeafMode(hostApp, request.newLeafMode);
}

function registerPendingSupervisorViewInstanceToken(
  leaf: WorkspaceLeaf,
  viewType: string,
  pendingViewInstanceId: string | null,
): void {
  const normalizedPendingViewInstanceId = pendingViewInstanceId?.trim() ?? '';

  if (normalizedPendingViewInstanceId.length === 0) {
    return;
  }

  if (
    'registerPendingSupervisorViewInstanceToken' in leaf
    && typeof leaf.registerPendingSupervisorViewInstanceToken === 'function'
  ) {
    (leaf as PendingSupervisorViewWorkspaceLeaf).registerPendingSupervisorViewInstanceToken(
      viewType,
      normalizedPendingViewInstanceId,
    );
  }
}

function normalizeJsonObject(
  value: PluginJsonValue | SharedJsonValue | null,
): Record<string, SharedJsonValue> | null {
  const normalizedValue = toSharedJsonValue(value);

  if (
    normalizedValue === null
    || Array.isArray(normalizedValue)
    || typeof normalizedValue !== 'object'
  ) {
    return null;
  }

  return normalizedValue;
}

function toSharedJsonValue(
  value: PluginJsonValue | SharedJsonValue | null,
): SharedJsonValue | null {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const entries: SharedJsonValue[] = [];

    for (const entry of value) {
      const normalizedEntry = toSharedJsonValue(entry);
      entries.push(normalizedEntry);
    }

    return entries;
  }

  const normalizedObject: Record<string, SharedJsonValue> = {};

  for (const [key, entry] of Object.entries(value)) {
    normalizedObject[key] = toSharedJsonValue(entry);
  }

  return normalizedObject;
}

function createWorkspaceSnapshot(hostApp: MainProcessAppFacade): PluginSupervisorWorkspaceSnapshot {
  const leaves: PluginSupervisorWorkspaceLeafSnapshot[] = [];

  hostApp.workspace.iterateAllLeaves((leaf) => {
    leaves.push(createWorkspaceLeafSnapshot(leaf));
  });

  return {
    activeLeafId: hostApp.workspace.activeLeaf?.id ?? null,
    activeFilePath: hostApp.workspace.getActiveFile()?.path ?? null,
    lastOpenFiles: hostApp.workspace.getLastOpenFiles(),
    leaves,
  };
}

function createWorkspaceLeafSnapshot(leaf: WorkspaceLeaf): PluginSupervisorWorkspaceLeafSnapshot {
  const viewState = leaf.getViewState();

  return {
    id: leaf.id,
    viewType: viewState.type,
    pinned: viewState.pinned === true,
    state: normalizeJsonObject(viewState.state ?? null),
    ephemeralState: toSharedJsonValue(leaf.getEphemeralState()),
    displayText: leaf.getDisplayText(),
    icon: leaf.getIcon(),
  };
}

export class PluginSupervisorService {
  private child: UtilityProcess | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private childProcessGoneListenerAttached = false;
  private childTerminationNoticeEmitted = false;
  private readonly stateListeners = new Set<() => void>();
  private readonly commandContributionListeners = new Set<() => void>();
  private readonly settingTabListeners = new Set<() => void>();
  private readonly viewRegistrationListeners = new Set<() => void>();
  private readonly resourceExplorerItemListeners = new Set<() => void>();
  private readonly pluginUiEntryListeners = new Set<() => void>();
  private readonly pluginRuntimeStateListeners = new Set<() => void>();
  private readonly pendingRequests = new Map<string, PendingSupervisorRequest>();
  private cachedDescriptors: readonly PluginSupervisorDescriptorSnapshot[] = [];
  private cachedCommandSnapshots: readonly PluginSupervisorCommandSnapshot[] = [];
  private remoteCommands: readonly PluginSupervisorCommandSnapshot[] = [];
  private remoteSettingTabs: readonly PluginSupervisorSettingTabSnapshot[] = [];
  private remoteViews: readonly PluginSupervisorViewSnapshot[] = [];
  private remoteResourceExplorerItems: readonly PluginSupervisorResourceExplorerItemSnapshot[] = [];
  private remoteExtensions: readonly PluginSupervisorExtensionSnapshot[] = [];
  private remoteUiEntries: readonly PluginUiEntrySnapshot[] = [];
  private remotePluginRuntimeStates: readonly PluginSupervisorPluginRuntimeSnapshot[] = [];
  private readonly knownProtocolOwners = new Map<string, string>();
  private readonly pluginFatalFailureTimestamps = new Map<string, readonly number[]>();
  private readonly temporarilyDisabledPlugins = new Map<string, TemporarilyDisabledPluginRecord>();
  private readonly supervisorLogRateStates = new Map<SupervisorLogChannel, SupervisorLogRateState>();
  private descriptorRuntimeKeys = new Map<string, string>();
  private recoveryPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private nextRequestId = 0;
  private readonly handleChildProcessGoneEvent = (
    _event: object,
    details: SupervisorChildProcessGoneDetails,
  ): void => {
    this.handleChildProcessGone(details);
  };
  private state: PluginSupervisorStateSnapshot = {
    status: 'stopped',
    pluginCount: 0,
    pid: null,
    lastHeartbeatAt: null,
    lastSyncedAt: null,
    startedAt: null,
    lastError: null,
  };

  public constructor(
    private readonly getSettingsManager: () => SettingsManager | null,
    private readonly getWorkspaceDir: () => string | null,
    private readonly getHostApp: () => MainProcessAppFacade | null,
  ) {}

  public getSnapshot(): PluginSupervisorStateSnapshot {
    return this.state;
  }

  public subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public subscribeCommandContributions(listener: () => void): () => void {
    this.commandContributionListeners.add(listener);

    return () => {
      this.commandContributionListeners.delete(listener);
    };
  }

  public subscribePluginRuntimeStates(listener: () => void): () => void {
    this.pluginRuntimeStateListeners.add(listener);

    return () => {
      this.pluginRuntimeStateListeners.delete(listener);
    };
  }

  public subscribeSettingTabs(listener: () => void): () => void {
    this.settingTabListeners.add(listener);

    return () => {
      this.settingTabListeners.delete(listener);
    };
  }

  public subscribeViewRegistrations(listener: () => void): () => void {
    this.viewRegistrationListeners.add(listener);

    return () => {
      this.viewRegistrationListeners.delete(listener);
    };
  }

  public subscribeResourceExplorerItems(listener: () => void): () => void {
    this.resourceExplorerItemListeners.add(listener);

    return () => {
      this.resourceExplorerItemListeners.delete(listener);
    };
  }

  public subscribePluginUiEntries(listener: () => void): () => void {
    this.pluginUiEntryListeners.add(listener);

    return () => {
      this.pluginUiEntryListeners.delete(listener);
    };
  }

  public getPluginRuntimeState(pluginId: string): PluginSupervisorPluginRuntimeSnapshot | null {
    return this.remotePluginRuntimeStates.find((state) => state.pluginId === pluginId) ?? null;
  }

  public isPluginTemporarilyDisabled(pluginId: string): boolean {
    return this.getTemporarilyDisabledPluginMessage(pluginId) !== null;
  }

  public getTemporarilyDisabledPluginMessage(pluginId: string): string | null {
    const normalizedPluginId = pluginId.trim();

    if (normalizedPluginId.length === 0) {
      return null;
    }

    return this.temporarilyDisabledPlugins.get(normalizedPluginId)?.message ?? null;
  }

  public clearTemporarilyDisabledPlugin(pluginId: string): boolean {
    const normalizedPluginId = pluginId.trim();

    if (normalizedPluginId.length === 0) {
      return false;
    }

    const hadTemporaryDisable = this.temporarilyDisabledPlugins.delete(normalizedPluginId);
    const hadFailureHistory = this.pluginFatalFailureTimestamps.delete(normalizedPluginId);
    return hadTemporaryDisable || hadFailureHistory;
  }

  public isPluginOwnedBySupervisor(pluginId: string): boolean {
    return this.getPluginRuntimeState(pluginId)?.owner === 'supervisor';
  }

  public getCommandContributions(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly WorkbenchCommandContributionEntry[] {
    return this.remoteCommands.map((command) => ({
      extensionId: command.pluginId,
      extensionDisplayName: resolvePluginDisplayName(command.pluginId),
      commandId: command.commandId,
      title: command.title,
      category: command.category,
      icon: command.icon,
    }));
  }

  public getSettingTabSummaries(
    resolvePluginDisplayName: (pluginId: string) => string,
  ): readonly PluginSettingTabSummary[] {
    return this.remoteSettingTabs.map((settingTab) => ({
      id: settingTab.id,
      pluginId: settingTab.pluginId,
      pluginName: resolvePluginDisplayName(settingTab.pluginId),
      title: settingTab.title,
      preview: null,
      previewLines: [],
      runtimeSurface: null,
    }));
  }

  public getPluginIdForViewType(viewType: string): string | null {
    return this.remoteViews.find((entry) => entry.viewType === viewType)?.pluginId ?? null;
  }

  public getResourceExplorerItemContributions(
    resolvePluginDisplayName: (pluginId: string) => string,
    _resolvePluginViewRuntimeSurface: (
      pluginId: string,
      viewType: string,
    ) => {
      readonly entryUrl: string;
    } | null,
  ): readonly WorkbenchResourceExplorerItemContributionEntry[] {
    return this.remoteResourceExplorerItems.map((item) => {
      return {
        extensionId: item.pluginId,
        extensionDisplayName: resolvePluginDisplayName(item.pluginId),
        itemKey: `${item.pluginId}:${item.itemId}`,
        itemId: item.itemId,
        title: item.title,
        icon: item.icon,
        viewType: item.viewType,
        directoryPath: item.directoryPath,
        webviewEntryUrl: null,
        webviewHtml: null,
        retainContextWhenHidden: item.retainContextWhenHidden,
      };
    });
  }

  public getViewTypeForExtension(extension: string): string | null {
    const normalizedExtension = extension.trim().toLowerCase();

    if (normalizedExtension.length === 0) {
      return null;
    }

    return this.remoteExtensions.find((entry) => entry.extension === normalizedExtension)?.viewType ?? null;
  }

  public getPluginUiEntries(): readonly PluginUiEntrySnapshot[] {
    return this.remoteUiEntries;
  }

  public pushWorkspaceEvent(event: PluginSupervisorWorkspaceEventPayload): void {
    if (this.child === null || this.state.status !== 'ready') {
      return;
    }

    this.child.postMessage({
      type: 'push-workspace-event',
      data: {
        event,
      },
    });
  }

  public async initialize(descriptors: readonly PluginDescriptor[]): Promise<void> {
    this.shuttingDown = false;
    this.cachedDescriptors = descriptors.map((descriptor) => {
      return descriptorToSupervisorSnapshot(descriptor, resolvePluginRuntimeOwner(descriptor));
    });
    this.syncTrackedDescriptorRuntimeKeys();
    await this.ensureChildReady();
    const message = await this.syncCachedDescriptors();

    if (message.type !== 'sync-complete') {
      throw new Error('Plugin supervisor returned an unexpected sync response.');
    }

    this.updateState({
      pluginCount: message.data.pluginCount,
      lastSyncedAt: Date.now(),
      lastError: null,
      status: 'ready',
    });
    this.startHeartbeatLoop();
  }

  public async syncDiscoveredPlugins(descriptors: readonly PluginDescriptor[]): Promise<void> {
    this.cachedDescriptors = descriptors.map((descriptor) => {
      return descriptorToSupervisorSnapshot(descriptor, resolvePluginRuntimeOwner(descriptor));
    });
    this.syncTrackedDescriptorRuntimeKeys();
    await this.ensureChildReady();
    const message = await this.syncCachedDescriptors();

    if (message.type !== 'sync-complete') {
      throw new Error('Plugin supervisor returned an unexpected sync response.');
    }

    this.updateState({
      pluginCount: message.data.pluginCount,
      lastSyncedAt: Date.now(),
      lastError: null,
      status: 'ready',
    });
  }

  public async syncCommandContributions(
    commands: readonly PluginSupervisorCommandSnapshot[],
  ): Promise<void> {
    this.cachedCommandSnapshots = commands;
    await this.ensureChildReady();

    const response = await this.syncCachedCommands();

    if (response.type !== 'commands-sync-complete') {
      throw new Error('Plugin supervisor returned an unexpected command sync response.');
    }
  }

  public async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.flushSupervisorLogRateStates();
    this.stopHeartbeatLoop();

    if (this.recoveryPromise !== null) {
      await this.recoveryPromise;
    }

    if (this.child === null) {
      this.updateRemoteCommands([]);
      this.updateRemoteSettingTabs([]);
      this.updateRemoteViews([]);
      this.updateRemoteResourceExplorerItems([]);
      this.updateRemoteExtensions([]);
      this.updateRemoteProtocols([]);
      this.updateRemoteUiEntries([]);
      this.updateRemotePluginRuntimeStates([]);
      this.updateState({
        status: 'stopped',
        pid: null,
        lastError: null,
      });
      return;
    }

    const targetChild = this.child;
    const requestId = this.createRequestId('shutdown');

    try {
      await this.sendRequest({
        type: 'shutdown',
        data: {
          requestId,
        },
      }, 'shutdown-complete');
    } catch {
      this.detachChild(targetChild);
      this.child = null;
      targetChild.kill();
    } finally {
      if (this.child === targetChild) {
        this.child = null;
      }

      this.updateState({
        status: 'stopped',
        pid: null,
        lastError: null,
      });
      this.updateRemoteCommands([]);
      this.updateRemoteSettingTabs([]);
      this.updateRemoteViews([]);
      this.updateRemoteResourceExplorerItems([]);
      this.updateRemoteExtensions([]);
      this.updateRemoteProtocols([]);
      this.updateRemoteUiEntries([]);
      this.updateRemotePluginRuntimeStates([]);
    }
  }

  public async startPlugin(pluginId: string): Promise<boolean> {
    const normalizedPluginId = pluginId.trim();

    if (normalizedPluginId.length === 0) {
      return false;
    }

    this.assertPluginRestartAllowed(normalizedPluginId);

    await this.ensureChildReady();

    if (this.child === null) {
      return false;
    }

    const requestId = this.createRequestId('start-plugin');
    const response = await this.sendRequest({
      type: 'start-plugin',
      data: {
        requestId,
        pluginId: normalizedPluginId,
      },
    }, 'plugin-started');

    if (response.type !== 'plugin-started') {
      throw new Error('Plugin supervisor returned an unexpected plugin start response.');
    }

    return response.data.handled;
  }

  public async executeRemoteCommand(
    commandId: string,
    args: readonly SharedJsonValue[],
  ): Promise<{
    readonly handled: boolean;
    readonly result: SharedJsonValue | null;
    readonly fallbackToMain: boolean;
  }> {
    const blockedPluginId = this.resolvePluginIdForCommand(commandId);

    if (blockedPluginId !== null) {
      this.assertPluginRestartAllowed(blockedPluginId);
    }

    await this.ensureChildReady();

    if (this.child === null) {
      return {
        handled: false,
        result: null,
        fallbackToMain: true,
      };
    }

    const requestId = this.createRequestId('execute-command');
    const response = await this.sendRequest({
      type: 'execute-command',
      data: {
        requestId,
        commandId,
        args,
      },
    }, 'command-executed');

    if (response.type !== 'command-executed') {
      throw new Error('Plugin supervisor returned an unexpected command execution response.');
    }

    return {
      handled: response.data.handled,
      result: response.data.result,
      fallbackToMain: response.data.fallbackToMain,
    };
  }

  public async executeRemoteProtocol(
    protocolData: AppProtocolData,
  ): Promise<{
    readonly handled: boolean;
    readonly fallbackToMain: boolean;
  }> {
    const blockedPluginId = this.resolvePluginIdForProtocol(protocolData.action);

    if (blockedPluginId !== null) {
      this.assertPluginRestartAllowed(blockedPluginId);
    }

    await this.ensureChildReady();

    if (this.child === null) {
      return {
        handled: false,
        fallbackToMain: true,
      };
    }

    const requestId = this.createRequestId('execute-protocol');
    const response = await this.sendRequest({
      type: 'execute-protocol',
      data: {
        requestId,
        protocolData,
      },
    }, 'protocol-executed');

    if (response.type !== 'protocol-executed') {
      throw new Error('Plugin supervisor returned an unexpected protocol execution response.');
    }

    return {
      handled: response.data.handled,
      fallbackToMain: response.data.fallbackToMain,
    };
  }

  public async executeRemoteBasesView(
    pluginId: string,
    viewId: string,
  ): Promise<{
      readonly handled: boolean;
      readonly snapshot: BasesViewSnapshot | null;
      readonly fallbackToMain: boolean;
    }> {
    this.assertPluginRestartAllowed(pluginId);
    await this.ensureChildReady();

    if (this.child === null) {
      return {
        handled: false,
        snapshot: null,
        fallbackToMain: true,
      };
    }

    const requestId = this.createRequestId('execute-bases-view');
    const response = await this.sendRequest({
      type: 'execute-bases-view',
      data: {
        requestId,
        pluginId,
        viewId,
      },
    }, 'bases-view-rendered');

    if (response.type !== 'bases-view-rendered') {
      throw new Error('Plugin supervisor returned an unexpected bases view execution response.');
    }

    return {
      handled: response.data.handled,
      snapshot: response.data.snapshot,
      fallbackToMain: response.data.fallbackToMain,
    };
  }

  public async executeRemoteUiEntry(entryId: string): Promise<boolean> {
    const blockedPluginId = this.resolvePluginIdForUiEntry(entryId);

    if (blockedPluginId !== null) {
      this.assertPluginRestartAllowed(blockedPluginId);
    }

    await this.ensureChildReady();

    if (this.child === null) {
      return false;
    }

    const requestId = this.createRequestId('execute-ui-entry');
    const response = await this.sendRequest({
      type: 'execute-ui-entry',
      data: {
        requestId,
        entryId,
      },
    }, 'ui-entry-executed');

    if (response.type !== 'ui-entry-executed') {
      throw new Error('Plugin supervisor returned an unexpected UI entry execution response.');
    }

    return response.data.handled;
  }

  public async executeRemoteUiAction(
    pluginId: string,
    actionId: string,
    payload: SharedJsonValue | null,
  ): Promise<{
    readonly handled: boolean;
    readonly result: SharedJsonValue | null;
  }> {
    this.assertPluginRestartAllowed(pluginId);
    await this.ensureChildReady();

    if (this.child === null) {
      return {
        handled: false,
        result: null,
      };
    }

    const requestId = this.createRequestId('execute-ui-action');
    const response = await this.sendRequest({
      type: 'execute-ui-action',
      data: {
        requestId,
        pluginId,
        actionId,
        payload,
      },
    }, 'ui-action-executed');

    if (response.type !== 'ui-action-executed') {
      throw new Error('Plugin supervisor returned an unexpected UI action execution response.');
    }

    return {
      handled: response.data.handled,
      result: response.data.result,
    };
  }

  public async openRemoteViewInstance(
    leafId: string,
    viewType: string,
    pendingViewInstanceId: string | null = null,
  ): Promise<PluginSupervisorViewInstanceSnapshot | null> {
    const blockedPluginId = this.resolvePluginIdForViewType(viewType);

    if (blockedPluginId !== null) {
      this.assertPluginRestartAllowed(blockedPluginId);
    }

    await this.ensureChildReady();

    if (this.child === null) {
      return null;
    }

    const requestId = this.createRequestId('open-view-instance');
    const response = await this.sendRequest({
      type: 'open-view-instance',
      data: {
        requestId,
        leafId,
        viewType,
        pendingViewInstanceId,
      },
    }, 'view-instance-opened');

    if (response.type !== 'view-instance-opened') {
      throw new Error('Plugin supervisor returned an unexpected view open response.');
    }

    return response.data.handled ? response.data.snapshot : null;
  }

  public async updateRemoteViewInstance(
    leafId: string,
    viewType: string,
    state: SharedJsonValue | null,
  ): Promise<PluginSupervisorViewInstanceSnapshot | null> {
    const blockedPluginId = this.resolvePluginIdForViewType(viewType);

    if (blockedPluginId !== null) {
      this.assertPluginRestartAllowed(blockedPluginId);
    }

    await this.ensureChildReady();

    if (this.child === null) {
      return null;
    }

    const requestId = this.createRequestId('update-view-instance');
    const response = await this.sendRequest({
      type: 'update-view-instance',
      data: {
        requestId,
        leafId,
        viewType,
        state,
      },
    }, 'view-instance-updated');

    if (response.type !== 'view-instance-updated') {
      throw new Error('Plugin supervisor returned an unexpected view update response.');
    }

    return response.data.handled ? response.data.snapshot : null;
  }

  public async resizeRemoteViewInstance(
    leafId: string,
  ): Promise<PluginSupervisorViewInstanceSnapshot | null> {
    await this.ensureChildReady();

    if (this.child === null) {
      return null;
    }

    const requestId = this.createRequestId('resize-view-instance');
    const response = await this.sendRequest({
      type: 'resize-view-instance',
      data: {
        requestId,
        leafId,
      },
    }, 'view-instance-resized');

    if (response.type !== 'view-instance-resized') {
      throw new Error('Plugin supervisor returned an unexpected view resize response.');
    }

    return response.data.handled ? response.data.snapshot : null;
  }

  public async closeRemoteViewInstance(leafId: string): Promise<boolean> {
    await this.ensureChildReady();

    if (this.child === null) {
      return false;
    }

    const requestId = this.createRequestId('close-view-instance');
    const response = await this.sendRequest({
      type: 'close-view-instance',
      data: {
        requestId,
        leafId,
      },
    }, 'view-instance-closed');

    if (response.type !== 'view-instance-closed') {
      throw new Error('Plugin supervisor returned an unexpected view close response.');
    }

    return response.data.handled;
  }

  private updateState(
    partial: Partial<PluginSupervisorStateSnapshot>,
  ): void {
    this.state = {
      ...this.state,
      ...partial,
    };

    for (const listener of [...this.stateListeners]) {
      listener();
    }
  }

  private resolveChildScriptPath(): string {
    const candidatePaths = [
      path.resolve(__dirname, '../../workers/pluginSupervisorChild.js'),
      path.resolve(app.getAppPath(), 'packages', 'main', 'src', 'workers', 'pluginSupervisorChild.js'),
      path.resolve(app.getAppPath(), 'packages', 'main', 'dist', 'main', 'src', 'workers', 'pluginSupervisorChild.js'),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    throw new Error(`Plugin supervisor worker file was not found. Tried: ${candidatePaths.join(', ')}`);
  }

  private async spawnChild(): Promise<void> {
    this.stopHeartbeatLoop();
    this.clearPendingRequests('Plugin supervisor utility process was replaced before the request completed.');
    this.updateState({
      status: 'starting',
      pid: null,
      lastError: null,
    });
    this.childTerminationNoticeEmitted = false;

    const childPath = this.resolveChildScriptPath();
    const child = utilityProcess.fork(childPath, [], {
      serviceName: SUPERVISOR_SERVICE_NAME,
      stdio: 'pipe',
    });
    this.child = child;
    this.attachChildProcessGoneListener();

    child.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message.length > 0) {
        this.logSupervisorChannelMessage('stdout', message);
      }
    });

    child.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message.length > 0) {
        this.logSupervisorChannelMessage('stderr', message);
      }
    });

    child.on('exit', (code) => {
      this.handleChildExit(child, code);
    });

    child.on('message', (message: PluginSupervisorChildMessage) => {
      this.handleChildMessage(child, message);
    });

    try {
      await this.waitForLifecycleMessage(child, 'started', SUPERVISOR_START_TIMEOUT_MS);

      try {
        if (child.pid !== undefined) {
          os.setPriority(child.pid, 10);
        }
      } catch {
        // Lowering process priority is a best-effort optimization.
      }

      child.postMessage({
        type: 'initialize',
        data: {
          hostAppPath: app.getAppPath(),
        },
      } satisfies PluginSupervisorParentMessage);

      const readyMessage = await this.waitForLifecycleMessage(child, 'ready', SUPERVISOR_READY_TIMEOUT_MS);
      if (readyMessage.type !== 'ready') {
        throw new Error('Plugin supervisor utility process failed to enter ready state.');
      }

      if (this.child !== child) {
        throw new Error('Plugin supervisor utility process changed during startup.');
      }

      this.updateState({
        status: 'ready',
        pid: child.pid ?? null,
        startedAt: readyMessage.data.startedAt,
        lastError: null,
      });
    } catch (error) {
      if (this.child === child) {
        this.detachChild(child);
        this.child = null;
      }

      try {
        child.kill();
      } catch {
        // Best-effort cleanup when startup fails.
      }

      const message = error instanceof Error
        ? error.message
        : 'Plugin supervisor utility process failed to start.';

      this.updateState({
        status: 'error',
        pid: null,
        lastError: message,
      });
      throw error;
    }
  }

  private async waitForLifecycleMessage(
    child: UtilityProcess,
    expectedType: 'started' | 'ready',
    timeoutMs: number,
  ): Promise<PluginSupervisorChildMessage> {
    return await new Promise<PluginSupervisorChildMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.removeListener('message', handleMessage);
        reject(new Error(`Timed out waiting for plugin supervisor ${expectedType} message.`));
      }, timeoutMs);

      const handleMessage = (message: PluginSupervisorChildMessage): void => {
        if (message.type !== expectedType) {
          return;
        }

        clearTimeout(timeout);
        child.removeListener('message', handleMessage);
        resolve(message);
      };

      child.on('message', handleMessage);
    });
  }

  private async sendRequest(
    message: PluginSupervisorTrackedRequestMessage,
    expectedType: PendingSupervisorRequest['type'],
  ): Promise<PluginSupervisorChildMessage> {
    if (this.child === null) {
      throw new Error('Plugin supervisor utility process is not running.');
    }

    const requestId = message.data.requestId;

    return await new Promise<PluginSupervisorChildMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Plugin supervisor request timed out: ${expectedType}`));
      }, SUPERVISOR_REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        type: expectedType,
        resolve,
        reject,
        timer,
      });

      this.child?.postMessage(message);
    });
  }

  private async ensureChildReady(): Promise<void> {
    if (this.recoveryPromise !== null) {
      await this.recoveryPromise;
    }

    if (this.child === null) {
      await this.spawnChild();
      return;
    }

    if (this.state.status === 'error') {
      await this.recoverChild('Plugin supervisor entered an error state before synchronization.');
    }
  }

  private async syncCachedDescriptors(): Promise<PluginSupervisorChildMessage> {
    if (this.child === null) {
      throw new Error('Plugin supervisor utility process is not running.');
    }

    const requestId = this.createRequestId('sync');
    return await this.sendRequest({
      type: 'sync-descriptors',
      data: {
        requestId,
        descriptors: this.cachedDescriptors,
      },
    }, 'sync-complete');
  }

  private async syncCachedCommands(): Promise<PluginSupervisorChildMessage> {
    if (this.child === null) {
      throw new Error('Plugin supervisor utility process is not running.');
    }

    const requestId = this.createRequestId('sync-commands');
    return await this.sendRequest({
      type: 'sync-commands',
      data: {
        requestId,
        commands: this.cachedCommandSnapshots,
      },
    }, 'commands-sync-complete');
  }

  private startHeartbeatLoop(): void {
    if (this.heartbeatTimer !== null) {
      return;
    }

    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, SUPERVISOR_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeatLoop(): void {
    if (this.heartbeatTimer === null) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.child === null) {
      return;
    }

    const requestId = this.createRequestId('ping');
    const sentAt = Date.now();

    try {
      const response = await this.sendRequest({
        type: 'ping',
        data: {
          requestId,
          sentAt,
        },
      }, 'pong');

      if (response.type !== 'pong') {
        throw new Error('Plugin supervisor returned an unexpected heartbeat response.');
      }

      this.updateState({
        status: 'ready',
        lastHeartbeatAt: response.data.receivedAt,
        lastError: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Plugin supervisor heartbeat failed.';
      this.updateState({
        status: 'error',
        lastError: message,
      });
      console.error('[PluginSupervisorService] heartbeat failed:', message);
      this.scheduleRecovery(`Plugin supervisor heartbeat failed: ${message}`);
    }
  }

  private handleChildMessage(child: UtilityProcess, message: PluginSupervisorChildMessage): void {
    if (child !== this.child) {
      return;
    }

    if (message.type === 'commands-updated') {
      this.updateRemoteCommands(message.data.commands);
      return;
    }

    if (message.type === 'setting-tabs-updated') {
      this.updateRemoteSettingTabs(message.data.settingTabs);
      return;
    }

    if (message.type === 'views-updated') {
      this.updateRemoteViews(message.data.views);
      return;
    }

    if (message.type === 'resource-explorer-items-updated') {
      this.updateRemoteResourceExplorerItems(message.data.items);
      return;
    }

    if (message.type === 'extensions-updated') {
      this.updateRemoteExtensions(message.data.extensions);
      return;
    }

    if (message.type === 'protocols-updated') {
      this.updateRemoteProtocols(message.data.protocols);
      return;
    }

    if (message.type === 'ui-entries-updated') {
      this.updateRemoteUiEntries(message.data.entries);
      return;
    }

    if (message.type === 'runtime-states-updated') {
      this.updateRemotePluginRuntimeStates(message.data.plugins);
      return;
    }

    if (message.type === 'host-request') {
      void this.handleHostRequest(child, message);
      return;
    }

    if (message.type === 'error') {
      this.updateState({
        status: message.data.fatal ? 'error' : this.state.status,
        lastError: message.data.message,
      });
      this.logSupervisorChannelMessage('worker-error', message.data.message);

      if (message.data.fatal) {
        this.scheduleRecovery(`Plugin supervisor worker reported a fatal error: ${message.data.message}`);
      }
      return;
    }

    const requestId = this.resolveRequestId(message);
    if (requestId === null) {
      return;
    }

    const pendingRequest = this.pendingRequests.get(requestId);
    if (pendingRequest === undefined || pendingRequest.type !== message.type) {
      return;
    }

    clearTimeout(pendingRequest.timer);
    this.pendingRequests.delete(requestId);
    pendingRequest.resolve(message);
  }

  private resolveRequestId(message: PluginSupervisorChildMessage): string | null {
    if (message.type === 'pong') {
      return message.data.requestId;
    }

    if (message.type === 'sync-complete') {
      return message.data.requestId;
    }

    if (message.type === 'commands-sync-complete') {
      return message.data.requestId;
    }

    if (message.type === 'shutdown-complete') {
      return message.data.requestId;
    }

    if (message.type === 'plugin-started') {
      return message.data.requestId;
    }

    if (message.type === 'command-executed') {
      return message.data.requestId;
    }

    if (message.type === 'protocol-executed') {
      return message.data.requestId;
    }

    if (message.type === 'bases-view-rendered') {
      return message.data.requestId;
    }

    if (message.type === 'ui-entry-executed') {
      return message.data.requestId;
    }

    if (message.type === 'ui-action-executed') {
      return message.data.requestId;
    }

    if (message.type === 'view-instance-opened') {
      return message.data.requestId;
    }

    if (message.type === 'view-instance-updated') {
      return message.data.requestId;
    }

    if (message.type === 'view-instance-resized') {
      return message.data.requestId;
    }

    if (message.type === 'view-instance-closed') {
      return message.data.requestId;
    }

    return null;
  }

  private async handleHostRequest(
    child: UtilityProcess,
    message: PluginSupervisorHostRequestMessage,
  ): Promise<void> {
    try {
      const response = await this.resolveHostRequest(message.data.request);

      if (child !== this.child) {
        return;
      }

      child.postMessage({
        type: 'host-response',
        data: {
          requestId: message.data.requestId,
          response,
        },
      } satisfies PluginSupervisorParentMessage);
    } catch (error) {
      const failureMessage = error instanceof Error
        ? error.message
        : 'Plugin supervisor host request failed.';

      if (child !== this.child) {
        return;
      }

      child.postMessage({
        type: 'host-response-error',
        data: {
          requestId: message.data.requestId,
          message: failureMessage,
        },
      } satisfies PluginSupervisorParentMessage);
    }
  }

  private handleChildExit(child: UtilityProcess, code: number | null): void {
    if (child !== this.child) {
      return;
    }

    this.detachChild(child);
    this.stopHeartbeatLoop();
    this.clearPendingRequests('Plugin supervisor utility process exited before the request completed.');
    this.child = null;
    this.updateRemoteCommands([]);
    this.updateRemoteSettingTabs([]);
    this.updateRemoteViews([]);
    this.updateRemoteResourceExplorerItems([]);
    this.updateRemoteExtensions([]);
    this.updateRemoteProtocols([]);
    this.updateRemoteUiEntries([]);
    this.updateRemotePluginRuntimeStates([]);

    if (this.shuttingDown) {
      this.updateState({
        status: 'stopped',
        pid: null,
        lastError: null,
      });
      return;
    }

    const exitMessage = `Plugin supervisor exited with code ${code ?? -1}.`;
    this.updateState({
      status: 'error',
      pid: null,
      lastError: exitMessage,
    });
    console.error('[PluginSupervisorService] worker exited unexpectedly:', exitMessage);
    this.notifySupervisorUnexpectedTermination();
    this.scheduleRecovery(exitMessage);
  }

  private clearPendingRequests(reason: string): void {
    for (const [requestId, pendingRequest] of [...this.pendingRequests.entries()]) {
      clearTimeout(pendingRequest.timer);
      this.pendingRequests.delete(requestId);
      pendingRequest.reject(new Error(reason));
    }
  }

  private createRequestId(prefix: string): string {
    this.nextRequestId += 1;
    return `plugin-supervisor:${prefix}:${this.nextRequestId}`;
  }

  private createDescriptorRuntimeKey(descriptor: PluginSupervisorDescriptorSnapshot): string {
    return [
      descriptor.pluginId,
      descriptor.version,
      descriptor.rootDirectory,
      descriptor.entryPath ?? '',
      descriptor.manifestPath,
    ].join('|');
  }

  private syncTrackedDescriptorRuntimeKeys(): void {
    const nextDescriptorKeys = new Map<string, string>();

    for (const descriptor of this.cachedDescriptors) {
      const nextKey = this.createDescriptorRuntimeKey(descriptor);
      const previousKey = this.descriptorRuntimeKeys.get(descriptor.pluginId) ?? null;

      if (previousKey !== null && previousKey !== nextKey) {
        this.clearTemporarilyDisabledPlugin(descriptor.pluginId);
      }

      nextDescriptorKeys.set(descriptor.pluginId, nextKey);
    }

    for (const pluginId of [...this.descriptorRuntimeKeys.keys()]) {
      if (!nextDescriptorKeys.has(pluginId)) {
        this.clearTemporarilyDisabledPlugin(pluginId);
      }
    }

    for (const [action, ownerPluginId] of [...this.knownProtocolOwners.entries()]) {
      if (!nextDescriptorKeys.has(ownerPluginId)) {
        this.knownProtocolOwners.delete(action);
      }
    }

    this.descriptorRuntimeKeys = nextDescriptorKeys;
  }

  private resolvePluginDisplayName(pluginId: string): string {
    return this.cachedDescriptors.find((descriptor) => descriptor.pluginId === pluginId)?.displayName ?? pluginId;
  }

  private buildTemporarilyDisabledPluginMessage(pluginId: string): string {
    return `插件 [${this.resolvePluginDisplayName(pluginId)}] 连续发生致命错误，为保护系统稳定，已将其暂时禁用。请尝试更新或联系插件作者。`;
  }

  private resolvePluginIdForCommand(commandId: string): string | null {
    return this.remoteCommands.find((command) => command.commandId === commandId)?.pluginId ?? null;
  }

  private resolvePluginIdForProtocol(action: string): string | null {
    return this.knownProtocolOwners.get(action.trim()) ?? null;
  }

  private resolvePluginIdForUiEntry(entryId: string): string | null {
    return this.remoteUiEntries.find((entry) => entry.id === entryId)?.pluginId ?? null;
  }

  private resolvePluginIdForViewType(viewType: string): string | null {
    const normalizedViewType = viewType.trim();

    if (normalizedViewType.length === 0) {
      return null;
    }

    const remotePluginId = this.remoteViews.find((entry) => entry.viewType === normalizedViewType)?.pluginId ?? null;

    if (remotePluginId !== null) {
      return remotePluginId;
    }

    for (const descriptor of this.cachedDescriptors) {
      if (descriptor.uiEntrypoints?.views[normalizedViewType] !== undefined) {
        return descriptor.pluginId;
      }
    }

    return null;
  }

  private assertPluginRestartAllowed(pluginId: string): void {
    const disabledMessage = this.getTemporarilyDisabledPluginMessage(pluginId);

    if (disabledMessage !== null) {
      throw new Error(disabledMessage);
    }
  }

  private recordPluginFatalFailure(pluginId: string, failureMessage: string | null): void {
    const normalizedPluginId = pluginId.trim();

    if (normalizedPluginId.length === 0 || this.temporarilyDisabledPlugins.has(normalizedPluginId)) {
      return;
    }

    const now = Date.now();
    const nextTimestamps = [
      ...(this.pluginFatalFailureTimestamps.get(normalizedPluginId) ?? []).filter((timestamp) => {
        return now - timestamp <= SUPERVISOR_PLUGIN_FATAL_FAILURE_WINDOW_MS;
      }),
      now,
    ];

    this.pluginFatalFailureTimestamps.set(normalizedPluginId, nextTimestamps);

    if (nextTimestamps.length <= SUPERVISOR_PLUGIN_FATAL_FAILURE_LIMIT) {
      return;
    }

    const nextMessage = this.buildTemporarilyDisabledPluginMessage(normalizedPluginId);
    this.temporarilyDisabledPlugins.set(normalizedPluginId, {
      message: nextMessage,
      disabledAt: now,
    });
    emitPluginRuntimeNotice({
      message: nextMessage,
      level: 'error',
    });
    console.error('[PluginSupervisorService] plugin temporarily disabled after repeated fatal failures:', {
      pluginId: normalizedPluginId,
      failureMessage,
      failureCount: nextTimestamps.length,
    });
  }

  private trackPluginRuntimeFailures(
    pluginRuntimeStates: readonly PluginSupervisorPluginRuntimeSnapshot[],
  ): void {
    const previousStates = new Map<string, PluginSupervisorPluginRuntimeSnapshot>();

    for (const state of this.remotePluginRuntimeStates) {
      previousStates.set(state.pluginId, state);
    }

    for (const state of pluginRuntimeStates) {
      if (state.owner !== 'supervisor' || state.status !== 'failed') {
        continue;
      }

      const previousState = previousStates.get(state.pluginId) ?? null;

      if (
        previousState !== null
        && previousState.status === 'failed'
        && previousState.failureMessage === state.failureMessage
      ) {
        continue;
      }

      this.recordPluginFatalFailure(state.pluginId, state.failureMessage);
    }
  }

  private attachChildProcessGoneListener(): void {
    if (this.childProcessGoneListenerAttached) {
      return;
    }

    app.on('child-process-gone', this.handleChildProcessGoneEvent);
    this.childProcessGoneListenerAttached = true;
  }

  private detachChildProcessGoneListener(): void {
    if (!this.childProcessGoneListenerAttached) {
      return;
    }

    app.removeListener('child-process-gone', this.handleChildProcessGoneEvent);
    this.childProcessGoneListenerAttached = false;
  }

  private detachChild(child: UtilityProcess): void {
    this.flushSupervisorLogRateStates();
    this.detachChildProcessGoneListener();
    child.removeAllListeners('exit');
    child.removeAllListeners('message');
    child.stdout?.removeAllListeners('data');
    child.stderr?.removeAllListeners('data');
  }

  private logSupervisorChannelMessage(
    channel: SupervisorLogChannel,
    rawMessage: string,
  ): void {
    const message = this.truncateSupervisorLogMessage(rawMessage);

    if (message.length === 0) {
      return;
    }

    const now = Date.now();
    const existingState = this.supervisorLogRateStates.get(channel);
    const activeState = existingState === undefined || now - existingState.windowStartedAt >= SUPERVISOR_LOG_RATE_WINDOW_MS
      ? this.resetSupervisorLogRateState(channel, now, existingState)
      : existingState;

    if (activeState.forwardedCount < SUPERVISOR_LOG_RATE_LIMIT) {
      this.writeSupervisorChannelMessage(channel, message);
      this.supervisorLogRateStates.set(channel, {
        ...activeState,
        forwardedCount: activeState.forwardedCount + 1,
      });
      return;
    }

    const nextSuppressedCount = activeState.suppressedCount + 1;
    this.supervisorLogRateStates.set(channel, {
      ...activeState,
      suppressedCount: nextSuppressedCount,
      suppressionNoticeEmitted: true,
    });

    if (!activeState.suppressionNoticeEmitted) {
      console.warn(
        `[PluginSupervisorService] suppressing further ${this.describeSupervisorLogChannel(channel)} output for ${SUPERVISOR_LOG_RATE_WINDOW_MS}ms.`,
      );
    }
  }

  private resetSupervisorLogRateState(
    channel: SupervisorLogChannel,
    now: number,
    existingState?: SupervisorLogRateState,
  ): SupervisorLogRateState {
    if (existingState !== undefined && existingState.suppressedCount > 0) {
      console.warn(
        `[PluginSupervisorService] suppressed ${existingState.suppressedCount} ${this.describeSupervisorLogChannel(channel)} messages in the last ${SUPERVISOR_LOG_RATE_WINDOW_MS}ms.`,
      );
    }

    const nextState: SupervisorLogRateState = {
      windowStartedAt: now,
      forwardedCount: 0,
      suppressedCount: 0,
      suppressionNoticeEmitted: false,
    };
    this.supervisorLogRateStates.set(channel, nextState);
    return nextState;
  }

  private flushSupervisorLogRateStates(): void {
    for (const [channel, state] of [...this.supervisorLogRateStates.entries()]) {
      if (state.suppressedCount > 0) {
        console.warn(
          `[PluginSupervisorService] suppressed ${state.suppressedCount} ${this.describeSupervisorLogChannel(channel)} messages in the last ${SUPERVISOR_LOG_RATE_WINDOW_MS}ms.`,
        );
      }
    }

    this.supervisorLogRateStates.clear();
  }

  private writeSupervisorChannelMessage(
    channel: SupervisorLogChannel,
    message: string,
  ): void {
    if (channel === 'stdout') {
      console.log('[PluginSupervisor]', message);
      return;
    }

    if (channel === 'stderr') {
      console.error('[PluginSupervisor Error]', message);
      return;
    }

    console.error('[PluginSupervisorService] worker reported error:', message);
  }

  private describeSupervisorLogChannel(channel: SupervisorLogChannel): string {
    if (channel === 'stdout') {
      return 'plugin supervisor stdout';
    }

    if (channel === 'stderr') {
      return 'plugin supervisor stderr';
    }

    return 'plugin supervisor worker error';
  }

  private truncateSupervisorLogMessage(message: string): string {
    const normalizedMessage = message.trim();

    if (normalizedMessage.length <= SUPERVISOR_LOG_MESSAGE_MAX_LENGTH) {
      return normalizedMessage;
    }

    const omittedCharacterCount = normalizedMessage.length - SUPERVISOR_LOG_MESSAGE_MAX_LENGTH;
    return `${normalizedMessage.slice(0, SUPERVISOR_LOG_MESSAGE_MAX_LENGTH)}… [truncated ${omittedCharacterCount} chars]`;
  }

  private handleChildProcessGone(details: SupervisorChildProcessGoneDetails): void {
    if (this.child === null || details.type !== 'Utility') {
      return;
    }

    if (
      details.serviceName !== SUPERVISOR_SERVICE_NAME
      && details.name !== SUPERVISOR_SERVICE_NAME
    ) {
      return;
    }

    if (!SUPERVISOR_CRASH_REASONS.has(details.reason)) {
      return;
    }

    console.error('[PluginSupervisorService] worker crashed:', {
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName ?? details.name ?? SUPERVISOR_SERVICE_NAME,
    });
    this.notifySupervisorUnexpectedTermination();
  }

  private notifySupervisorUnexpectedTermination(): void {
    if (this.childTerminationNoticeEmitted) {
      return;
    }

    this.childTerminationNoticeEmitted = true;
    emitPluginRuntimeNotice({
      message: SUPERVISOR_UNEXPECTED_EXIT_NOTICE,
      level: 'warning',
    });
  }

  private scheduleRecovery(reason: string): void {
    if (this.shuttingDown || this.recoveryPromise !== null) {
      return;
    }

    this.recoveryPromise = this.recoverChild(reason)
      .finally(() => {
        this.recoveryPromise = null;
      });
  }

  private async recoverChild(reason: string): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    const previousChild = this.child;
    this.stopHeartbeatLoop();
    this.clearPendingRequests(`Plugin supervisor is restarting: ${reason}`);
    this.updateState({
      status: 'starting',
      pid: null,
      lastError: reason,
    });

    if (previousChild !== null) {
      this.detachChild(previousChild);
      this.child = null;

      try {
        previousChild.kill();
      } catch {
        // Best-effort cleanup while rotating the worker.
      }
    }

    try {
      await this.spawnChild();

      if (this.cachedDescriptors.length > 0) {
        const syncMessage = await this.syncCachedDescriptors();

        if (syncMessage.type === 'sync-complete') {
          this.updateState({
            pluginCount: syncMessage.data.pluginCount,
            lastSyncedAt: Date.now(),
            lastError: null,
            status: 'ready',
          });
        }
      }

      if (this.cachedCommandSnapshots.length > 0) {
        await this.syncCachedCommands();
      }

      this.startHeartbeatLoop();
      console.log('[PluginSupervisorService] worker recovered successfully.');
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Plugin supervisor recovery failed.';

      this.updateState({
        status: 'error',
        lastError: message,
      });
      console.error('[PluginSupervisorService] recovery failed:', message);
    }
  }

  private updateRemoteCommands(commands: readonly PluginSupervisorCommandSnapshot[]): void {
    this.remoteCommands = commands;

    for (const listener of [...this.commandContributionListeners]) {
      listener();
    }
  }

  private updateRemoteSettingTabs(settingTabs: readonly PluginSupervisorSettingTabSnapshot[]): void {
    this.remoteSettingTabs = settingTabs;

    for (const listener of [...this.settingTabListeners]) {
      listener();
    }
  }

  private updateRemoteViews(views: readonly PluginSupervisorViewSnapshot[]): void {
    this.remoteViews = views;

    for (const listener of [...this.viewRegistrationListeners]) {
      listener();
    }
  }

  private updateRemoteResourceExplorerItems(
    items: readonly PluginSupervisorResourceExplorerItemSnapshot[],
  ): void {
    this.remoteResourceExplorerItems = items;
    const settingsManager = this.getSettingsManager();

    if (settingsManager !== null) {
      for (const item of items) {
        void rememberPersistentResourceExplorerItem(settingsManager, {
          pluginId: item.pluginId,
          itemId: item.itemId,
          title: item.title,
          icon: item.icon,
          directoryPath: item.directoryPath,
          viewType: item.viewType,
          retainContextWhenHidden: item.retainContextWhenHidden,
        }).catch((error: Error) => {
          console.error('[PluginSupervisorService] Failed to remember resource explorer item:', {
            pluginId: item.pluginId,
            itemId: item.itemId,
            message: error.message,
          });
        });
      }
    }

    for (const listener of [...this.resourceExplorerItemListeners]) {
      listener();
    }
  }

  private updateRemoteExtensions(extensions: readonly PluginSupervisorExtensionSnapshot[]): void {
    this.remoteExtensions = extensions;
  }

  private updateRemoteProtocols(protocols: readonly PluginSupervisorProtocolSnapshot[]): void {
    for (const protocol of protocols) {
      this.knownProtocolOwners.set(protocol.action, protocol.pluginId);
    }
  }

  private updateRemoteUiEntries(entries: readonly PluginUiEntrySnapshot[]): void {
    this.remoteUiEntries = entries;

    for (const listener of [...this.pluginUiEntryListeners]) {
      listener();
    }
  }

  private updateRemotePluginRuntimeStates(
    pluginRuntimeStates: readonly PluginSupervisorPluginRuntimeSnapshot[],
  ): void {
    this.trackPluginRuntimeFailures(pluginRuntimeStates);
    this.remotePluginRuntimeStates = pluginRuntimeStates;

    for (const listener of [...this.pluginRuntimeStateListeners]) {
      listener();
    }
  }

  private async resolveHostRequest(
    request: PluginSupervisorHostRequestPayload,
  ): Promise<PluginSupervisorHostResponsePayload> {
    const settingsManager = this.getSettingsManager();
    const workspaceDir = this.getWorkspaceDir();
    const hostApp = this.getHostApp();

    switch (request.kind) {
      case 'app:is-dark-mode': {
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        const themeName = settingsManager.get('workbench.colorTheme').toLowerCase();
        return {
          kind: 'app:is-dark-mode',
          isDarkMode: themeName.includes('dark')
            || themeName.includes('night')
            || themeName.includes('black'),
        };
      }
      case 'workspace:get-dir': {
        if (workspaceDir === null || workspaceDir.trim().length === 0) {
          throw new Error('Plugin supervisor host request requires workspace directory, but host dependencies are not ready.');
        }

        return {
          kind: 'workspace:get-dir',
          directory: workspaceDir,
        };
      }
      case 'workspace:get-snapshot': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        return {
          kind: 'workspace:get-snapshot',
          snapshot: createWorkspaceSnapshot(hostApp),
        };
      }
      case 'workspace:get-tabs': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        const tabs: PluginSupervisorWorkspaceLeafSnapshot[] = [];
        hostApp.workspace.iterateAllLeaves((leaf) => {
          tabs.push(createWorkspaceLeafSnapshot(leaf));
        });

        return {
          kind: 'workspace:get-tabs',
          tabs,
        };
      }
      case 'storage:snapshot-local': {
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        const configuredSettings = await settingsManager.getAllConfiguredSettings();
        const entries: Record<string, SharedJsonValue> = {};

        for (const [key, value] of Object.entries(configuredSettings)) {
          if (!key.startsWith('plugin.localStorage.')) {
            continue;
          }

          const storageKey = key.slice('plugin.localStorage.'.length);

          if (storageKey.length === 0) {
            continue;
          }

          entries[storageKey] = value as SharedJsonValue;
        }

        return {
          kind: 'storage:snapshot-local',
          entries,
        };
      }
      case 'storage:load-local':
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        return {
          kind: 'storage:load-local',
          value: settingsManager.getPluginSetting<SharedJsonValue>(`plugin.localStorage.${request.key}`) ?? null,
        };
      case 'storage:save-local':
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        if (request.value === null) {
          await settingsManager.resetSettingValue(`plugin.localStorage.${request.key}`, 'user');
        } else {
          await settingsManager.updatePluginSetting(`plugin.localStorage.${request.key}`, request.value, 'user');
        }

        return {
          kind: 'storage:save-local',
        };
      case 'data:load':
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        return {
          kind: 'data:load',
          value: settingsManager.getPluginSetting<SharedJsonValue>(`plugin.data.${request.pluginId}`) ?? null,
        };
      case 'data:save':
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        await settingsManager.updatePluginSetting(`plugin.data.${request.pluginId}`, request.value, 'user');
        return {
          kind: 'data:save',
        };
      case 'data:delete':
        if (settingsManager === null) {
          throw new Error('Plugin supervisor host request requires settings manager, but host dependencies are not ready.');
        }

        await settingsManager.resetSettingValue(`plugin.data.${request.pluginId}`, 'user');
        return {
          kind: 'data:delete',
        };
      case 'workspace:leaf-open-file': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        const targetLeaf = resolveWorkspaceLeafMode(hostApp, request.newLeafMode);
        const file = hostApp.vault.resolveAnyFile(request.filePath);

        if (file === null) {
          return {
            kind: 'workspace:leaf-open-file',
            leafId: null,
            snapshot: createWorkspaceSnapshot(hostApp),
          };
        }

        await targetLeaf.openFile(file, {
          active: request.active,
        });
        return {
          kind: 'workspace:leaf-open-file',
          leafId: targetLeaf.id,
          snapshot: createWorkspaceSnapshot(hostApp),
        };
      }
      case 'workspace:leaf-set-view-state': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        const existingLeaf = request.leafId === null
          ? null
          : hostApp.workspace.getLeafById(request.leafId);
        const targetLeaf = resolveWorkspaceLeafForViewStateRequest(
          hostApp,
          request,
          existingLeaf,
        );
        registerPendingSupervisorViewInstanceToken(
          targetLeaf,
          request.viewType,
          request.pendingViewInstanceId,
        );

        await targetLeaf.setViewState({
          type: request.viewType,
          active: request.active,
          pinned: request.pinned,
          state: normalizeJsonObject(request.state) ?? undefined,
        }, request.ephemeralState);

        return {
          kind: 'workspace:leaf-set-view-state',
          leafId: targetLeaf.id,
          snapshot: createWorkspaceSnapshot(hostApp),
        };
      }
      case 'workspace:leaf-refresh-runtime-surface': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        const leaf = hostApp.workspace.getLeafById(request.leafId);

        if (leaf instanceof MainProcessWorkspaceLeaf) {
          leaf.refreshRendererRuntimeSurface(request.state);
        }

        return {
          kind: 'workspace:leaf-refresh-runtime-surface',
        };
      }
      case 'workspace:reveal-leaf': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        const leaf = hostApp.workspace.getLeafById(request.leafId);

        if (leaf !== null) {
          await hostApp.workspace.revealLeaf(leaf);
        }

        return {
          kind: 'workspace:reveal-leaf',
          snapshot: createWorkspaceSnapshot(hostApp),
        };
      }
      case 'workspace:detach-leaves-of-type': {
        if (hostApp === null) {
          throw new Error('Plugin supervisor host request requires host app runtime, but it is not ready.');
        }

        hostApp.workspace.detachLeavesOfType(request.viewType);

        return {
          kind: 'workspace:detach-leaves-of-type',
          snapshot: createWorkspaceSnapshot(hostApp),
        };
      }
      case 'ui:show-notice':
        emitPluginRuntimeNotice({
          message: request.message,
          level: request.level,
          duration: request.duration,
        });
        return {
          kind: 'ui:show-notice',
        };
    }
  }
}
