/**
 * 扩展运行时环境
 */

import { Extension, ExtensionContext } from '@note-studio/extension-api/src/types/extension';
import { ContextManager } from './ContextManager';

export class ExtensionRuntime {
  private contextManager: ContextManager;
  private activeExtensions: Map<string, any> = new Map();

  constructor() {
    this.contextManager = new ContextManager();
  }

  async activate(extension: Extension): Promise<void> {
    console.log(`[ExtensionRuntime] 激活扩展: ${extension.id}`);
    
    const context = this.contextManager.createContext(extension);
    
    if (!extension.main) {
      return;
    }

    try {
      const extensionModule = require(extension.main);
      if (typeof extensionModule.activate === 'function') {
        const exports = await extensionModule.activate(context);
        this.activeExtensions.set(extension.id, exports);
      }
    } catch (error) {
      console.error(`[ExtensionRuntime] 激活失败: ${extension.id}`, error);
      throw error;
    }
  }

  async deactivate(extensionId: string): Promise<void> {
    console.log(`[ExtensionRuntime] 停用扩展: ${extensionId}`);
    
    const exports = this.activeExtensions.get(extensionId);
    if (exports && typeof exports.deactivate === 'function') {
      await exports.deactivate();
    }
    
    this.activeExtensions.delete(extensionId);
    this.contextManager.disposeContext(extensionId);
  }
}



