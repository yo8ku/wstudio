/**
 * Message contracts shared by the main-process plugin supervisor service and
 * the utility-process plugin supervisor worker.
 */

import type {
  JsonValue as SharedJsonValue,
  PluginUiEntrySnapshot,
} from '@note-studio/shared';
import type { AppProtocolData } from '@note-studio/plugin';
import type { BasesViewSnapshot } from './MainProcessPluginRuntime';
import type { PluginDescriptor } from './types';

export type PluginSupervisorRuntimeStatus = 'stopped' | 'starting' | 'ready' | 'error';

export interface PluginSupervisorDescriptorSnapshot {
  readonly pluginId: string;
  readonly displayName: string;
  readonly version: string;
  readonly rootDirectory: string;
  readonly entryPath: string | null;
  readonly manifestPath: string;
  readonly uiEntrypoints: PluginDescriptor['uiEntrypoints'];
}

export interface PluginSupervisorCommandSnapshot {
  readonly pluginId: string;
  readonly commandId: string;
  readonly title: string;
  readonly category: string | null;
  readonly icon: string | null;
}

export interface PluginSupervisorSettingTabSnapshot {
  readonly id: string;
  readonly pluginId: string;
  readonly title: string;
}

export interface PluginSupervisorViewSnapshot {
  readonly pluginId: string;
  readonly viewType: string;
}

export interface PluginSupervisorViewInstanceSnapshot {
  readonly leafId: string;
  readonly viewType: string;
  readonly displayText: string;
  readonly icon: string;
  readonly state: SharedJsonValue | null;
}

export interface PluginSupervisorExtensionSnapshot {
  readonly pluginId: string;
  readonly extension: string;
  readonly viewType: string;
}

export interface PluginSupervisorWorkspaceLeafSnapshot {
  readonly id: string;
  readonly viewType: string;
  readonly pinned: boolean;
  readonly state: SharedJsonValue | null;
  readonly ephemeralState: SharedJsonValue | null;
  readonly displayText: string;
  readonly icon: string;
}

export interface PluginSupervisorWorkspaceSnapshot {
  readonly activeLeafId: string | null;
  readonly activeFilePath: string | null;
  readonly lastOpenFiles: readonly string[];
  readonly leaves: readonly PluginSupervisorWorkspaceLeafSnapshot[];
}

export type PluginSupervisorPluginRuntimeStatus = 'idle' | 'enabled' | 'failed';
export type PluginSupervisorPluginRuntimeOwner = 'main' | 'supervisor';

export interface PluginSupervisorPluginRuntimeSnapshot {
  readonly pluginId: string;
  readonly status: PluginSupervisorPluginRuntimeStatus;
  readonly failureMessage: string | null;
  readonly owner: PluginSupervisorPluginRuntimeOwner;
}

export interface PluginSupervisorInitializeMessage {
  readonly type: 'initialize';
  readonly data: {
    readonly hostAppPath: string;
  };
}

export interface PluginSupervisorPingMessage {
  readonly type: 'ping';
  readonly data: {
    readonly requestId: string;
    readonly sentAt: number;
  };
}

export interface PluginSupervisorSyncDescriptorsMessage {
  readonly type: 'sync-descriptors';
  readonly data: {
    readonly requestId: string;
    readonly descriptors: readonly PluginSupervisorDescriptorSnapshot[];
  };
}

export interface PluginSupervisorShutdownMessage {
  readonly type: 'shutdown';
  readonly data: {
    readonly requestId: string;
  };
}

export interface PluginSupervisorExecuteCommandMessage {
  readonly type: 'execute-command';
  readonly data: {
    readonly requestId: string;
    readonly commandId: string;
    readonly args: readonly SharedJsonValue[];
  };
}

export interface PluginSupervisorExecuteProtocolMessage {
  readonly type: 'execute-protocol';
  readonly data: {
    readonly requestId: string;
    readonly protocolData: AppProtocolData;
  };
}

export interface PluginSupervisorExecuteBasesViewMessage {
  readonly type: 'execute-bases-view';
  readonly data: {
    readonly requestId: string;
    readonly pluginId: string;
    readonly viewId: string;
  };
}

export interface PluginSupervisorExecuteUiEntryMessage {
  readonly type: 'execute-ui-entry';
  readonly data: {
    readonly requestId: string;
    readonly entryId: string;
  };
}

export interface PluginSupervisorOpenViewInstanceMessage {
  readonly type: 'open-view-instance';
  readonly data: {
    readonly requestId: string;
    readonly leafId: string;
    readonly viewType: string;
    readonly pendingViewInstanceId: string | null;
  };
}

export interface PluginSupervisorUpdateViewInstanceMessage {
  readonly type: 'update-view-instance';
  readonly data: {
    readonly requestId: string;
    readonly leafId: string;
    readonly viewType: string;
    readonly state: SharedJsonValue | null;
  };
}

export interface PluginSupervisorResizeViewInstanceMessage {
  readonly type: 'resize-view-instance';
  readonly data: {
    readonly requestId: string;
    readonly leafId: string;
  };
}

export interface PluginSupervisorCloseViewInstanceMessage {
  readonly type: 'close-view-instance';
  readonly data: {
    readonly requestId: string;
    readonly leafId: string;
  };
}

export interface PluginSupervisorSyncCommandsMessage {
  readonly type: 'sync-commands';
  readonly data: {
    readonly requestId: string;
    readonly commands: readonly PluginSupervisorCommandSnapshot[];
  };
}

export type PluginSupervisorHostRequestPayload =
  | {
      readonly kind: 'app:is-dark-mode';
    }
  | {
      readonly kind: 'workspace:get-dir';
    }
  | {
      readonly kind: 'workspace:get-snapshot';
    }
  | {
      readonly kind: 'storage:snapshot-local';
    }
  | {
      readonly kind: 'storage:load-local';
      readonly key: string;
    }
  | {
      readonly kind: 'storage:save-local';
      readonly key: string;
      readonly value: SharedJsonValue | null;
    }
  | {
      readonly kind: 'data:load';
      readonly pluginId: string;
    }
  | {
      readonly kind: 'data:save';
      readonly pluginId: string;
      readonly value: SharedJsonValue;
    }
  | {
      readonly kind: 'data:delete';
      readonly pluginId: string;
    }
  | {
      readonly kind: 'ui:show-notice';
      readonly message: string;
      readonly level: 'success' | 'error' | 'warning' | 'info';
      readonly duration?: number;
    }
  | {
      readonly kind: 'workspace:leaf-open-file';
      readonly newLeafMode: 'default' | 'force-new' | 'tab' | 'split' | 'window';
      readonly filePath: string;
      readonly active: boolean;
    }
  | {
      readonly kind: 'workspace:leaf-set-view-state';
      readonly leafId: string | null;
      readonly newLeafMode: 'default' | 'force-new' | 'tab' | 'split' | 'window';
      readonly viewType: string;
      readonly active: boolean;
      readonly pinned: boolean;
      readonly state: SharedJsonValue | null;
      readonly ephemeralState: SharedJsonValue | null;
      readonly pendingViewInstanceId: string | null;
    }
  | {
      readonly kind: 'workspace:reveal-leaf';
      readonly leafId: string;
    }
  | {
      readonly kind: 'workspace:detach-leaves-of-type';
      readonly viewType: string;
    };

export type PluginSupervisorHostResponsePayload =
  | {
      readonly kind: 'app:is-dark-mode';
      readonly isDarkMode: boolean;
    }
  | {
      readonly kind: 'workspace:get-dir';
      readonly directory: string;
    }
  | {
      readonly kind: 'workspace:get-snapshot';
      readonly snapshot: PluginSupervisorWorkspaceSnapshot;
    }
  | {
      readonly kind: 'storage:snapshot-local';
      readonly entries: Readonly<Record<string, SharedJsonValue>>;
    }
  | {
      readonly kind: 'storage:load-local';
      readonly value: SharedJsonValue | null;
    }
  | {
      readonly kind: 'storage:save-local';
    }
  | {
      readonly kind: 'data:load';
      readonly value: SharedJsonValue | null;
    }
  | {
      readonly kind: 'data:save';
    }
  | {
      readonly kind: 'data:delete';
    }
  | {
      readonly kind: 'ui:show-notice';
    }
  | {
      readonly kind: 'workspace:leaf-open-file';
      readonly leafId: string | null;
      readonly snapshot: PluginSupervisorWorkspaceSnapshot;
    }
  | {
      readonly kind: 'workspace:leaf-set-view-state';
      readonly leafId: string | null;
      readonly snapshot: PluginSupervisorWorkspaceSnapshot;
    }
  | {
      readonly kind: 'workspace:reveal-leaf';
      readonly snapshot: PluginSupervisorWorkspaceSnapshot;
    }
  | {
      readonly kind: 'workspace:detach-leaves-of-type';
      readonly snapshot: PluginSupervisorWorkspaceSnapshot;
    };

export interface PluginSupervisorHostRequestMessage {
  readonly type: 'host-request';
  readonly data: {
    readonly requestId: string;
    readonly request: PluginSupervisorHostRequestPayload;
  };
}

export interface PluginSupervisorHostResponseMessage {
  readonly type: 'host-response';
  readonly data: {
    readonly requestId: string;
    readonly response: PluginSupervisorHostResponsePayload;
  };
}

export interface PluginSupervisorHostResponseErrorMessage {
  readonly type: 'host-response-error';
  readonly data: {
    readonly requestId: string;
    readonly message: string;
  };
}

export type PluginSupervisorParentControlMessage =
  | PluginSupervisorInitializeMessage
  | PluginSupervisorPingMessage
  | PluginSupervisorSyncDescriptorsMessage
  | PluginSupervisorSyncCommandsMessage
  | PluginSupervisorShutdownMessage
  | PluginSupervisorExecuteCommandMessage
  | PluginSupervisorExecuteProtocolMessage
  | PluginSupervisorExecuteBasesViewMessage
  | PluginSupervisorExecuteUiEntryMessage
  | PluginSupervisorOpenViewInstanceMessage
  | PluginSupervisorUpdateViewInstanceMessage
  | PluginSupervisorResizeViewInstanceMessage
  | PluginSupervisorCloseViewInstanceMessage;

export type PluginSupervisorParentMessage =
  | PluginSupervisorParentControlMessage
  | PluginSupervisorHostResponseMessage
  | PluginSupervisorHostResponseErrorMessage;

export interface PluginSupervisorStartedMessage {
  readonly type: 'started';
}

export interface PluginSupervisorReadyMessage {
  readonly type: 'ready';
  readonly data: {
    readonly startedAt: number;
  };
}

export interface PluginSupervisorPongMessage {
  readonly type: 'pong';
  readonly data: {
    readonly requestId: string;
    readonly sentAt: number;
    readonly receivedAt: number;
  };
}

export interface PluginSupervisorSyncCompleteMessage {
  readonly type: 'sync-complete';
  readonly data: {
    readonly requestId: string;
    readonly pluginCount: number;
  };
}

export interface PluginSupervisorShutdownCompleteMessage {
  readonly type: 'shutdown-complete';
  readonly data: {
    readonly requestId: string;
  };
}

export interface PluginSupervisorErrorMessage {
  readonly type: 'error';
  readonly data: {
    readonly message: string;
    readonly fatal: boolean;
  };
}

export interface PluginSupervisorCommandsUpdatedMessage {
  readonly type: 'commands-updated';
  readonly data: {
    readonly commands: readonly PluginSupervisorCommandSnapshot[];
  };
}

export interface PluginSupervisorSettingTabsUpdatedMessage {
  readonly type: 'setting-tabs-updated';
  readonly data: {
    readonly settingTabs: readonly PluginSupervisorSettingTabSnapshot[];
  };
}

export interface PluginSupervisorViewsUpdatedMessage {
  readonly type: 'views-updated';
  readonly data: {
    readonly views: readonly PluginSupervisorViewSnapshot[];
  };
}

export interface PluginSupervisorExtensionsUpdatedMessage {
  readonly type: 'extensions-updated';
  readonly data: {
    readonly extensions: readonly PluginSupervisorExtensionSnapshot[];
  };
}

export interface PluginSupervisorUiEntriesUpdatedMessage {
  readonly type: 'ui-entries-updated';
  readonly data: {
    readonly entries: readonly PluginUiEntrySnapshot[];
  };
}

export interface PluginSupervisorCommandExecutedMessage {
  readonly type: 'command-executed';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly result: SharedJsonValue | null;
    readonly fallbackToMain: boolean;
  };
}

export interface PluginSupervisorProtocolExecutedMessage {
  readonly type: 'protocol-executed';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly fallbackToMain: boolean;
  };
}

export interface PluginSupervisorBasesViewRenderedMessage {
  readonly type: 'bases-view-rendered';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly snapshot: BasesViewSnapshot | null;
    readonly fallbackToMain: boolean;
  };
}

export interface PluginSupervisorUiEntryExecutedMessage {
  readonly type: 'ui-entry-executed';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
  };
}

export interface PluginSupervisorViewInstanceOpenedMessage {
  readonly type: 'view-instance-opened';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly snapshot: PluginSupervisorViewInstanceSnapshot | null;
  };
}

export interface PluginSupervisorViewInstanceUpdatedMessage {
  readonly type: 'view-instance-updated';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly snapshot: PluginSupervisorViewInstanceSnapshot | null;
  };
}

export interface PluginSupervisorViewInstanceResizedMessage {
  readonly type: 'view-instance-resized';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
    readonly snapshot: PluginSupervisorViewInstanceSnapshot | null;
  };
}

export interface PluginSupervisorViewInstanceClosedMessage {
  readonly type: 'view-instance-closed';
  readonly data: {
    readonly requestId: string;
    readonly handled: boolean;
  };
}

export interface PluginSupervisorCommandsSyncCompleteMessage {
  readonly type: 'commands-sync-complete';
  readonly data: {
    readonly requestId: string;
    readonly commandCount: number;
  };
}

export interface PluginSupervisorRuntimeStatesUpdatedMessage {
  readonly type: 'runtime-states-updated';
  readonly data: {
    readonly plugins: readonly PluginSupervisorPluginRuntimeSnapshot[];
  };
}

export type PluginSupervisorChildMessage =
  | PluginSupervisorStartedMessage
  | PluginSupervisorReadyMessage
  | PluginSupervisorPongMessage
  | PluginSupervisorSyncCompleteMessage
  | PluginSupervisorCommandsSyncCompleteMessage
  | PluginSupervisorShutdownCompleteMessage
  | PluginSupervisorErrorMessage
  | PluginSupervisorHostRequestMessage
  | PluginSupervisorCommandsUpdatedMessage
  | PluginSupervisorSettingTabsUpdatedMessage
  | PluginSupervisorViewsUpdatedMessage
  | PluginSupervisorExtensionsUpdatedMessage
  | PluginSupervisorUiEntriesUpdatedMessage
  | PluginSupervisorRuntimeStatesUpdatedMessage
  | PluginSupervisorCommandExecutedMessage
  | PluginSupervisorProtocolExecutedMessage
  | PluginSupervisorBasesViewRenderedMessage
  | PluginSupervisorUiEntryExecutedMessage
  | PluginSupervisorViewInstanceOpenedMessage
  | PluginSupervisorViewInstanceUpdatedMessage
  | PluginSupervisorViewInstanceResizedMessage
  | PluginSupervisorViewInstanceClosedMessage;

export interface PluginSupervisorStateSnapshot {
  readonly status: PluginSupervisorRuntimeStatus;
  readonly pluginCount: number;
  readonly pid: number | null;
  readonly lastHeartbeatAt: number | null;
  readonly lastSyncedAt: number | null;
  readonly startedAt: number | null;
  readonly lastError: string | null;
}

export function descriptorToSupervisorSnapshot(
  descriptor: PluginDescriptor,
): PluginSupervisorDescriptorSnapshot {
  return {
    pluginId: descriptor.manifest.id,
    displayName: descriptor.manifest.name,
    version: descriptor.manifest.version,
    rootDirectory: descriptor.rootDirectory,
    entryPath: descriptor.entryPath,
    manifestPath: descriptor.manifestPath,
    uiEntrypoints: descriptor.uiEntrypoints,
  };
}
