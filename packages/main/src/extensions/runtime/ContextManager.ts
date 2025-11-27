/**
 * 扩展上下文管理器
 */

import { Extension, ExtensionContext, Memento } from '../types/extension';
import * as path from 'path';

export class ContextManager {
  private contexts: Map<string, ExtensionContext> = new Map();

  createContext(extension: Extension): ExtensionContext {
    const context: ExtensionContext = {
      subscriptions: [],
      workspaceState: this.createMemento(),
      globalState: this.createMemento(),
      extensionPath: extension.extensionPath || ''
    };

    this.contexts.set(extension.id, context);
    return context;
  }

  getContext(extensionId: string): ExtensionContext | undefined {
    return this.contexts.get(extensionId);
  }

  disposeContext(extensionId: string): void {
    const context = this.contexts.get(extensionId);
    if (context) {
      context.subscriptions.forEach((d: { dispose(): void }) => d.dispose());
      this.contexts.delete(extensionId);
    }
  }

  private createMemento(): Memento {
    const storage = new Map<string, unknown>();
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return (storage.get(key) as T | undefined) ?? defaultValue;
      },
      update(key: string, value: unknown): Promise<void> {
        storage.set(key, value);
        return Promise.resolve();
      }
    };
  }
}



