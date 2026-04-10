import { BrowserWindow, ipcMain } from 'electron';
import { dispatchHostDocumentEvent } from '../services/plugin-host/MainProcessDomShim';

export const PLUGIN_RUNTIME_NOTICE_CHANNEL = 'plugin-runtime:show-notice';
export const PLUGIN_RUNTIME_OPEN_MODAL_CHANNEL = 'plugin-runtime:open-modal';
export const PLUGIN_RUNTIME_CLOSE_MODAL_CHANNEL = 'plugin-runtime:close-modal';
export const PLUGIN_RUNTIME_OPEN_SUGGEST_MODAL_CHANNEL = 'plugin-runtime:open-suggest-modal';
export const PLUGIN_RUNTIME_UPDATE_SUGGEST_MODAL_CHANNEL = 'plugin-runtime:update-suggest-modal';
export const PLUGIN_RUNTIME_CLOSE_SUGGEST_MODAL_CHANNEL = 'plugin-runtime:close-suggest-modal';
export const PLUGIN_RUNTIME_SUGGEST_MODAL_QUERY_CHANNEL = 'plugin-runtime:suggest-modal-query';
export const PLUGIN_RUNTIME_SELECT_SUGGEST_ITEM_CHANNEL = 'plugin-runtime:select-suggest-item';
export const PLUGIN_RUNTIME_SUGGEST_MODAL_HIDDEN_CHANNEL = 'plugin-runtime:suggest-modal-hidden';
export const PLUGIN_RUNTIME_DISPATCH_DOCUMENT_EVENT_CHANNEL = 'plugin-runtime:dispatch-document-event';
export const PLUGIN_RUNTIME_OPEN_FILE_CHANNEL = 'plugin-runtime:open-file';
export const PLUGIN_RUNTIME_OPEN_VIEW_CHANNEL = 'plugin-runtime:open-view';
export const PLUGIN_RUNTIME_UPDATE_VIEW_CHANNEL = 'plugin-runtime:update-view';
export const PLUGIN_RUNTIME_CLOSE_VIEW_CHANNEL = 'plugin-runtime:close-view';
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

interface PluginRuntimeNoticePayload {
  readonly message: string;
  readonly level: 'success' | 'error' | 'warning' | 'info';
}

interface PluginRuntimeModalPayload {
  readonly title: string;
  readonly description: string | null;
}

interface PluginRuntimeSuggestInstructionPayload {
  readonly command: string;
  readonly purpose: string;
}

interface PluginRuntimeSuggestItemPayload {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
}

interface PluginRuntimeOpenSuggestModalPayload {
  readonly modalId: string;
  readonly title: string;
  readonly placeholder: string;
  readonly query: string;
  readonly emptyStateText: string;
  readonly instructions: readonly PluginRuntimeSuggestInstructionPayload[];
  readonly items: readonly PluginRuntimeSuggestItemPayload[];
}

interface PluginRuntimeUpdateSuggestModalPayload {
  readonly modalId: string;
  readonly title: string;
  readonly placeholder: string;
  readonly query: string;
  readonly emptyStateText: string;
  readonly instructions: readonly PluginRuntimeSuggestInstructionPayload[];
  readonly items: readonly PluginRuntimeSuggestItemPayload[];
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
  readonly html: string;
  readonly active: boolean;
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

interface PluginRuntimeSuggestModalQueryRequest {
  readonly modalId: string;
  readonly query: string;
}

interface PluginRuntimeSelectSuggestItemRequest {
  readonly modalId: string;
  readonly itemId: string;
}

interface PluginRuntimeSuggestModalHiddenRequest {
  readonly modalId: string;
}

interface ActivePluginRuntimeMenu {
  readonly onSelect: (itemId: string) => void;
  readonly onHide: (() => void) | null;
}

interface ActivePluginRuntimeSuggestModal {
  readonly onQueryChange: (query: string) => Promise<void> | void;
  readonly onSelect: (itemId: string) => void;
  readonly onClose: (() => void) | null;
}

let pluginRuntimeHandlersRegistered = false;
let nextPluginRuntimeMenuId = 0;
let nextPluginRuntimeSuggestModalId = 0;
const activePluginRuntimeMenus = new Map<string, ActivePluginRuntimeMenu>();
const activePluginRuntimeSuggestModals = new Map<string, ActivePluginRuntimeSuggestModal>();
let pluginRuntimeViewRequestBridge: {
  activateView(leafId: string): Promise<void> | void;
  closeView(leafId: string): Promise<void> | void;
  openWorkspaceFile(filePath: string, options?: PluginRuntimeOpenWorkspaceFileOptions): Promise<boolean> | boolean;
  syncRenamedWorkspaceFile(oldPath: string, newPath: string): Promise<void> | void;
  syncDeletedWorkspaceFile(filePath: string): Promise<void> | void;
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

export function openPluginRuntimeModal(payload: PluginRuntimeModalPayload): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_MODAL_CHANNEL, payload);
}

export function closePluginRuntimeModal(): void {
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_MODAL_CHANNEL);
}

export function openPluginRuntimeSuggestModal(
  payload: Omit<PluginRuntimeOpenSuggestModalPayload, 'modalId'> & {
    readonly onQueryChange: (query: string) => Promise<void> | void;
    readonly onSelect: (itemId: string) => void;
    readonly onClose?: () => void;
  },
): string {
  nextPluginRuntimeSuggestModalId += 1;
  const modalId = `plugin-runtime-suggest-modal-${nextPluginRuntimeSuggestModalId}`;

  activePluginRuntimeSuggestModals.set(modalId, {
    onQueryChange: payload.onQueryChange,
    onSelect: payload.onSelect,
    onClose: payload.onClose ?? null,
  });

  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_OPEN_SUGGEST_MODAL_CHANNEL, {
    modalId,
    title: payload.title,
    placeholder: payload.placeholder,
    query: payload.query,
    emptyStateText: payload.emptyStateText,
    instructions: payload.instructions,
    items: payload.items,
  } satisfies PluginRuntimeOpenSuggestModalPayload);

  return modalId;
}

export function updatePluginRuntimeSuggestModal(payload: PluginRuntimeUpdateSuggestModalPayload): void {
  if (!activePluginRuntimeSuggestModals.has(payload.modalId)) {
    return;
  }

  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_UPDATE_SUGGEST_MODAL_CHANNEL, payload);
}

export function closePluginRuntimeSuggestModal(modalId: string): void {
  const activeModal = activePluginRuntimeSuggestModals.get(modalId);

  if (activeModal === undefined) {
    return;
  }

  activePluginRuntimeSuggestModals.delete(modalId);
  broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_SUGGEST_MODAL_CHANNEL, {
    modalId,
  });
  activeModal.onClose?.();
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

export function configurePluginRuntimeViewRequestBridge(
  bridge: {
    activateView(leafId: string): Promise<void> | void;
    closeView(leafId: string): Promise<void> | void;
    openWorkspaceFile(filePath: string, options?: PluginRuntimeOpenWorkspaceFileOptions): Promise<boolean> | boolean;
    syncRenamedWorkspaceFile(oldPath: string, newPath: string): Promise<void> | void;
    syncDeletedWorkspaceFile(filePath: string): Promise<void> | void;
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
  activeMenu.onHide?.();
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
    PLUGIN_RUNTIME_SUGGEST_MODAL_QUERY_CHANNEL,
    async (_event, request: PluginRuntimeSuggestModalQueryRequest) => {
      const activeModal = activePluginRuntimeSuggestModals.get(request.modalId);

      if (activeModal === undefined) {
        return false;
      }

      await activeModal.onQueryChange(request.query);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SELECT_SUGGEST_ITEM_CHANNEL,
    async (_event, request: PluginRuntimeSelectSuggestItemRequest) => {
      const activeModal = activePluginRuntimeSuggestModals.get(request.modalId);

      if (activeModal === undefined) {
        return false;
      }

      activeModal.onSelect(request.itemId);
      return true;
    },
  );

  ipcMain.handle(
    PLUGIN_RUNTIME_SUGGEST_MODAL_HIDDEN_CHANNEL,
    async (_event, request: PluginRuntimeSuggestModalHiddenRequest) => {
      const activeModal = activePluginRuntimeSuggestModals.get(request.modalId);

      if (activeModal === undefined) {
        return false;
      }

      activePluginRuntimeSuggestModals.delete(request.modalId);
      activeModal.onClose?.();
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
        activeMenu.onSelect(request.itemId);
      } finally {
        broadcastPluginRuntimeMessage(PLUGIN_RUNTIME_CLOSE_MENU_CHANNEL, {
          menuId: request.menuId,
        });
        activeMenu.onHide?.();
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
      activeMenu.onHide?.();
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

  pluginRuntimeHandlersRegistered = true;
}
