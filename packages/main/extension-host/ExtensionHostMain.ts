/**
 * 扩展宿主进程主类
 * ⭐ 独立进程运行 VSCode 扩展（隔离安全）
 */

import { MessageHandler } from './MessageHandler';
import { APIImplementation } from './APIImplementation';
import * as vscode from '@note-studio/extension-api';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 扩展清单接口
 */
interface ExtensionManifest {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: any;
  engines?: {
    vscode?: string;
  };
}

/**
 * 扩展上下文接口
 */
interface ExtensionContext {
  subscriptions: { dispose(): void }[];
  workspaceState: any;
  globalState: any;
  extensionPath: string;
  extensionUri?: any;
  globalStorageUri?: any;
  logUri?: any;
  storageUri?: any;
}

export class ExtensionHostMain {
  private messageHandler: MessageHandler;
  private api: APIImplementation;
  private extensionContexts: Map<string, ExtensionContext> = new Map();
  private activeExtensions: Map<string, any> = new Map();

  constructor() {
    this.api = new APIImplementation();
    this.messageHandler = new MessageHandler(this.api);
    
    // 设置扩展宿主引用（解决循环依赖）
    this.messageHandler.setExtensionHost(this);
  }

  async initialize(): Promise<void> {
    console.log('[ExtensionHostMain] 初始化扩展宿主进程');
    
    // 注入全局 VSCode API
    this.injectGlobalAPI();
  }

  /**
   * 激活 VSCode 扩展
   */
  async activateExtension(extensionPath: string): Promise<void> {
    console.log(`[ExtensionHostMain] 激活扩展: ${extensionPath}`);

    try {
      // 1. 加载扩展的 package.json
      const manifestPath = path.join(extensionPath, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`找不到扩展清单: ${manifestPath}`);
      }

      const manifest: ExtensionManifest = JSON.parse(
        fs.readFileSync(manifestPath, 'utf-8')
      );

      // 2. 创建扩展上下文
      const context = this.createExtensionContext(manifest, extensionPath);
      this.extensionContexts.set(manifest.name, context);

      // 3. 加载并执行扩展的 activate 函数
      if (manifest.main) {
        const extensionMainPath = path.join(extensionPath, manifest.main);
        
        if (!fs.existsSync(extensionMainPath)) {
          throw new Error(`找不到扩展入口文件: ${extensionMainPath}`);
        }

        const extension = require(extensionMainPath);
        
        if (typeof extension.activate === 'function') {
          console.log(`[ExtensionHostMain] 执行 activate: ${manifest.name}`);
          const exports = await extension.activate(context);
          this.activeExtensions.set(manifest.name, exports);
          
          console.log(`[ExtensionHostMain] 扩展激活成功: ${manifest.name}`);
        } else {
          console.warn(`[ExtensionHostMain] 扩展没有 activate 函数: ${manifest.name}`);
        }
      }
    } catch (error) {
      console.error(`[ExtensionHostMain] 激活扩展失败:`, error);
      throw error;
    }
  }

  /**
   * 停用扩展
   */
  async deactivateExtension(extensionName: string): Promise<void> {
    console.log(`[ExtensionHostMain] 停用扩展: ${extensionName}`);

    try {
      // 1. 调用扩展的 deactivate 函数
      const exports = this.activeExtensions.get(extensionName);
      if (exports && typeof exports.deactivate === 'function') {
        await exports.deactivate();
      }

      // 2. 清理订阅
      const context = this.extensionContexts.get(extensionName);
      if (context) {
        context.subscriptions.forEach((disposable) => {
          try {
            disposable.dispose();
          } catch (error) {
            console.error(`[ExtensionHostMain] 清理订阅失败:`, error);
          }
        });
      }

      // 3. 清理缓存
      this.activeExtensions.delete(extensionName);
      this.extensionContexts.delete(extensionName);

      console.log(`[ExtensionHostMain] 扩展停用成功: ${extensionName}`);
    } catch (error) {
      console.error(`[ExtensionHostMain] 停用扩展失败:`, error);
      throw error;
    }
  }

  /**
   * 创建扩展上下文
   */
  private createExtensionContext(
    manifest: ExtensionManifest,
    extensionPath: string
  ): ExtensionContext {
    const context: ExtensionContext = {
      subscriptions: [],
      workspaceState: this.createMemento(),
      globalState: this.createMemento(),
      extensionPath,
    };

    return context;
  }

  /**
   * 创建 Memento 存储
   */
  private createMemento(): any {
    const storage = new Map<string, any>();
    return {
      get<T>(key: string, defaultValue?: T): T | undefined {
        return storage.get(key) ?? defaultValue;
      },
      update(key: string, value: any): Promise<void> {
        storage.set(key, value);
        return Promise.resolve();
      },
      keys(): readonly string[] {
        return Array.from(storage.keys());
      },
    };
  }

  /**
   * 注入全局 VSCode API
   */
  private injectGlobalAPI(): void {
    // 将 VSCode API 注入到全局对象
    (global as any).vscode = vscode.vscode;
    console.log('[ExtensionHostMain] VSCode API 已注入到全局对象');
  }

  /**
   * 获取已激活的扩展
   */
  getActiveExtensions(): string[] {
    return Array.from(this.activeExtensions.keys());
  }

  /**
   * 处理消息
   */
  handleMessage(message: any): void {
    this.messageHandler.handle(message);
  }

  /**
   * 发送消息
   */
  sendMessage(message: any): void {
    if (process.send) {
      process.send(message);
    }
  }
}



