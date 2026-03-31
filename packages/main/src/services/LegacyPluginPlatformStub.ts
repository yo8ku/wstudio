/**
 * Temporary no-op plugin platform stubs.
 * They keep Electron startup and renderer IPC stable while the plugin API is redesigned.
 */

import type { BrowserWindow } from 'electron';
import {
  EMPTY_AI_PANEL_CONTRIBUTION_SNAPSHOT,
  EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT,
  type AIPanelContributionEntry,
  type AIPanelContributionExecutionOutcome,
  type AIPanelContributionSnapshot,
  type ExtensionDevelopmentReloadResult,
  type JsonValue,
  type WorkbenchContributionSnapshot,
} from '@note-studio/shared';

export interface LegacyPluginScanFailure {
  readonly rootDirectory: string;
  readonly manifestPath: string;
  readonly code: string;
  readonly message: string;
}

export interface LegacyPluginScanSummary {
  readonly roots: readonly string[];
  readonly registeredCount: number;
  readonly failureCount: number;
  readonly failures: readonly LegacyPluginScanFailure[];
}

export interface LegacyPluginDescriptor {
  readonly manifest: {
    readonly id: string;
  };
  readonly rootDirectory: string;
}

export interface LegacyPluginEditorBridge {
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
    readonly settingsManager: object;
    readonly workspaceManager: object;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  }): void;
}

export interface LegacyPluginHostManager {
  initialize(): Promise<void>;
  reloadAll(): Promise<void>;
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
  failureCount: 0,
  failures: [],
};

export const pluginEditorBridge: LegacyPluginEditorBridge = {
  setMainWindow(_mainWindow: BrowserWindow | null): void {
    // Intentionally empty while the legacy plugin host is disabled.
  },
};

export const pluginDiscoveryService: LegacyPluginDiscoveryService = {
  async initialize(): Promise<LegacyPluginScanSummary> {
    return EMPTY_LEGACY_PLUGIN_SCAN_SUMMARY;
  },
  async reload(): Promise<LegacyPluginScanSummary> {
    return EMPTY_LEGACY_PLUGIN_SCAN_SUMMARY;
  },
  getById(_extensionId: string): LegacyPluginDescriptor | undefined {
    return undefined;
  },
  getPluginRoots(): readonly string[] {
    return EMPTY_LEGACY_PLUGIN_SCAN_SUMMARY.roots;
  },
  getResolvedRoots(): readonly string[] {
    return EMPTY_LEGACY_PLUGIN_SCAN_SUMMARY.roots;
  },
  getAll(): readonly LegacyPluginDescriptor[] {
    return [];
  },
};

export const pluginCapabilityRouter: LegacyPluginCapabilityRouter = {
  configure(_dependencies: {
    readonly settingsManager: object;
    readonly workspaceManager: object;
    readonly builtinAI: object;
    readonly editorBridge: LegacyPluginEditorBridge;
  }): void {
    // Intentionally empty while the legacy plugin host is disabled.
  },
};

export const pluginHostManager: LegacyPluginHostManager = {
  async initialize(): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
  async reloadAll(): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
  async activateForAIPanelItem(_item: AIPanelContributionEntry): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
  async executeContributedCommand(
    _commandId: string,
    _args: readonly JsonValue[] = [],
  ): Promise<JsonValue | null> {
    return null;
  },
  async deliverRuntimeWebviewMessage(
    _extensionId: string,
    _panelInstanceKey: string,
    _message: JsonValue,
  ): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
  async notifyRuntimeWebviewDisposed(
    _extensionId: string,
    _panelInstanceKey: string,
  ): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
};

export const pluginHotReloadService: LegacyPluginHotReloadService = {
  async start(): Promise<void> {
    // Intentionally empty while the legacy plugin host is disabled.
  },
};

export const workbenchContributionRegistry: LegacyWorkbenchContributionRegistry = {
  getSnapshot(): WorkbenchContributionSnapshot {
    return EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT;
  },
  subscribe(_listener: (snapshot: WorkbenchContributionSnapshot) => void): () => void {
    return () => undefined;
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
