/**
 * 扩展加载器 - 负责加载扩展代码
 */

import { Extension, ExtensionContext } from '@note-studio/extension-api/src/types/extension';
import * as path from 'path';

export class ExtensionLoader {
  private activeExtensions: Map<string, any> = new Map();

  async load(extension: Extension): Promise<void> {
    console.log(`[ExtensionLoader] 加载扩展: ${extension.id}`);
    
    if (!extension.main) {
      console.log(`[ExtensionLoader] 扩展 ${extension.id} 没有 main 入口`);
      return;
    }

    try {
      const mainPath = path.join(extension.extensionPath || '', extension.main);
      const extensionModule = require(mainPath);
      
      if (typeof extensionModule.activate === 'function') {
        // 创建扩展上下文
        const context: ExtensionContext = {
          subscriptions: [],
          workspaceState: this.createMemento(),
          globalState: this.createMemento(),
          extensionPath: extension.extensionPath || ''
        };
        
        console.log(`[ExtensionLoader] 激活扩展: ${extension.name}`);
        const exports = await extensionModule.activate(context);
        this.activeExtensions.set(extension.id, { exports, context });
        
        console.log(`[ExtensionLoader] 扩展激活成功: ${extension.name}`);
      }
    } catch (error) {
      console.error(`[ExtensionLoader] 加载扩展失败: ${extension.id}`, error);
      throw error;
    }
  }

  async unload(extension: Extension): Promise<void> {
    console.log(`[ExtensionLoader] 卸载扩展: ${extension.id}`);
    
    const ext = this.activeExtensions.get(extension.id);
    if (ext) {
      // 清理订阅
      ext.context.subscriptions.forEach((d: any) => d.dispose());
      
      // 调用 deactivate
      if (ext.exports && typeof ext.exports.deactivate === 'function') {
        await ext.exports.deactivate();
      }
      
      this.activeExtensions.delete(extension.id);
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



