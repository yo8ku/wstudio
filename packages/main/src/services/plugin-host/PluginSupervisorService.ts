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
} from '@note-studio/shared';
import type { SettingsManager } from '../../config/SettingsManager';
import type { MainProcessAppFacade } from './MainProcessAppFacade';
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
  type PluginSupervisorSettingTabSnapshot,
  type PluginSupervisorViewInstanceSnapshot,
  type PluginSupervisorViewSnapshot,
  type PluginSupervisorWorkspaceLeafSnapshot,
  type PluginSupervisorHostRequestMessage,
  type PluginSupervisorHostRequestPayload,
  type PluginSupervisorParentMessage,
  type PluginSupervisorParentControlMessage,
  type PluginSupervisorStateSnapshot,
  type PluginSupervisorWorkspaceSnapshot,
} from './pluginSupervisorProtocol';
import { emitPluginRuntimeNotice } from '../../ipc/pluginRuntimeHandlers';

interface PendingSupervisorRequest {
  readonly type:
    | 'pong'
    | 'sync-complete'
    | 'commands-sync-complete'
    | 'shutdown-complete'
    | 'command-executed'
    | 'protocol-executed'
    | 'bases-view-rendered'
    | 'ui-entry-executed'
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
type PluginSupervisorRequestMessage = Exclude<PluginSupervisorParentControlMessage, { readonly type: 'initialize' }>;

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
    const viewState = leaf.getViewState();
    leaves.push({
      id: leaf.id,
      viewType: viewState.type,
      pinned: viewState.pinned === true,
      state: normalizeJsonObject(viewState.state ?? null),
      ephemeralState: toSharedJsonValue(leaf.getEphemeralState()),
      displayText: leaf.getDisplayText(),
      icon: leaf.getIcon(),
    });
  });

  return {
    activeLeafId: hostApp.workspace.activeLeaf?.id ?? null,
    activeFilePath: hostApp.workspace.getActiveFile()?.path ?? null,
    lastOpenFiles: hostApp.workspace.getLastOpenFiles(),
    leaves,
  };
}

export class PluginSupervisorService {
  private child: UtilityProcess | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly stateListeners = new Set<() => void>();
  private readonly commandContributionListeners = new Set<() => void>();
  private readonly settingTabListeners = new Set<() => void>();
  private readonly viewRegistrationListeners = new Set<() => void>();
  private readonly pluginUiEntryListeners = new Set<() => void>();
  private readonly pluginRuntimeStateListeners = new Set<() => void>();
  private readonly pendingRequests = new Map<string, PendingSupervisorRequest>();
  private cachedDescriptors: readonly PluginSupervisorDescriptorSnapshot[] = [];
  private cachedCommandSnapshots: readonly PluginSupervisorCommandSnapshot[] = [];
  private remoteCommands: readonly PluginSupervisorCommandSnapshot[] = [];
  private remoteSettingTabs: readonly PluginSupervisorSettingTabSnapshot[] = [];
  private remoteViews: readonly PluginSupervisorViewSnapshot[] = [];
  private remoteExtensions: readonly PluginSupervisorExtensionSnapshot[] = [];
  private remoteUiEntries: readonly PluginUiEntrySnapshot[] = [];
  private remotePluginRuntimeStates: readonly PluginSupervisorPluginRuntimeSnapshot[] = [];
  private recoveryPromise: Promise<void> | null = null;
  private shuttingDown = false;
  private nextRequestId = 0;
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

  public subscribePluginUiEntries(listener: () => void): () => void {
    this.pluginUiEntryListeners.add(listener);

    return () => {
      this.pluginUiEntryListeners.delete(listener);
    };
  }

  public getPluginRuntimeState(pluginId: string): PluginSupervisorPluginRuntimeSnapshot | null {
    return this.remotePluginRuntimeStates.find((state) => state.pluginId === pluginId) ?? null;
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

  public async initialize(descriptors: readonly PluginDescriptor[]): Promise<void> {
    this.shuttingDown = false;
    this.cachedDescriptors = descriptors.map((descriptor) => descriptorToSupervisorSnapshot(descriptor));
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
    this.cachedDescriptors = descriptors.map((descriptor) => descriptorToSupervisorSnapshot(descriptor));
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
    this.stopHeartbeatLoop();

    if (this.recoveryPromise !== null) {
      await this.recoveryPromise;
    }

    if (this.child === null) {
      this.updateRemoteCommands([]);
      this.updateRemoteSettingTabs([]);
      this.updateRemoteViews([]);
      this.updateRemoteExtensions([]);
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
      this.updateRemoteExtensions([]);
      this.updateRemoteUiEntries([]);
      this.updateRemotePluginRuntimeStates([]);
    }
  }

  public async executeRemoteCommand(
    commandId: string,
    args: readonly SharedJsonValue[],
  ): Promise<{
    readonly handled: boolean;
    readonly result: SharedJsonValue | null;
    readonly fallbackToMain: boolean;
  }> {
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

  public async openRemoteViewInstance(
    leafId: string,
    viewType: string,
    pendingViewInstanceId: string | null = null,
  ): Promise<PluginSupervisorViewInstanceSnapshot | null> {
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

    const childPath = this.resolveChildScriptPath();
    const child = utilityProcess.fork(childPath, [], {
      stdio: 'pipe',
    });
    this.child = child;

    child.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      if (message.length > 0) {
        console.log('[PluginSupervisor]', message);
      }
    });

    child.stderr?.on('data', (data) => {
      const message = data.toString().trim();
      if (message.length > 0) {
        console.error('[PluginSupervisor Error]', message);
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
    message: PluginSupervisorRequestMessage,
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

    if (message.type === 'extensions-updated') {
      this.updateRemoteExtensions(message.data.extensions);
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
      console.error('[PluginSupervisorService] worker reported error:', message.data.message);

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

    this.stopHeartbeatLoop();
    this.clearPendingRequests('Plugin supervisor utility process exited before the request completed.');
    this.child = null;
    this.updateRemoteCommands([]);
    this.updateRemoteSettingTabs([]);
    this.updateRemoteViews([]);
    this.updateRemoteExtensions([]);
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

  private detachChild(child: UtilityProcess): void {
    child.removeAllListeners('exit');
    child.removeAllListeners('message');
    child.stdout?.removeAllListeners('data');
    child.stderr?.removeAllListeners('data');
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

  private updateRemoteExtensions(extensions: readonly PluginSupervisorExtensionSnapshot[]): void {
    this.remoteExtensions = extensions;
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
