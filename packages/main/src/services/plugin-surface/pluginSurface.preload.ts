import { contextBridge, ipcRenderer } from 'electron';
import type {
  JsonValue,
  PluginSurfaceRuntimeStatusSnapshot,
  PluginUiRuntimeEditorActionRequest,
  PluginUiRuntimeEditorStateSnapshot,
  PluginUiRuntimeEditorTextEdit,
  PluginUiRuntimeSettingTabSummary,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import type { PluginSurfaceRuntimeContextSnapshot } from './pluginSurfaceRuntime';
import type { PluginSurfaceBootstrapContext } from './pluginSurfaceContext';

const PLUGIN_SURFACE_CONTEXT_UPDATED_CHANNEL = 'plugin-surface:context-updated';
const PLUGIN_SURFACE_REPORT_RUNTIME_STATUS_CHANNEL = 'plugin-surface:report-runtime-status';
const PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX = '--plugin-surface-context=';

const PLUGIN_SURFACE_KINDS = [
  'view',
  'settingTab',
  'modal',
  'popover',
] as const;

type PluginSurfaceKind = (typeof PLUGIN_SURFACE_KINDS)[number];

function resolveRequiredContextValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function resolveOptionalContextValue(
  params: URLSearchParams,
  key: string,
): string | null {
  const value = params.get(key);

  if (value === null) {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function isPluginSurfaceKind(value: string): value is PluginSurfaceKind {
  return PLUGIN_SURFACE_KINDS.some((surfaceKind) => surfaceKind === value);
}

function parsePluginSurfaceContextArgument(
  argv: readonly string[],
): PluginSurfaceBootstrapContext | null {
  for (const argument of argv) {
    if (!argument.startsWith(PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX)) {
      continue;
    }

    const encodedPayload = argument.slice(PLUGIN_SURFACE_CONTEXT_ARGUMENT_PREFIX.length);
    const params = new URLSearchParams(encodedPayload);
    const surfaceInstanceId = resolveRequiredContextValue(params, 'surfaceInstanceId');
    const pluginId = resolveRequiredContextValue(params, 'pluginId');
    const surfaceKindValue = resolveRequiredContextValue(params, 'surfaceKind');
    const surfaceId = resolveRequiredContextValue(params, 'surfaceId');
    const entryUrl = resolveRequiredContextValue(params, 'entryUrl');
    const leafId = resolveOptionalContextValue(params, 'leafId');
    const overlayId = resolveOptionalContextValue(params, 'overlayId');

    if (
      surfaceInstanceId === null
      || pluginId === null
      || surfaceKindValue === null
      || surfaceId === null
      || entryUrl === null
      || !isPluginSurfaceKind(surfaceKindValue)
    ) {
      return null;
    }

    return {
      surfaceInstanceId,
      pluginId,
      surfaceKind: surfaceKindValue,
      surfaceId,
      entryUrl,
      leafId,
      overlayId,
    };
  }

  return null;
}

type PluginSurfaceHostRequestMethod =
  | 'show-notice'
  | 'execute-command'
  | 'activate-view'
  | 'close-view'
  | 'close-overlay'
  | 'file-show-open-dialog'
  | 'dispatch-overlay-action'
  | 'open-workspace-file'
  | 'load-entry-source'
  | 'editor-get-state'
  | 'editor-apply-text-edits'
  | 'editor-perform-action'
  | 'invoke-logic-action'
  | 'data-load'
  | 'data-save'
  | 'data-delete'
  | 'settings-get-tabs'
  | 'url-browser-download-action';

type PluginSurfaceHostRequestPayload =
  | JsonValue
  | {
      readonly message: string;
      readonly level: 'success' | 'error' | 'warning' | 'info';
      readonly duration?: number;
    }
  | {
      readonly commandId: string;
      readonly args?: readonly JsonValue[];
    }
  | {
      readonly path: string;
      readonly options?: {
        readonly forceNewLeaf?: boolean;
      };
    }
  | {
      readonly title?: string;
      readonly defaultPath?: string;
      readonly filters?: readonly {
        readonly name: string;
        readonly extensions: readonly string[];
      }[];
      readonly properties?: readonly ('openFile' | 'openDirectory' | 'multiSelections')[];
    }
  | {
      readonly documentUri: string | null;
    }
  | {
      readonly documentUri: string;
      readonly edits: readonly PluginUiRuntimeEditorTextEdit[];
    }
  | PluginUiRuntimeEditorActionRequest
  | {
      readonly data: JsonValue | null;
    }
  | null;

type PluginSurfaceHostRequestResult =
  | JsonValue
  | PluginUiRuntimeEditorStateSnapshot
  | readonly PluginUiRuntimeSettingTabSummary[]
  | null;

interface PluginSurfacePreloadBridge {
  getSurfaceContext(): PluginSurfaceBootstrapContext | null;
  getRuntimeContext(): PluginSurfaceRuntimeContextSnapshot | null;
  onRuntimeContextChange(
    listener: (snapshot: PluginSurfaceRuntimeContextSnapshot) => void,
  ): () => void;
  invokeHost(
    method: PluginSurfaceHostRequestMethod,
    payload: PluginSurfaceHostRequestPayload,
  ): Promise<PluginSurfaceHostRequestResult>;
  reportRuntimeStatus(snapshot: PluginSurfaceRuntimeStatusSnapshot): void;
}

const PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL = 'plugin-runtime:request-activate-view';
const PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL = 'plugin-runtime:request-close-view';
const PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:request-close-overlay-frame';
const PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL = 'plugin-runtime:dispatch-overlay-action';
const PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL = 'plugin-runtime:request-open-workspace-file';
const PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL = 'plugin-runtime:read-entry-source';
const PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL = 'plugin-runtime:editor-get-state';
const PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL = 'plugin-runtime:editor-apply-text-edits';
const PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL = 'plugin-runtime:editor-perform-action';
const PLUGIN_RUNTIME_INVOKE_LOGIC_ACTION_CHANNEL = 'plugin-runtime:invoke-logic-action';
const PLUGIN_RUNTIME_DATA_LOAD_CHANNEL = 'plugin-runtime:data-load';
const PLUGIN_RUNTIME_DATA_SAVE_CHANNEL = 'plugin-runtime:data-save';
const PLUGIN_RUNTIME_DATA_DELETE_CHANNEL = 'plugin-runtime:data-delete';
const PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL = 'plugin-runtime:settings-get-tabs';
const URL_BROWSER_DOWNLOAD_ACTION_CHANNEL = 'url-browser:download-action';
const PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL = 'plugin-surface:show-notice';

const pluginSurfaceContext = parsePluginSurfaceContextArgument(process.argv);
const runtimeContextListeners = new Set<(snapshot: PluginSurfaceRuntimeContextSnapshot) => void>();
let runtimeContextSnapshot: PluginSurfaceRuntimeContextSnapshot | null = pluginSurfaceContext === null
  ? null
  : {
      surfaceInstanceId: pluginSurfaceContext.surfaceInstanceId,
      state: null,
      theme: {
        info: {
          id: 'unknown-theme',
          label: 'unknown-theme',
          appearance: 'dark',
        },
        tokens: {},
      },
    };

function isOpenWorkspaceFilePayload(
  payload: PluginSurfaceHostRequestPayload,
): payload is {
  readonly path: string;
  readonly options?: {
    readonly forceNewLeaf?: boolean;
  };
} {
  return payload !== null
    && typeof payload === 'object'
    && 'path' in payload
    && typeof payload.path === 'string';
}

function isDataSavePayload(
  payload: PluginSurfaceHostRequestPayload,
): payload is {
  readonly data: JsonValue | null;
} {
  return payload !== null
    && typeof payload === 'object'
    && 'data' in payload;
}

function buildRuntimeSurfaceDescriptor(): PluginUiRuntimeSurfaceDescriptor {
  if (pluginSurfaceContext === null) {
    throw new Error('Plugin surface bootstrap context is unavailable.');
  }

  return {
    pluginId: pluginSurfaceContext.pluginId,
    surfaceKind: pluginSurfaceContext.surfaceKind,
    surfaceId: pluginSurfaceContext.surfaceId,
    entryUrl: pluginSurfaceContext.entryUrl,
    state: runtimeContextSnapshot?.state ?? null,
  };
}

function notifyRuntimeContextListeners(snapshot: PluginSurfaceRuntimeContextSnapshot): void {
  for (const listener of runtimeContextListeners) {
    listener(snapshot);
  }
}

ipcRenderer.on(
  PLUGIN_SURFACE_CONTEXT_UPDATED_CHANNEL,
  (_event, snapshot: PluginSurfaceRuntimeContextSnapshot) => {
    runtimeContextSnapshot = snapshot;
    notifyRuntimeContextListeners(snapshot);
  },
);

const pluginSurfaceBridge: PluginSurfacePreloadBridge = {
  getSurfaceContext(): PluginSurfaceBootstrapContext | null {
    return pluginSurfaceContext;
  },
  getRuntimeContext(): PluginSurfaceRuntimeContextSnapshot | null {
    return runtimeContextSnapshot;
  },
  onRuntimeContextChange(
    listener: (snapshot: PluginSurfaceRuntimeContextSnapshot) => void,
  ): () => void {
    runtimeContextListeners.add(listener);

    return (): void => {
      runtimeContextListeners.delete(listener);
    };
  },
  async invokeHost(
    method: PluginSurfaceHostRequestMethod,
    payload: PluginSurfaceHostRequestPayload,
  ): Promise<PluginSurfaceHostRequestResult> {
    if (method === 'show-notice') {
      if (payload === null || typeof payload !== 'object') {
        throw new Error('Plugin surface notice payload is required.');
      }

      await ipcRenderer.invoke(PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL, payload);
      return null;
    }

    if (method === 'execute-command') {
      if (payload === null || typeof payload !== 'object') {
        throw new Error('Plugin surface command payload is required.');
      }

      return await ipcRenderer.invoke('extensions:workbench:execute-command', payload).then((response: {
        readonly success: boolean;
        readonly data?: JsonValue | null;
        readonly error?: {
          readonly message?: string;
        };
      }) => {
        if (!response.success) {
          throw new Error(response.error?.message ?? '执行插件命令失败');
        }

        return response.data ?? null;
      });
    }

    if (method === 'activate-view') {
      if (pluginSurfaceContext?.leafId === null || pluginSurfaceContext === null) {
        throw new Error('Plugin surface is not attached to a workspace leaf.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL, {
        leafId: pluginSurfaceContext.leafId,
      });
      return null;
    }

    if (method === 'close-view') {
      if (pluginSurfaceContext?.leafId === null || pluginSurfaceContext === null) {
        throw new Error('Plugin surface is not attached to a workspace leaf.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL, {
        leafId: pluginSurfaceContext.leafId,
      });
      return null;
    }

    if (method === 'close-overlay') {
      if (pluginSurfaceContext?.overlayId === null || pluginSurfaceContext === null) {
        throw new Error('Plugin surface is not attached to an overlay.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL, {
        overlayId: pluginSurfaceContext.overlayId,
      });
      return null;
    }

    if (method === 'file-show-open-dialog') {
      return await ipcRenderer.invoke('file:show-open-dialog', payload) as JsonValue;
    }

    if (method === 'dispatch-overlay-action') {
      if (pluginSurfaceContext?.overlayId === null || pluginSurfaceContext === null) {
        throw new Error('Plugin surface is not attached to an overlay.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL, {
        overlayId: pluginSurfaceContext.overlayId,
        action: payload,
      });
      return null;
    }

    if (method === 'open-workspace-file') {
      if (!isOpenWorkspaceFilePayload(payload)) {
        throw new Error('Plugin surface workspace file path is required.');
      }

      return await ipcRenderer.invoke(
        PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL,
        payload.path,
        payload.options,
      ) as boolean;
    }

    if (method === 'load-entry-source') {
      const entrySource = await ipcRenderer.invoke(
        PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL,
        buildRuntimeSurfaceDescriptor(),
      ) as string | null | undefined;
      return entrySource ?? null;
    }

    if (method === 'editor-get-state') {
      return await ipcRenderer.invoke(
        PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL,
        payload,
      ) as PluginUiRuntimeEditorStateSnapshot | null;
    }

    if (method === 'editor-apply-text-edits') {
      await ipcRenderer.invoke(
        PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL,
        payload,
      );
      return null;
    }

    if (method === 'editor-perform-action') {
      await ipcRenderer.invoke(
        PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL,
        {
          request: payload,
        },
      );
      return null;
    }

    if (method === 'invoke-logic-action') {
      if (
        pluginSurfaceContext === null
        || payload === null
        || typeof payload !== 'object'
        || !('actionId' in payload)
        || typeof payload.actionId !== 'string'
      ) {
        throw new Error('Plugin surface logic action payload is required.');
      }

      return await ipcRenderer.invoke(
        PLUGIN_RUNTIME_INVOKE_LOGIC_ACTION_CHANNEL,
        {
          pluginId: pluginSurfaceContext.pluginId,
          actionId: payload.actionId,
          payload: 'payload' in payload ? payload.payload ?? null : null,
        },
      ) as JsonValue | null;
    }

    if (method === 'data-load') {
      if (pluginSurfaceContext === null) {
        throw new Error('Plugin surface bootstrap context is unavailable.');
      }

      return await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_LOAD_CHANNEL, {
        pluginId: pluginSurfaceContext.pluginId,
      }) as JsonValue | null;
    }

    if (method === 'data-save') {
      if (pluginSurfaceContext === null) {
        throw new Error('Plugin surface bootstrap context is unavailable.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_SAVE_CHANNEL, {
        pluginId: pluginSurfaceContext.pluginId,
        data: isDataSavePayload(payload) ? payload.data : null,
      });
      return null;
    }

    if (method === 'data-delete') {
      if (pluginSurfaceContext === null) {
        throw new Error('Plugin surface bootstrap context is unavailable.');
      }

      await ipcRenderer.invoke(PLUGIN_RUNTIME_DATA_DELETE_CHANNEL, {
        pluginId: pluginSurfaceContext.pluginId,
      });
      return null;
    }

    if (method === 'url-browser-download-action') {
      return await ipcRenderer.invoke(
        URL_BROWSER_DOWNLOAD_ACTION_CHANNEL,
        payload,
      ) as boolean;
    }

    if (pluginSurfaceContext === null) {
      throw new Error('Plugin surface bootstrap context is unavailable.');
    }

    return await ipcRenderer.invoke(PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL, {
      pluginId: pluginSurfaceContext.pluginId,
    }) as readonly PluginUiRuntimeSettingTabSummary[];
  },
  reportRuntimeStatus(snapshot: PluginSurfaceRuntimeStatusSnapshot): void {
    void ipcRenderer.invoke(PLUGIN_SURFACE_REPORT_RUNTIME_STATUS_CHANNEL, snapshot);
  },
};

contextBridge.exposeInMainWorld('pluginSurfaceBridge', pluginSurfaceBridge);
