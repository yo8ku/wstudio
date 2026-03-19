/**
 * Main/renderer bridge for plugin editor capabilities.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  ExtensionHostEditorSelectionPayload,
  ExtensionHostTextEditPayload,
  PluginEditorApplyTextEditsRequestPayload,
  PluginEditorApplyTextEditsResponsePayload,
  PluginEditorStateRequestPayload,
  PluginEditorStateResponsePayload,
} from '@note-studio/shared';
import { PLUGIN_EDITOR_BRIDGE_CHANNELS } from '@note-studio/shared';

interface PendingEditorStateRequest {
  readonly resolve: (value: PluginEditorStateSnapshot) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: NodeJS.Timeout;
}

interface PendingEditorWriteRequest {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: NodeJS.Timeout;
}

export interface PluginEditorStateSnapshot {
  readonly documentUri: string | null;
  readonly content: string | null;
  readonly selection: ExtensionHostEditorSelectionPayload | null;
}

const REQUEST_TIMEOUT_MS = 3000;

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

export class PluginEditorBridge {
  private static instance: PluginEditorBridge | null = null;

  private readonly pendingStateRequests = new Map<string, PendingEditorStateRequest>();
  private readonly pendingWriteRequests = new Map<string, PendingEditorWriteRequest>();
  private requestCounter = 0;
  private mainWindow: BrowserWindow | null = null;
  private handlersRegistered = false;

  public static getInstance(): PluginEditorBridge {
    if (!PluginEditorBridge.instance) {
      PluginEditorBridge.instance = new PluginEditorBridge();
    }

    return PluginEditorBridge.instance;
  }

  public setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
    this.ensureHandlersRegistered();
  }

  public async getState(): Promise<PluginEditorStateSnapshot> {
    const windowRef = this.getAvailableWindow();
    const requestId = this.nextRequestId('state');
    const payload: PluginEditorStateRequestPayload = {
      requestId,
    };

    return new Promise<PluginEditorStateSnapshot>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingStateRequests.delete(requestId);
        reject(new Error('Timed out while waiting for renderer editor state.'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingStateRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      windowRef.webContents.send(PLUGIN_EDITOR_BRIDGE_CHANNELS.requestState, payload);
    });
  }

  public async applyTextEdits(
    documentUri: string,
    edits: ExtensionHostTextEditPayload[],
  ): Promise<void> {
    const windowRef = this.getAvailableWindow();
    const requestId = this.nextRequestId('write');
    const payload: PluginEditorApplyTextEditsRequestPayload = {
      requestId,
      documentUri,
      edits,
    };

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingWriteRequests.delete(requestId);
        reject(new Error('Timed out while waiting for renderer text edits application.'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingWriteRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      windowRef.webContents.send(PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEdits, payload);
    });
  }

  private getAvailableWindow(): BrowserWindow {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('Main editor window is unavailable.');
    }

    return this.mainWindow;
  }

  private nextRequestId(kind: string): string {
    const requestId = `plugin-editor:${kind}:${this.requestCounter}`;
    this.requestCounter += 1;
    return requestId;
  }

  private ensureHandlersRegistered(): void {
    if (this.handlersRegistered) {
      return;
    }

    ipcMain.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.stateResponse,
      (_event, payload: PluginEditorStateResponsePayload): void => {
        const pending = this.pendingStateRequests.get(payload.requestId);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        this.pendingStateRequests.delete(payload.requestId);

        if (!payload.ok) {
          pending.reject(new Error(payload.error ?? 'Renderer failed to provide editor state.'));
          return;
        }

        pending.resolve({
          documentUri: payload.documentUri,
          content: payload.content,
          selection: payload.selection,
        });
      },
    );

    ipcMain.on(
      PLUGIN_EDITOR_BRIDGE_CHANNELS.applyTextEditsResponse,
      (_event, payload: PluginEditorApplyTextEditsResponsePayload): void => {
        const pending = this.pendingWriteRequests.get(payload.requestId);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        this.pendingWriteRequests.delete(payload.requestId);

        if (!payload.ok) {
          pending.reject(new Error(payload.error ?? 'Renderer failed to apply text edits.'));
          return;
        }

        pending.resolve();
      },
    );

    this.handlersRegistered = true;
  }
}

export const pluginEditorBridge = PluginEditorBridge.getInstance();
