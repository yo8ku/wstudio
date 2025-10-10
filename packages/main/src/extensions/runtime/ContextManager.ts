/**
 * 扩展上下文管理器
 */

import { Extension, ExtensionContext } from '@note-studio/extension-api/src/types/extension';
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
      context.subscriptions.forEach(d => d.dispose());
      this.contexts.delete(extensionId);
    }
  }

  private createMemento(): any {
    const storage = new Map<string, any>();
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return storage.get(key) ?? defaultValue;
      },
      update(key: string, value: any): Promise<void> {
        storage.set(key, value);
        return Promise.resolve();
      }
    };
  }
}



