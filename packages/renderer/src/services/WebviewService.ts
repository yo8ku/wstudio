/**
 * Runtime plugin webview message bridge service.
 * Buffers host-to-renderer messages until the target panel iframe subscribes.
 */

import type { JsonValue } from '@note-studio/shared';
import { workbenchContributionService } from './WorkbenchContributionService';

type WebviewMessageListener = (message: JsonValue) => void;

export class WebviewService {
  private readonly listeners = new Map<string, Set<WebviewMessageListener>>();
  private readonly pendingMessages = new Map<string, JsonValue[]>();
  private initialized = false;

  public subscribe(panelInstanceKey: string, listener: WebviewMessageListener): () => void {
    this.ensureInitialized();

    const panelListeners = this.listeners.get(panelInstanceKey) ?? new Set<WebviewMessageListener>();
    panelListeners.add(listener);
    this.listeners.set(panelInstanceKey, panelListeners);

    const pendingMessages = this.pendingMessages.get(panelInstanceKey);
    if (pendingMessages && pendingMessages.length > 0) {
      this.pendingMessages.delete(panelInstanceKey);
      for (const message of pendingMessages) {
        listener(message);
      }
    }

    return (): void => {
      const currentListeners = this.listeners.get(panelInstanceKey);
      if (!currentListeners) {
        return;
      }

      currentListeners.delete(listener);
      if (currentListeners.size === 0) {
        this.listeners.delete(panelInstanceKey);
      }
    };
  }

  public async postMessage(panelInstanceKey: string, message: JsonValue): Promise<void> {
    await workbenchContributionService.postWebviewMessage({
      panelInstanceKey,
      message,
    });
  }

  public resetPanel(panelInstanceKey: string): void {
    this.pendingMessages.delete(panelInstanceKey);
    this.listeners.delete(panelInstanceKey);
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    workbenchContributionService.onWebviewMessage((payload) => {
      const panelListeners = this.listeners.get(payload.panelInstanceKey);
      if (!panelListeners || panelListeners.size === 0) {
        const pending = this.pendingMessages.get(payload.panelInstanceKey) ?? [];
        pending.push(payload.message);
        this.pendingMessages.set(payload.panelInstanceKey, pending);
        return;
      }

      for (const listener of panelListeners) {
        listener(payload.message);
      }
    });

    this.initialized = true;
  }
}

export const webviewService = new WebviewService();
