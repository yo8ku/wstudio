import { BrowserWindow, ipcMain } from 'electron';
import type { Rectangle } from 'electron';
import type {
  JsonValue,
  PluginSurfaceRuntimeStatusSnapshot,
  PluginSurfaceStateSnapshot,
} from '@note-studio/shared';
import {
  pluginSurfaceViewService,
  type PluginSurfaceViewAttachRequest,
} from '../services/plugin-surface/PluginSurfaceViewService';
import type { PluginSurfaceThemeSnapshot } from '../services/plugin-surface/pluginSurfaceRuntime';
import { emitPluginRuntimeNotice } from './pluginRuntimeHandlers';

export const PLUGIN_SURFACE_ATTACH_CHANNEL = 'plugin-surface:attach';
export const PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL = 'plugin-surface:update-bounds';
export const PLUGIN_SURFACE_DESTROY_CHANNEL = 'plugin-surface:destroy';
export const PLUGIN_SURFACE_STATE_CHANGED_CHANNEL = 'plugin-surface:state-changed';
export const PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL = 'plugin-surface:update-context';
export const PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL = 'plugin-surface:show-notice';
export const PLUGIN_SURFACE_REPORT_RUNTIME_STATUS_CHANNEL = 'plugin-surface:report-runtime-status';
export const PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL = 'plugin-surface:runtime-status-changed';
export const PLUGIN_SURFACE_SET_COMMAND_CENTER_VISIBILITY_CHANNEL = 'plugin-surface:set-command-center-visibility';
export const PLUGIN_SURFACE_CAPTURE_COMMAND_CENTER_PREVIEWS_CHANNEL = 'plugin-surface:capture-command-center-previews';

interface PluginSurfaceOperationResponse {
  readonly success: boolean;
}

interface PluginSurfaceCommandCenterPreviewResponse extends PluginSurfaceOperationResponse {
  readonly previews: Readonly<Record<string, string>>;
}

interface PluginSurfaceUpdateBoundsRequest {
  readonly surfaceInstanceId: string;
  readonly bounds: Rectangle;
}

interface PluginSurfaceDestroyRequest {
  readonly surfaceInstanceId: string;
}

interface PluginSurfaceUpdateContextRequest {
  readonly surfaceInstanceId: string;
  readonly state: JsonValue | null;
  readonly theme: PluginSurfaceThemeSnapshot;
}

interface PluginSurfaceShowNoticeRequest {
  readonly message: string;
  readonly level: 'success' | 'error' | 'warning' | 'info';
}

interface PluginSurfaceSetCommandCenterVisibilityRequest {
  readonly visible: boolean;
}

let pluginSurfaceHandlersRegistered = false;

function broadcastPluginSurfaceMessage(channel: string, payload: object): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

export function registerPluginSurfaceHandlers(): void {
  if (pluginSurfaceHandlersRegistered) {
    return;
  }

  pluginSurfaceHandlersRegistered = true;
  pluginSurfaceViewService.subscribeToSurfaceState((snapshot: PluginSurfaceStateSnapshot): void => {
    broadcastPluginSurfaceMessage(PLUGIN_SURFACE_STATE_CHANGED_CHANNEL, snapshot);
  });
  pluginSurfaceViewService.subscribeToRuntimeStatus((snapshot: PluginSurfaceRuntimeStatusSnapshot): void => {
    broadcastPluginSurfaceMessage(PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL, snapshot);
  });

  ipcMain.handle(
    PLUGIN_SURFACE_ATTACH_CHANNEL,
    async (
      _event,
      request: PluginSurfaceViewAttachRequest,
    ): Promise<PluginSurfaceOperationResponse> => {
      await pluginSurfaceViewService.attachSurface(request);
      return { success: true };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL,
    (_event, request: PluginSurfaceUpdateBoundsRequest): PluginSurfaceOperationResponse => {
      return {
        success: pluginSurfaceViewService.updateSurfaceBounds(request.surfaceInstanceId, request.bounds),
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_DESTROY_CHANNEL,
    (_event, request: PluginSurfaceDestroyRequest): PluginSurfaceOperationResponse => {
      return {
        success: pluginSurfaceViewService.destroySurface(request.surfaceInstanceId),
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL,
    (_event, request: PluginSurfaceUpdateContextRequest): PluginSurfaceOperationResponse => {
      return {
        success: pluginSurfaceViewService.updateSurfaceRuntimeContext(
          request.surfaceInstanceId,
          request.state,
          request.theme,
        ),
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_SHOW_NOTICE_CHANNEL,
    (_event, request: PluginSurfaceShowNoticeRequest): PluginSurfaceOperationResponse => {
      emitPluginRuntimeNotice(request);
      return {
        success: true,
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_REPORT_RUNTIME_STATUS_CHANNEL,
    (_event, snapshot: PluginSurfaceRuntimeStatusSnapshot): PluginSurfaceOperationResponse => {
      pluginSurfaceViewService.publishRuntimeStatus(snapshot);
      return {
        success: true,
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_SET_COMMAND_CENTER_VISIBILITY_CHANNEL,
    async (
      _event,
      request: PluginSurfaceSetCommandCenterVisibilityRequest,
    ): Promise<PluginSurfaceOperationResponse> => {
      await pluginSurfaceViewService.setCommandCenterVisible(request.visible);
      return {
        success: true,
      };
    },
  );

  ipcMain.handle(
    PLUGIN_SURFACE_CAPTURE_COMMAND_CENTER_PREVIEWS_CHANNEL,
    async (): Promise<PluginSurfaceCommandCenterPreviewResponse> => {
      const previews = await pluginSurfaceViewService.captureCommandCenterPreviews();
      return {
        success: true,
        previews,
      };
    },
  );
}
