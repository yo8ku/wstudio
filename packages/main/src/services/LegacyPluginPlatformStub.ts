/**
 * Main-process plugin platform stage 2 services.
 * It wires discovery, host runtime dependencies, and UI-facing registries while deeper contribution bridges remain pending.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { SettingsManager } from '../config/SettingsManager';
import type { WorkspaceManager } from '../workspace/WorkspaceManager';
import {
  EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
  EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  type AIPanelContributionEntry,
  type AIPanelContributionExecutionOutcome,
  type AIPanelContributionSnapshot,
  type ExtensionDevelopmentReloadResult,
  type JsonValue,
  type PluginUiEntrySnapshot,
  type WorkbenchContributionSnapshot,
} from '@note-studio/shared';
import {
  PLUGIN_EDITOR_BRIDGE_CHANNELS,
  type PluginEditorApplyTextEditsRequestPayload,
  type PluginEditorApplyTextEditsResponsePayload,
  type PluginEditorPerformActionRequestPayload,
  type PluginEditorPerformActionResponsePayload,
  type PluginEditorStateRequestPayload,
  type PluginEditorStateResponsePayload,
} from '@note-studio/shared';
import { PluginDiscoveryService } from './plugin-host/PluginDiscoveryService';
import { PluginHostManager } from './plugin-host/PluginHostManager';
import type {
  InstalledPluginSummary,
  MainProcessEditorBridge,
  PluginEditorActionRequest,
  PluginDescriptor,
  PluginEditorStateSnapshot,
  PluginEditorTextEdit,
  PluginSettingTabSummary,
  PluginScanFailure,
  PluginScanSummary,
} from './plugin-host/types';

export type LegacyPluginScanFailure = PluginScanFailure;

export type LegacyPluginScanSummary = PluginScanSummary;

export type LegacyPluginDescriptor = PluginDescriptor;

export interface LegacyPluginEditorBridge extends MainProcessEditorBridge {
  setMainWindow(mainWindow: BrowserWindow | null): void;
}

export interface LegacyPluginDiscoveryService {
  initialize(): Promise<LegacyPluginScanSummary>;
  reload(): Promise<LegacyPluginScanSummary>;
  getById(extensionId: string): LegacyPluginDescriptor | undefined;
  getPluginRoots(): readonly string[];
  getResolvedRoots(): readonly string[];
  getAll(): readonly LegacyPluginDescriptor[];
}

export interface LegacyPluginCapabilityRouter {
  configure(dependencies: {
    readonly settingsManager: SettingsManager;
    readonly workspaceManager: WorkspaceManager;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  }): void;
}

export interface LegacyPluginHostManager {
  initialize(): Promise<void>;
  reloadAll(): Promise<void>;
  getInstalledPlugins(): readonly InstalledPluginSummary[];
  getPluginSettingTabs(): readonly PluginSettingTabSummary[];
  getWorkbenchContributionSnapshot(): WorkbenchContributionSnapshot;
  getPluginUiEntries(): readonly PluginUiEntrySnapshot[];
  executePluginUiEntry(entryId: string): boolean;
  subscribePluginUiEntries(listener: () => void): () => void;
  activateForAIPanelItem(item: AIPanelContributionEntry): Promise<void>;
  executeContributedCommand(
    commandId: string,
    args?: readonly JsonValue[],
  ): Promise<JsonValue | null>;
  deliverRuntimeWebviewMessage(
    extensionId: string,
    panelInstanceKey: string,
    message: JsonValue,
  ): Promise<void>;
  notifyRuntimeWebviewDisposed(
    extensionId: string,
    panelInstanceKey: string,
  ): Promise<void>;
}

export interface LegacyPluginHotReloadService {
  start(): Promise<void>;
}

export interface LegacyWorkbenchContributionRegistry {
  getSnapshot(): WorkbenchContributionSnapshot;
  subscribe(listener: (snapshot: WorkbenchContributionSnapshot) => void): () => void;
}

export interface LegacyAIPanelContributionRegistry {
  getSnapshot(): AIPanelContributionSnapshot;
}

export interface LegacyAIPanelActionRegistry {
  execute(item: AIPanelContributionEntry): Promise<AIPanelContributionExecutionOutcome>;
}

export const EMPTY_LEGACY_PLUGIN_SCAN_SUMMARY: LegacyPluginScanSummary = {
  roots: [],
  registeredCount: 0,
  failureCount: 0,
  failures: [],
};

export const EMPTY_EXTENSION_DEVELOPMENT_RELOAD_RESULT: ExtensionDevelopmentReloadResult = {
  roots: [],
  registeredCount: 0,
  enabledCount: 0,
  disabledCount: 0,
  failureCount: 0,
  failures: [],
  disabledPlugins: [],
};

class PluginEditorBridgeService implements LegacyPluginEditorBridge {
  private mainWindow: BrowserWindow | null = null;
  private readonly stateRequests = new Map<string, {
    readonly resolve: (payload: PluginEditorStateResponsePayload) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
  }>();
  private readonly applyTextEditsRequests = new Map<string, {
    readonly resolve: (payload: PluginEditorApplyTextEditsResponsePayload) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
  }>();
  private readonly actionRequests = new Map<string, {
    readonly resolve: (payload: PluginEditorPerformActionResponsePayload) => void;
    readonly reject: (error: Error) => void;
    readonly timer: NodeJS.Timeout;
  }>();

  public constructor() {
    ipcMain.on(PLUGIN_EDITOR_BRIDGE_CHANNELS.stateResponse, (_event, payload: PluginEditorStateResponsePayload) => {
      this.resolvePendingRequest(this.stateRequests, payload.requestId, payload);
    });
    ipcMain.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEditsResponse,
      (_event, payload: PluginEditorApplyTextEditsResponsePayload) => {
        this.resolvePendingRequest(this.applyTextEditsRequests, payload.requestId, payload);
      },
    );
    ipcMain.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.performActionResponse,
      (_event, payload: PluginEditorPerformActionResponsePayload) => {
        this.resolvePendingRequest(this.actionRequests, payload.requestId, payload);
      },
    );
  }

  public setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
  }

  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  public async requestState(documentUri: string | null): Promise<PluginEditorStateSnapshot | null> {
    const targetWindow = this.requireMainWindow();

    if (targetWindow === null) {
      return null;
    }

    const payload = await this.sendRequest<PluginEditorStateResponsePayload, PluginEditorStateRequestPayload>(
      this.stateRequests,
      PLUGIN_EDITOR_BRIDGE_CHANNELS.requestState,
      {
        requestId: this.createRequestId('state'),
        documentUri,
      },
      targetWindow,
    );

    if (!payload.ok) {
      throw new Error(payload.error ?? 'Failed to resolve renderer editor state.');
    }

    if (payload.documentUri === null || payload.content === null) {
      return null;
    }

    return {
      documentUri: payload.documentUri,
      content: payload.content,
      selection: payload.selection === null
        ? null
        : {
            anchor: {
              line: Math.max(payload.selection.range.startLine - 1, 0),
              ch: payload.selection.range.startColumn - 1,
            },
            head: {
              line: Math.max(payload.selection.range.endLine - 1, 0),
              ch: payload.selection.range.endColumn - 1,
            },
            text: payload.selection.text,
          },
      hasFocus: payload.hasFocus,
      scroll: payload.scroll === null
        ? null
        : {
            left: payload.scroll.left,
            top: payload.scroll.top,
            width: payload.scroll.width,
            height: payload.scroll.height,
            clientWidth: payload.scroll.clientWidth,
            clientHeight: payload.scroll.clientHeight,
          },
    };
  }

  public async applyTextEdits(documentUri: string, edits: readonly PluginEditorTextEdit[]): Promise<void> {
    const targetWindow = this.requireMainWindow();

    if (targetWindow === null) {
      return;
    }

    const payload = await this.sendRequest<
      PluginEditorApplyTextEditsResponsePayload,
      PluginEditorApplyTextEditsRequestPayload
    >(
      this.applyTextEditsRequests,
      PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEdits,
      {
        requestId: this.createRequestId('apply-text-edits'),
        documentUri,
        edits: edits.map((edit) => ({
          range: {
            startLine: edit.range.from.line + 1,
            startColumn: edit.range.from.ch + 1,
            endLine: edit.range.to.line + 1,
            endColumn: edit.range.to.ch + 1,
          },
          text: edit.text,
        })),
      },
      targetWindow,
    );

    if (!payload.ok) {
      throw new Error(payload.error ?? 'Failed to apply renderer editor text edits.');
    }
  }

  public async performAction(request: PluginEditorActionRequest): Promise<void> {
    const targetWindow = this.requireMainWindow();

    if (targetWindow === null) {
      return;
    }

    const payload = await this.sendRequest<
      PluginEditorPerformActionResponsePayload,
      PluginEditorPerformActionRequestPayload
    >(
      this.actionRequests,
      PLUGIN_EDITOR_BRIDGE_CHANNELS.performAction,
      this.toPerformActionPayload(request),
      targetWindow,
    );

    if (!payload.ok) {
      throw new Error(payload.error ?? 'Failed to perform renderer editor action.');
    }
  }

  private requireMainWindow(): BrowserWindow | null {
    if (this.mainWindow === null || this.mainWindow.isDestroyed()) {
      return null;
    }

    return this.mainWindow;
  }

  private createRequestId(prefix: string): string {
    return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  }

  private resolvePendingRequest<TPayload extends { readonly requestId: string }>(
    pendingRequests: Map<string, {
      readonly resolve: (payload: TPayload) => void;
      readonly reject: (error: Error) => void;
      readonly timer: NodeJS.Timeout;
    }>,
    requestId: string,
    payload: TPayload,
  ): void {
    const pendingRequest = pendingRequests.get(requestId);

    if (pendingRequest === undefined) {
      return;
    }

    clearTimeout(pendingRequest.timer);
    pendingRequests.delete(requestId);
    pendingRequest.resolve(payload);
  }

  private async sendRequest<
    TResponse extends { readonly requestId: string },
    TPayload extends { readonly requestId: string },
  >(
    pendingRequests: Map<string, {
      readonly resolve: (payload: TResponse) => void;
      readonly reject: (error: Error) => void;
      readonly timer: NodeJS.Timeout;
    }>,
    channel: string,
    payload: TPayload,
    targetWindow: BrowserWindow,
  ): Promise<TResponse> {
    return await new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(payload.requestId);
        reject(new Error(`Plugin editor bridge request timed out: ${channel}`));
      }, 2000);

      pendingRequests.set(payload.requestId, {
        resolve,
        reject,
        timer,
      });

      try {
        targetWindow.webContents.send(channel, payload);
      } catch (error) {
        clearTimeout(timer);
        pendingRequests.delete(payload.requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private toPerformActionPayload(request: PluginEditorActionRequest): PluginEditorPerformActionRequestPayload {
    if (request.action === 'focus' || request.action === 'blur' || request.action === 'undo' || request.action === 'redo') {
      return {
        requestId: this.createRequestId(`action:${request.action}`),
        documentUri: request.documentUri,
        action: request.action,
        selection: null,
        selections: null,
        mainSelectionIndex: null,
        command: null,
        scrollLeft: null,
        scrollTop: null,
      };
    }

    if (request.action === 'set-selection') {
      return {
        requestId: this.createRequestId('action:set-selection'),
        documentUri: request.documentUri,
        action: request.action,
        selection: {
          startLine: request.range.from.line + 1,
          startColumn: request.range.from.ch + 1,
          endLine: request.range.to.line + 1,
          endColumn: request.range.to.ch + 1,
        },
        selections: null,
        mainSelectionIndex: null,
        command: null,
        scrollLeft: null,
        scrollTop: null,
      };
    }

    if (request.action === 'set-selections') {
      return {
        requestId: this.createRequestId('action:set-selections'),
        documentUri: request.documentUri,
        action: request.action,
        selection: null,
        selections: request.ranges.map((range) => ({
          startLine: range.from.line + 1,
          startColumn: range.from.ch + 1,
          endLine: range.to.line + 1,
          endColumn: range.to.ch + 1,
        })),
        mainSelectionIndex: request.mainSelectionIndex,
        command: null,
        scrollLeft: null,
        scrollTop: null,
      };
    }

    if (request.action === 'scroll-to') {
      return {
        requestId: this.createRequestId('action:scroll-to'),
        documentUri: request.documentUri,
        action: request.action,
        selection: null,
        selections: null,
        mainSelectionIndex: null,
        command: null,
        scrollLeft: request.left,
        scrollTop: request.top,
      };
    }

    const command = request.action === 'exec' ? request.command : null;

    return {
      requestId: this.createRequestId('action:exec'),
      documentUri: request.documentUri,
      action: request.action,
      selection: null,
      selections: null,
      mainSelectionIndex: null,
      command,
      scrollLeft: null,
      scrollTop: null,
    };
  }
}

class PluginCapabilityRouterService implements LegacyPluginCapabilityRouter {
  private dependencies: {
    readonly settingsManager: SettingsManager;
    readonly workspaceManager: WorkspaceManager;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  } | null = null;

  public configure(dependencies: {
    readonly settingsManager: SettingsManager;
    readonly workspaceManager: WorkspaceManager;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  }): void {
    this.dependencies = dependencies;
  }

  public getDependencies(): {
    readonly settingsManager: SettingsManager;
    readonly workspaceManager: WorkspaceManager;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  } | null {
    return this.dependencies;
  }
}

const discoveryService = new PluginDiscoveryService();
const capabilityRouterService = new PluginCapabilityRouterService();
const hostManager = new PluginHostManager(
  discoveryService,
  () => capabilityRouterService.getDependencies(),
);

export const pluginEditorBridge: LegacyPluginEditorBridge = new PluginEditorBridgeService();

export const pluginDiscoveryService: LegacyPluginDiscoveryService & {
  getLastScanSummary(): LegacyPluginScanSummary;
} = discoveryService;

export const pluginCapabilityRouter: LegacyPluginCapabilityRouter = capabilityRouterService;

export const pluginHostManager: LegacyPluginHostManager = hostManager;

export const pluginHotReloadService: LegacyPluginHotReloadService = {
  async start(): Promise<void> {
    // File watching is reserved for the next host integration phase.
  },
};

export const workbenchContributionRegistry: LegacyWorkbenchContributionRegistry = {
  getSnapshot(): WorkbenchContributionSnapshot {
    return hostManager.getWorkbenchContributionSnapshot();
  },
  subscribe(listener: (snapshot: WorkbenchContributionSnapshot) => void): () => void {
    return hostManager.subscribePluginUiEntries(() => {
      listener(hostManager.getWorkbenchContributionSnapshot());
    });
  },
};

export const aiPanelContributionRegistry: LegacyAIPanelContributionRegistry = {
  getSnapshot(): AIPanelContributionSnapshot {
    return EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT;
  },
};

export const aiPanelActionRegistry: LegacyAIPanelActionRegistry = {
  async execute(_item: AIPanelContributionEntry): Promise<AIPanelContributionExecutionOutcome> {
    return {
      type: 'handled',
      message: 'Legacy plugin platform is temporarily disabled.',
    };
  },
};
