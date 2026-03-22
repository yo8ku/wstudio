/**
 * Main/renderer bridge for plugin blockEditor capabilities.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  BlockEditorCommandDescriptor,
  BlockEditorCommandExecution,
  BlockEditorCommandId,
  BlockEditorContext,
  BlockEditorSnapshot,
  BlockEditorWritebackOperation,
  PluginBlockEditorBridgeAction,
  PluginBlockEditorBridgeRequestPayload,
  PluginBlockEditorBridgeResponsePayload,
} from '@note-studio/shared';
import { PLUGIN_BLOCK_EDITOR_BRIDGE_CHANNELS } from '@note-studio/shared';

interface PendingPluginBlockEditorRequest {
  readonly resolve: (value: PluginBlockEditorBridgeResponsePayload) => void;
  readonly reject: (error: Error) => void;
  readonly timeoutId: NodeJS.Timeout;
}

export interface PluginBlockEditorBridge {
  setMainWindow(mainWindow: BrowserWindow | null): void;
  getSnapshot(): Promise<BlockEditorSnapshot | null>;
  getContext(): Promise<BlockEditorContext | null>;
  getCommands(): Promise<readonly BlockEditorCommandDescriptor[]>;
  executeCommand(
    commandId: BlockEditorCommandId,
    execution: BlockEditorCommandExecution,
  ): Promise<boolean>;
  writeback(operation: BlockEditorWritebackOperation): Promise<boolean>;
}

const REQUEST_TIMEOUT_MS = 3000;

type PluginBlockEditorBridgeRequestInit =
  | {
      readonly action: 'get-snapshot';
    }
  | {
      readonly action: 'get-context';
    }
  | {
      readonly action: 'get-commands';
    }
  | {
      readonly action: 'execute-command';
      readonly commandId: BlockEditorCommandId;
      readonly execution: BlockEditorCommandExecution;
    }
  | {
      readonly action: 'writeback';
      readonly operation: BlockEditorWritebackOperation;
    };

class PluginBlockEditorBridgeImpl implements PluginBlockEditorBridge {
  private readonly pendingRequests = new Map<string, PendingPluginBlockEditorRequest>();
  private requestCounter = 0;
  private mainWindow: BrowserWindow | null = null;
  private handlersRegistered = false;

  public setMainWindow(mainWindow: BrowserWindow | null): void {
    this.mainWindow = mainWindow;
    this.ensureHandlersRegistered();
  }

  public async getSnapshot(): Promise<BlockEditorSnapshot | null> {
    const response = await this.request({
      action: 'get-snapshot',
    });

    return response.snapshot;
  }

  public async getContext(): Promise<BlockEditorContext | null> {
    const response = await this.request({
      action: 'get-context',
    });

    return response.context;
  }

  public async getCommands(): Promise<readonly BlockEditorCommandDescriptor[]> {
    const response = await this.request({
      action: 'get-commands',
    });

    return response.commands ?? [];
  }

  public async executeCommand(
    commandId: BlockEditorCommandId,
    execution: BlockEditorCommandExecution,
  ): Promise<boolean> {
    const response = await this.request({
      action: 'execute-command',
      commandId,
      execution,
    });

    return response.result ?? false;
  }

  public async writeback(operation: BlockEditorWritebackOperation): Promise<boolean> {
    const response = await this.request({
      action: 'writeback',
      operation,
    });

    return response.result ?? false;
  }

  private async request(
    payload: PluginBlockEditorBridgeRequestInit,
  ): Promise<PluginBlockEditorBridgeResponsePayload> {
    const windowRef = this.getAvailableWindow();
    const requestId = this.nextRequestId(payload.action);
    const requestPayload: PluginBlockEditorBridgeRequestPayload = {
      requestId,
      ...payload,
    };

    return new Promise<PluginBlockEditorBridgeResponsePayload>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Timed out while waiting for renderer blockEditor bridge response.'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
      });

      windowRef.webContents.send(PLUGIN_BLOCK_EDITOR_BRIDGE_CHANNELS.request, requestPayload);
    });
  }

  private getAvailableWindow(): BrowserWindow {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('Main editor window is unavailable.');
    }

    return this.mainWindow;
  }

  private nextRequestId(action: PluginBlockEditorBridgeAction): string {
    const requestId = `plugin-block-editor:${action}:${this.requestCounter}`;
    this.requestCounter += 1;
    return requestId;
  }

  private ensureHandlersRegistered(): void {
    if (this.handlersRegistered) {
      return;
    }

    ipcMain.on(
      PLUGIN_BLOCK_EDITOR_BRIDGE_CHANNELS.response,
      (_event, payload: PluginBlockEditorBridgeResponsePayload): void => {
        const pending = this.pendingRequests.get(payload.requestId);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(payload.requestId);

        if (!payload.ok) {
          pending.reject(new Error(payload.error ?? 'Renderer blockEditor bridge request failed.'));
          return;
        }

        pending.resolve(payload);
      },
    );

    this.handlersRegistered = true;
  }
}

export const pluginBlockEditorBridge: PluginBlockEditorBridge =
  new PluginBlockEditorBridgeImpl();
