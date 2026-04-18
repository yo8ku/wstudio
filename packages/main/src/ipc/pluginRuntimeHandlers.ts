import { BrowserWindow, ipcMain } from 'electron';
import type {
  JsonValue,
  PluginUiRuntimeEditorActionRequest,
  PluginUiRuntimeEditorStateSnapshot,
  PluginUiRuntimeSettingTabSummary,
  PluginUiRuntimeEditorTextEdit,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import { dispatchHostDocumentEvent } from '../services/plugin-host/MainProcessDomShim';
import {
  getCurrentPluginExecutionContextPluginId,
  runWithPluginExecutionContext,
} from '../services/plugin-host/pluginExecutionContext';

export const PLUGIN_RUNTIME_NOTICE_CHANNEL = 'plugin-runtime:show-notice';
export const PLUGIN_RUNTIME_DISPATCH_DOCUMENT_EVENT_CHANNEL = 'plugin-runtime:dispatch-document-event';
export const PLUGIN_RUNTIME_OPEN_FILE_CHANNEL = 'plugin-runtime:open-file';
export const PLUGIN_RUNTIME_OPEN_VIEW_CHANNEL = 'plugin-runtime:open-view';
export const PLUGIN_RUNTIME_UPDATE_VIEW_CHANNEL = 'plugin-runtime:update-view';
export const PLUGIN_RUNTIME_CLOSE_VIEW_CHANNEL = 'plugin-runtime:close-view';
export const PLUGIN_RUNTIME_OPEN_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:open-overlay-frame';
export const PLUGIN_RUNTIME_UPDATE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:update-overlay-frame';
export const PLUGIN_RUNTIME_CLOSE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:close-overlay-frame';
export const PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:request-close-overlay-frame';
export const PLUGIN_RUNTIME_HANDLE_EDITOR_SUGGEST_KEY_CHANNEL = 'plugin-runtime:handle-editor-suggest-key';
export const PLUGIN_RUNTIME_DISPATCH_OVERLAY_EVENT_CHANNEL = 'plugin-runtime:dispatch-overlay-event';
export const PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL = 'plugin-runtime:dispatch-overlay-action';
export const PLUGIN_RUNTIME_DISPATCH_VIEW_EVENT_CHANNEL = 'plugin-runtime:dispatch-view-event';
export const PLUGIN_RUNTIME_OPEN_MENU_CHANNEL = 'plugin-runtime:open-menu';
export const PLUGIN_RUNTIME_CLOSE_MENU_CHANNEL = 'plugin-runtime:close-menu';
export const PLUGIN_RUNTIME_SELECT_MENU_ITEM_CHANNEL = 'plugin-runtime:select-menu-item';
export const PLUGIN_RUNTIME_MENU_HIDDEN_CHANNEL = 'plugin-runtime:menu-hidden';
export const PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL = 'plugin-runtime:request-close-view';
export const PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL = 'plugin-runtime:request-activate-view';
export const PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL = 'plugin-runtime:request-open-workspace-file';
export const PLUGIN_RUNTIME_SYNC_RENAMED_WORKSPACE_FILE_CHANNEL = 'plugin-runtime:sync-renamed-workspace-file';
export const PLUGIN_RUNTIME_SYNC_DELETED_WORKSPACE_FILE_CHANNEL = 'plugin-runtime:sync-deleted-workspace-file';
export const PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL = 'plugin-runtime:read-entry-source';
export const PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL = 'plugin-runtime:mark-view-runtime-active';
export const PLUGIN_RUNTIME_MARK_OVERLAY_RUNTIME_ACTIVE_CHANNEL = 'plugin-runtime:mark-overlay-runtime-active';
export const PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL = 'plugin-runtime:editor-get-state';
export const PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL = 'plugin-runtime:editor-apply-text-edits';
export const PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL = 'plugin-runtime:editor-perform-action';
export const PLUGIN_RUNTIME_DATA_LOAD_CHANNEL = 'plugin-runtime:data-load';
export const PLUGIN_RUNTIME_DATA_SAVE_CHANNEL = 'plugin-runtime:data-save';
export const PLUGIN_RUNTIME_DATA_DELETE_CHANNEL = 'plugin-runtime:data-delete';
export const PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL = 'plugin-runtime:settings-get-tabs';

interface PluginRuntimeNoticePayload {
  readonly message: string;
  readonly level: 'success' | 'error' | 'warning' | 'info';
  readonly duration?: number;
}

interface PluginRuntimeOpenFilePayload {
  readonly path: string;
  readonly title: string;
  readonly language: string;
  readonly content: string;
}

export interface PluginRuntimeViewPayload {
  readonly leafId: string;
  readonly path: string;
  readonly sourcePath: string | null;
  readonly title: string;
  readonly viewType: string;
  readonly icon: string | null;
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
  readonly active: boolean;
}

export interface PluginRuntimeOverlayFramePayload {
  readonly overlayId: string;
  readonly title: string;
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
  readonly width?: number;
  readonly height?: number;
  readonly closeOnBackdrop?: boolean;
  readonly chrome?: 'dialog' | 'popover';
  readonly interactionMode?: 'default' | 'editorSuggest';
  readonly anchorRect?: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

interface PluginRuntimeMenuItemPayload {
  readonly id: string;
  readonly title: string;
  readonly icon: string | null;
  readonly checked: boolean | null;
  readonly disabled: boolean;
  readonly warning: boolean;
  readonly label: boolean;
  readonly section: string;
  readonly separator: boolean;
}

interface PluginRuntimeMenuPositionPayload {
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly overlap?: boolean;
  readonly left?: boolean;
}

interface PluginRuntimeOpenMenuPayload {
  readonly menuId: string;
  readonly items: readonly PluginRuntimeMenuItemPayload[];
  readonly position: PluginRuntimeMenuPositionPayload | null;
  readonly noIcon: boolean;
  readonly useNativeMenu: boolean;
}

interface PluginRuntimeDocumentEventRequest {
  readonly type: string;
  readonly key?: string;
  readonly clientX?: number;
  readonly clientY?: number;
  readonly button?: number;
}

interface PluginRuntimeSelectMenuItemRequest {
  readonly menuId: string;
  readonly itemId: string;
}

interface PluginRuntimeMenuHiddenRequest {
  readonly menuId: string;
}

interface PluginRuntimeViewRequest {
  readonly leafId: string;
}

interface PluginRuntimeOpenWorkspaceFileOptions {
  readonly forceNewLeaf?: boolean;
}

interface PluginRuntimeEditorGetStateRequest {
  readonly documentUri: string | null;
}

interface PluginRuntimeEditorApplyTextEditsRequest {
  readonly documentUri: string;
  readonly edits: readonly PluginUiRuntimeEditorTextEdit[];
}

interface PluginRuntimeEditorPerformActionRequest {
  readonly request: PluginUiRuntimeEditorActionRequest;
}

interface PluginRuntimePluginScopedRequest {
  readonly pluginId: string;
}

interface PluginRuntimeDataSaveRequest extends PluginRuntimePluginScopedRequest {
  readonly data: JsonValue | null;
}

interface PluginRuntimeDispatchViewEventRequest extends PluginRuntimeViewRequest {
  readonly nodeId: string;
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
}

interface PluginRuntimeOverlayFrameCloseRequest {
  readonly overlayId: string;
}

interface PluginRuntimeEditorSuggestKeyRequest {
  readonly key: string;
}

interface PluginRuntimeDispatchOverlayEventRequest extends PluginRuntimeOverlayFrameCloseRequest {
  readonly nodeId: string;
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
}

interface PluginRuntimeDispatchOverlayActionRequest extends PluginRuntimeOverlayFrameCloseRequest {
  readonly action: JsonValue | null;
}

interface ActivePluginRuntimeMenu {
  readonly pluginId: string | null;
  readonly onSelect: (itemId: string) => void;
  readonly onHide: (() => void) | null;
}

interface ActivePluginRuntimeOverlayFrame {
  readonly pluginId: string | null;
  readonly onClose: (() => void) | null;
  readonly dispatchRuntimeAction: ((action: JsonValue | null) => void) | null;
  readonly dispatchEvent: ((
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
  ) => boolean) | null;
}

let pluginRuntimeHandlersRegistered = false;
let nextPluginRuntimeMenuId = 0;
let nextPluginRuntimeOverlayFrameId = 0;
const activePluginRuntimeMenus = new Map<string, ActivePluginRuntimeMenu>();
const activePluginRuntimeOverlayFrames = new Map<string, ActivePluginRuntimeOverlayFrame>();
let pluginRuntimeViewRequestBridge: {
  activateView(leafId: string): Promise<void> | void;
  closeView(leafId: string): Promise<void> | void;
  markViewRuntimeActive(leafId: string): Promise<void> | void;
  markOverlayRuntimeActive(overlayId: string): Promise<void> | void;
  openWorkspaceFile(filePath: string, options?: PluginRuntimeOpenWorkspaceFileOptions): Promise<boolean> | boolean;
  getEditorState(documentUri: string | null): Promise<PluginUiRuntimeEditorStateSnapshot | null> | PluginUiRuntimeEditorStateSnapshot | null;
  applyEditorTextEdits(documentUri: string, edits: readonly PluginUiRuntimeEditorTextEdit[]): Promise<void> | void;
  performEditorAction(request: PluginUiRuntimeEditorActionRequest): Promise<void> | void;
  loadPluginData(pluginId: string): Promise<JsonValue | null> | JsonValue | null;
  savePluginData(pluginId: string, data: JsonValue | null): Promise<void> | void;
  deletePluginData(pluginId: string): Promise<void> | void;
  getPluginSettingTabs(pluginId: string): Promise<readonly PluginUiRuntimeSettingTabSummary[]> | readonly PluginUiRuntimeSettingTabSummary[];
  syncRenamedWorkspaceFile(oldPath: string, newPath: string): Promise<void> | void;
  syncDeletedWorkspaceFile(filePath: string): Promise<void> | void;
  readRuntimeEntrySource(surface: PluginUiRuntimeSurfaceDescriptor): Promise<string | null> | string | null;
  handleEditorSuggestKey(key: string): Promise<boolean> | boolean;
  dispatchViewEvent(
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
  ): Promise<boolean> | boolean;
} | null = null;

function broadcastPluginRuntimeMessage(channel: string, payload?: object): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

export function emitPluginRuntimeNotice(payload: PluginRuntimeNoticePayload): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_NOTICE_CHANNEL, payload);
}

export function openPluginRuntimeFile(payload: PluginRuntimeOpenFilePayload): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_FILE_CHANNEL, payload);
}

export function openPluginRuntimeView(payload: PluginRuntimeViewPayload): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_VIEW_CHANNEL, payload);
}

export function updatePluginRuntimeView(payload: PluginRuntimeViewPayload): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_UPDATE_VIEW_CHANNEL, payload);
}

export function closePluginRuntimeView(leafId: string): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_VIEW_CHANNEL, {
    leafId,
  });
}

export function openPluginRuntimeOverlayFrame(
  payload: Omit<PluginRuntimeOverlayFramePayload, 'overlayId'> & {
    readonly overlayId?: string;
    readonly onClose?: () => void;
    readonly dispatchRuntimeAction?: (action: JsonValue | null) => void;
    readonly dispatchEvent?: (
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
    ) => boolean;
  },
): string {
  const overlayId = payload.overlayId ?? `plugin-runtime-overlay-${++nextPluginRuntimeOverlayFrameId}`;

  activePluginRuntimeOverlayFrames.set(overlayId, {
    pluginId: getCurrentPluginExecutionContextPluginId(),
    onClose: payload.onClose ?? null,
    dispatchRuntimeAction: payload.dispatchRuntimeAction ?? null,
    dispatchEvent: payload.dispatchEvent ?? null,
  });

  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_OVERLAY_FRAME_CHANNEL, {
    overlayId,
    title: payload.title,
    runtimeSurface: payload.runtimeSurface,
    width: payload.width,
    height: payload.height,
    closeOnBackdrop: payload.closeOnBackdrop,
    chrome: payload.chrome,
    interactionMode: payload.interactionMode,
    anchorRect: payload.anchorRect ?? null,
  } satisfies PluginRuntimeOverlayFramePayload);

  return overlayId;
}

export function updatePluginRuntimeOverlayFrame(payload: PluginRuntimeOverlayFramePayload): void {
  if (!activePluginRuntimeOverlayFrames.has(payload.overlayId)) {
    return;
  }

  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_UPDATE_OVERLAY_FRAME_CHANNEL, payload);
}

export function closePluginRuntimeOverlayFrame(overlayId: string): void {
  const activeOverlay = activePluginRuntimeOverlayFrames.get(overlayId);

  if (activeOverlay === undefined) {
    return;
  }

  activePluginRuntimeOverlayFrames.delete(overlayId);
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_OVERLAY_FRAME_CHANNEL, {
    overlayId,
  });
  if (activeOverlay.pluginId === null) {
    activeOverlay.onClose?.();
    return;
  }

  runWithPluginExecutionContext(activeOverlay.pluginId, () => {
    activeOverlay.onClose?.();
  });
}

export function configurePluginRuntimeViewRequestBridge(
  bridge: {
    activateView(leafId: string): Promise<void> | void;
    closeView(leafId: string): Promise<void> | void;
    markViewRuntimeActive(leafId: string): Promise<void> | void;
    markOverlayRuntimeActive(overlayId: string): Promise<void> | void;
    openWorkspaceFile(filePath: string, options?: PluginRuntimeOpenWorkspaceFileOptions): Promise<boolean> | boolean;
    getEditorState(documentUri: string | null): Promise<PluginUiRuntimeEditorStateSnapshot | null> | PluginUiRuntimeEditorStateSnapshot | null;
    applyEditorTextEdits(documentUri: string, edits: readonly PluginUiRuntimeEditorTextEdit[]): Promise<void> | void;
    performEditorAction(request: PluginUiRuntimeEditorActionRequest): Promise<void> | void;
    loadPluginData(pluginId: string): Promise<JsonValue | null> | JsonValue | null;
    savePluginData(pluginId: string, data: JsonValue | null): Promise<void> | void;
    deletePluginData(pluginId: string): Promise<void> | void;
    getPluginSettingTabs(pluginId: string): Promise<readonly PluginUiRuntimeSettingTabSummary[]> | readonly PluginUiRuntimeSettingTabSummary[];
    syncRenamedWorkspaceFile(oldPath: string, newPath: string): Promise<void> | void;
    syncDeletedWorkspaceFile(filePath: string): Promise<void> | void;
    readRuntimeEntrySource(surface: PluginUiRuntimeSurfaceDescriptor): Promise<string | null> | string | null;
    handleEditorSuggestKey(key: string): Promise<boolean> | boolean;
    dispatchViewEvent(
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
        readonly value?: string;
        readonly checked?: boolean;
        readonly dataTransferTypes?: readonly string[];
        readonly dataTransferText?: string;
        readonly dataTransferUriList?: string;
        readonly dataTransferWorkspaceFilePath?: string;
      },
    ): Promise<boolean> | boolean;
  } | null,
): void {
  pluginRuntimeViewRequestBridge = bridge;
}

export function openPluginRuntimeMenu(
  payload: Omit<PluginRuntimeOpenMenuPayload, 'menuId'> & {
    readonly onSelect: (itemId: string) => void;
    readonly onHide?: () => void;
  },
): string {
  nextPluginRuntimeMenuId += 1;
  const menuId = `plugin-runtime-menu-${nextPluginRuntimeMenuId}`;

  activePluginRuntimeMenus.set(menuId, {
    pluginId: getCurrentPluginExecutionContextPluginId(),
    onSelect: payload.onSelect,
    onHide: payload.onHide ?? null,
  });

  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_MENU_CHANNEL, {
    menuId,
    items: payload.items,
    position: payload.position,
    noIcon: payload.noIcon,
    useNativeMenu: payload.useNativeMenu,
  } satisfies PluginRuntimeOpenMenuPayload);

  return menuId;
}

export function closePluginRuntimeMenu(menuId: string): void {
  const activeMenu = activePluginRuntimeMenus.get(menuId);

  if (activeMenu === undefined) {
    return;
  }

  activePluginRuntimeMenus.delete(menuId);
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_MENU_CHANNEL, {
    menuId,
  });
  if (activeMenu.pluginId === null) {
    activeMenu.onHide?.();
    return;
  }

  runWithPluginExecutionContext(activeMenu.pluginId, () => {
    activeMenu.onHide?.();
  });
}

export function registerPluginRuntimeHandlers(): void {
  if (pluginRuntimeHandlersRegistered) {
    return;
  }

  ipcMain.on(
    PLUGIN_RUNTIME_DISPATCH_DOCUMENT_EVENT_CHANNEL,
    (_event, request: PluginRuntimeDocumentEventRequest) => {
      dispatchHostDocumentEvent(request.type, {
        key: request.key,
        clientX: request.clientX,
        clientY: request.clientY,
        button: request.button,
      });
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL,
    async (_event, request: PluginRuntimeOverlayFrameCloseRequest) => {
      closePluginRuntimeOverlayFrame(request.overlayId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_HANDLE_EDITOR_SUGGEST_KEY_CHANNEL,
    async (_event, request: PluginRuntimeEditorSuggestKeyRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || typeof request.key !== 'string'
        || request.key.length === 0
      ) {
        return false;
      }

      return await pluginRuntimeViewRequestBridge.handleEditorSuggestKey(request.key);
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DISPATCH_OVERLAY_EVENT_CHANNEL,
    async (_event, request: PluginRuntimeDispatchOverlayEventRequest) => {
      const activeOverlay = activePluginRuntimeOverlayFrames.get(request.overlayId);

      if (activeOverlay?.dispatchEvent === null || activeOverlay?.dispatchEvent === undefined) {
        return false;
      }

      return activeOverlay.dispatchEvent(request.nodeId, {
        type: request.type,
        key: request.key,
        clientX: request.clientX,
        clientY: request.clientY,
        button: request.button,
        elementX: request.elementX,
        elementY: request.elementY,
        deltaX: request.deltaX,
        deltaY: request.deltaY,
        surfaceWidth: request.surfaceWidth,
        surfaceHeight: request.surfaceHeight,
        value: request.value,
        checked: request.checked,
        dataTransferTypes: request.dataTransferTypes,
        dataTransferText: request.dataTransferText,
        dataTransferUriList: request.dataTransferUriList,
        dataTransferWorkspaceFilePath: request.dataTransferWorkspaceFilePath,
      });
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DISPATCH_OVERLAY_ACTION_CHANNEL,
    async (_event, request: PluginRuntimeDispatchOverlayActionRequest) => {
      const activeOverlay = activePluginRuntimeOverlayFrames.get(request.overlayId);

      if (activeOverlay?.dispatchRuntimeAction === null || activeOverlay?.dispatchRuntimeAction === undefined) {
        return false;
      }

      if (activeOverlay.pluginId === null) {
        activeOverlay.dispatchRuntimeAction(request.action);
      } else {
        runWithPluginExecutionContext(activeOverlay.pluginId, () => {
          activeOverlay.dispatchRuntimeAction?.(request.action);
        });
      }

      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SELECT_MENU_ITEM_CHANNEL,
    async (_event, request: PluginRuntimeSelectMenuItemRequest) => {
      const activeMenu = activePluginRuntimeMenus.get(request.menuId);

      if (activeMenu === undefined) {
        return false;
      }

      activePluginRuntimeMenus.delete(request.menuId);
      try {
        if (activeMenu.pluginId === null) {
          activeMenu.onSelect(request.itemId);
        } else {
          runWithPluginExecutionContext(activeMenu.pluginId, () => {
            activeMenu.onSelect(request.itemId);
          });
        }
      } finally {
        broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_MENU_CHANNEL, {
          menuId: request.menuId,
        });
        if (activeMenu.pluginId === null) {
          activeMenu.onHide?.();
        } else {
          runWithPluginExecutionContext(activeMenu.pluginId, () => {
            activeMenu.onHide?.();
          });
        }
      }

      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_MENU_HIDDEN_CHANNEL,
    async (_event, request: PluginRuntimeMenuHiddenRequest) => {
      const activeMenu = activePluginRuntimeMenus.get(request.menuId);

      if (activeMenu === undefined) {
        return false;
      }

      activePluginRuntimeMenus.delete(request.menuId);
      if (activeMenu.pluginId === null) {
        activeMenu.onHide?.();
      } else {
        runWithPluginExecutionContext(activeMenu.pluginId, () => {
          activeMenu.onHide?.();
        });
      }
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DISPATCH_VIEW_EVENT_CHANNEL,
    async (_event, request: PluginRuntimeDispatchViewEventRequest) => {
      return await pluginRuntimeViewRequestBridge?.dispatchViewEvent(
        request.leafId,
        request.nodeId,
        {
          type: request.type,
          key: request.key,
          clientX: request.clientX,
          clientY: request.clientY,
          button: request.button,
          elementX: request.elementX,
          elementY: request.elementY,
          deltaX: request.deltaX,
          deltaY: request.deltaY,
          surfaceWidth: request.surfaceWidth,
          surfaceHeight: request.surfaceHeight,
          value: request.value,
          checked: request.checked,
          dataTransferTypes: request.dataTransferTypes,
          dataTransferText: request.dataTransferText,
          dataTransferUriList: request.dataTransferUriList,
          dataTransferWorkspaceFilePath: request.dataTransferWorkspaceFilePath,
        },
      ) ?? false;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_REQUEST_OPEN_WORKSPACE_FILE_CHANNEL,
    async (_event, filePath: string, options?: PluginRuntimeOpenWorkspaceFileOptions) => {
      return await pluginRuntimeViewRequestBridge?.openWorkspaceFile(filePath, options) ?? false;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_EDITOR_GET_STATE_CHANNEL,
    async (_event, request: PluginRuntimeEditorGetStateRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
      ) {
        return null;
      }

      const documentUri = typeof request.documentUri === 'string'
        ? request.documentUri
        : null;

      return await pluginRuntimeViewRequestBridge.getEditorState(documentUri);
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_EDITOR_APPLY_TEXT_EDITS_CHANNEL,
    async (_event, request: PluginRuntimeEditorApplyTextEditsRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || typeof request.documentUri !== 'string'
        || request.documentUri.trim().length === 0
        || !Array.isArray(request.edits)
      ) {
        return false;
      }

      await pluginRuntimeViewRequestBridge.applyEditorTextEdits(
        request.documentUri,
        request.edits,
      );
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_EDITOR_PERFORM_ACTION_CHANNEL,
    async (_event, request: PluginRuntimeEditorPerformActionRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || request.request === null
        || typeof request.request !== 'object'
        || typeof request.request.action !== 'string'
      ) {
        return false;
      }

      await pluginRuntimeViewRequestBridge.performEditorAction(request.request);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DATA_LOAD_CHANNEL,
    async (_event, request: PluginRuntimePluginScopedRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || typeof request.pluginId !== 'string'
        || request.pluginId.trim().length === 0
      ) {
        return null;
      }

      return await pluginRuntimeViewRequestBridge.loadPluginData(request.pluginId);
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DATA_SAVE_CHANNEL,
    async (_event, request: PluginRuntimeDataSaveRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || typeof request.pluginId !== 'string'
        || request.pluginId.trim().length === 0
      ) {
        return false;
      }

      await pluginRuntimeViewRequestBridge.savePluginData(request.pluginId, request.data ?? null);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_DATA_DELETE_CHANNEL,
    async (_event, request: PluginRuntimePluginScopedRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || typeof request.pluginId !== 'string'
        || request.pluginId.trim().length === 0
      ) {
        return false;
      }

      await pluginRuntimeViewRequestBridge.deletePluginData(request.pluginId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SETTINGS_GET_TABS_CHANNEL,
    async (_event, request: PluginRuntimePluginScopedRequest) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || request === null
        || typeof request !== 'object'
        || typeof request.pluginId !== 'string'
        || request.pluginId.trim().length === 0
      ) {
        return [];
      }

      return await pluginRuntimeViewRequestBridge.getPluginSettingTabs(request.pluginId);
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SYNC_RENAMED_WORKSPACE_FILE_CHANNEL,
    async (_event, oldPath: string, newPath: string) => {
      await pluginRuntimeViewRequestBridge?.syncRenamedWorkspaceFile(oldPath, newPath);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SYNC_DELETED_WORKSPACE_FILE_CHANNEL,
    async (_event, filePath: string) => {
      await pluginRuntimeViewRequestBridge?.syncDeletedWorkspaceFile(filePath);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_READ_ENTRY_SOURCE_CHANNEL,
    async (_event, surface: PluginUiRuntimeSurfaceDescriptor) => {
      if (
        pluginRuntimeViewRequestBridge === null
        || surface === null
        || typeof surface !== 'object'
        || typeof surface.pluginId !== 'string'
        || typeof surface.surfaceKind !== 'string'
        || typeof surface.surfaceId !== 'string'
        || typeof surface.entryUrl !== 'string'
      ) {
        return null;
      }

      return await pluginRuntimeViewRequestBridge.readRuntimeEntrySource(surface);
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_REQUEST_CLOSE_VIEW_CHANNEL,
    async (_event, request: PluginRuntimeViewRequest) => {
      await pluginRuntimeViewRequestBridge?.closeView(request.leafId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_REQUEST_ACTIVATE_VIEW_CHANNEL,
    async (_event, request: PluginRuntimeViewRequest) => {
      await pluginRuntimeViewRequestBridge?.activateView(request.leafId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL,
    async (_event, request: PluginRuntimeViewRequest) => {
      await pluginRuntimeViewRequestBridge?.markViewRuntimeActive(request.leafId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_MARK_OVERLAY_RUNTIME_ACTIVE_CHANNEL,
    async (_event, request: PluginRuntimeOverlayFrameCloseRequest) => {
      await pluginRuntimeViewRequestBridge?.markOverlayRuntimeActive(request.overlayId);
      return true;
    },
  );

  pluginRuntimeHandlersRegistered = true;
}
