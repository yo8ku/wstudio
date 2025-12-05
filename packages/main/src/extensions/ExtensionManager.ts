/**
 * 扩展管理器 - 负责插件扩展的生命周期管理
 * 功能：自动监听扩展目录变化，动态加载新安装的扩展和主题
 */

import { PluginAPIAdapter } from './PluginAPIAdapter';
import type { SettingsManager } from '../config/SettingsManager';
import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

export interface Extension {
  id: string;
  name: string;
  version?: string;
  description?: string;
  main?: string;
  extensionPath?: string;
  publisher?: string;
  activationEvents?: string[];
}

export interface ExtensionChangeEvent {
  type: 'added' | 'removed' | 'changed';
  extension: Extension;
}

export class ExtensionManager extends EventEmitter {
  private extensions: Map<string, Extension> = new Map();
  private watcher: fs.FSWatcher | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;
  private apiAdapter: PluginAPIAdapter | null = null;
  private loadedExtensions: Map<string, any> = new Map();

  constructor(private extensionsPath: string) {
    super();
  }

  /**
   * 设置主窗口（用于创建API适配器）
   * @deprecated 使用 setSharedAPIAdapter() 代替，避免创建多个 PluginAPIAdapter 实例
   */
  setMainWindow(mainWindow: BrowserWindow, settingsManager?: SettingsManager): void {
    this.apiAdapter = new PluginAPIAdapter(mainWindow);
    if (settingsManager) {
      this.apiAdapter.setSettingsManager(settingsManager);
    }
    console.log('[ExtensionManager] API适配器已设置');
  }

  /**
   * 设置共享的 API 适配器（推荐使用，避免重复注册 IPC handlers）
   */
  setSharedAPIAdapter(apiAdapter: PluginAPIAdapter): void {
    this.apiAdapter = apiAdapter;
    console.log('[ExtensionManager] 共享 API 适配器已设置');
  }

  async initialize(): Promise<void> {
    console.log('[ExtensionManager] 初始化扩展管理器');
    console.log(`[ExtensionManager] 扩展目录路径: ${this.extensionsPath}`);
    
    // 检查扩展目录是否存在，如果不存在则记录警告但不创建（因为可能是路径配置错误）
    if (!fs.existsSync(this.extensionsPath)) {
      console.warn(`[ExtensionManager] 扩展目录不存在: ${this.extensionsPath}`);
      console.warn('[ExtensionManager] 将跳过扩展扫描，请检查路径配置是否正确');
      // 不创建目录，因为可能是路径配置错误，创建错误的目录会导致问题
      return;
    }
    
    // 扫描扩展
    await this.scanExtensions();

    // 启动文件监听
    this.startWatching();
  }

  /**
   * 扫描扩展目录
   */
  private async scanExtensions(): Promise<void> {
    try {
      // 检查目录是否存在
      if (!fs.existsSync(this.extensionsPath)) {
        console.warn(`[ExtensionManager] 扩展目录不存在: ${this.extensionsPath}`);
        console.log('[ExtensionManager] 将跳过扩展扫描');
        return;
      }
      
      const entries = fs.readdirSync(this.extensionsPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const extensionPath = path.join(this.extensionsPath, entry.name);
        const packageJsonPath = path.join(extensionPath, 'package.json');
        
        if (fs.existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            
            const extension: Extension = {
              id: packageJson.name || entry.name,
              name: packageJson.displayName || packageJson.name || entry.name,
              version: packageJson.version,
              description: packageJson.description,
              main: packageJson.main,
              extensionPath,
              publisher: packageJson.publisher,
              activationEvents: packageJson.activationEvents
            };
            
            this.extensions.set(extension.id, extension);
            console.log(`[ExtensionManager] 发现扩展: ${extension.name}`);
          } catch (error) {
            console.error(`[ExtensionManager] 解析扩展失败: ${entry.name}`, error);
          }
        }
      }
      
      console.log(`[ExtensionManager] 扫描完成，共发现 ${this.extensions.size} 个扩展`);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.warn(`[ExtensionManager] 扩展目录不存在: ${this.extensionsPath}`);
        console.log('[ExtensionManager] 将跳过扩展扫描');
        return;
      }
      console.error('[ExtensionManager] 扫描扩展目录失败:', error);
    }
  }

  /**
   * 启动扩展目录监听
   */
  private startWatching(): void {
    if (this.watcher) {
      return; // 已经在监听中
    }

    // 检查目录是否存在
    if (!fs.existsSync(this.extensionsPath)) {
      console.warn(`[ExtensionManager] 扩展目录不存在，跳过文件监听: ${this.extensionsPath}`);
      return;
    }

    try {
      console.log(`[ExtensionManager] 开始监听扩展目录: ${this.extensionsPath}`);
      
      this.watcher = fs.watch(
        this.extensionsPath,
        { recursive: true },
        (eventType, filename) => {
          if (filename) {
            this.handleFileChange(eventType, filename);
          }
        }
      );

      this.watcher.on('error', (error) => {
        console.error('[ExtensionManager] 文件监听错误:', error);
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.warn(`[ExtensionManager] 扩展目录不存在，无法启动文件监听: ${this.extensionsPath}`);
        return;
      }
      console.error('[ExtensionManager] 启动文件监听失败:', error);
    }
  }

  /**
   * 停止扩展目录监听
   */
  public stopWatching(): void {
    if (this.watcher) {
      console.log('[ExtensionManager] 停止监听扩展目录');
      this.watcher.close();
      this.watcher = null;
    }

    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
      this.watchDebounceTimer = null;
    }
  }

  /**
   * 处理文件变化（带防抖）
   */
  private handleFileChange(eventType: string, filename: string): void {
    // 只关注 package.json 的变化（扩展添加/移除的标志）
    if (!filename.endsWith('package.json')) {
      return;
    }

    // 防抖：避免短时间内多次触发
    if (this.watchDebounceTimer) {
      clearTimeout(this.watchDebounceTimer);
    }

    this.watchDebounceTimer = setTimeout(() => {
      this.rescanExtensions(filename);
    }, 1000); // 1秒防抖
  }

  /**
   * 重新扫描扩展目录
   */
  private async rescanExtensions(changedFile: string): Promise<void> {
    console.log(`[ExtensionManager] 检测到变化: ${changedFile}，重新扫描扩展目录...`);
    
    try {
      const oldExtensions = new Map(this.extensions);
      this.extensions.clear();
      await this.scanExtensions();

      // 检测新增的扩展
      for (const [id, ext] of this.extensions) {
        if (!oldExtensions.has(id)) {
          console.log(`[ExtensionManager] 检测到新扩展: ${ext.name}`);
          this.emit('extension-added', { type: 'added', extension: ext });
        }
      }

      // 检测删除的扩展
      for (const [id, ext] of oldExtensions) {
        if (!this.extensions.has(id)) {
          console.log(`[ExtensionManager] 检测到扩展已删除: ${ext.name}`);
          this.emit('extension-removed', { type: 'removed', extension: ext });
        }
      }

      console.log(`[ExtensionManager] 扩展重新扫描完成，当前共 ${this.extensions.size} 个扩展`);
    } catch (error) {
      console.error('[ExtensionManager] 重新扫描扩展失败:', error);
    }
  }

  /**
   * 加载扩展
   */
  async loadExtension(extensionId: string): Promise<void> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension ${extensionId} not found`);
    }
    
    if (!ext.main) {
      console.log(`[ExtensionManager] 扩展 ${ext.id} 没有 main 入口`);
      return;
    }

    try {
      const mainPath = path.join(ext.extensionPath || '', ext.main);
      
      // 如果是 TypeScript 文件，使用 ts-node 加载
      let extensionModule;
      if (mainPath.endsWith('.ts')) {
        try {
          // 使用 ts-node 加载 TypeScript 文件
          const tsNode = require('ts-node');
          // 注册 ts-node（如果还没有注册）
          try {
            tsNode.register({
              transpileOnly: true,
              compilerOptions: {
                module: 'commonjs',
                esModuleInterop: true,
                allowSyntheticDefaultImports: true,
                resolveJsonModule: true,
                skipLibCheck: true,
                target: 'ES2020',
                lib: ['ES2020']
              }
            });
          } catch (registerError) {
            // 如果已经注册，忽略错误
            if (!(registerError as Error).message.includes('already registered')) {
              throw registerError;
            }
          }
          // 清除 require 缓存，确保重新加载
          const resolvedPath = require.resolve(mainPath);
          if (require.cache[resolvedPath]) {
            delete require.cache[resolvedPath];
          }
          extensionModule = require(mainPath);
        } catch (tsError) {
          console.error(`[ExtensionManager] 使用 ts-node 加载 TypeScript 文件失败:`, tsError);
          console.error(`[ExtensionManager] 错误详情:`, (tsError as Error).message);
          console.error(`[ExtensionManager] 堆栈:`, (tsError as Error).stack);
          throw new Error(`无法加载 TypeScript 插件文件: ${(tsError as Error).message}`);
        }
      } else {
        extensionModule = require(mainPath);
      }
      
      if (typeof extensionModule.activate === 'function') {
        // 创建插件上下文
        const pluginContext: any = {
          metadata: {
            id: ext.id,
            name: ext.name,
            version: ext.version || '1.0.0',
            description: ext.description || '',
            author: ext.publisher || ext.name,
            category: 'tools'
          },
          rootPath: ext.extensionPath || '',
          storagePath: path.join(ext.extensionPath || '', '.storage'),
          subscriptions: [],
          globalState: this.createMemento(),
          workspaceState: this.createMemento()
        };
        
        if (this.apiAdapter) {
          const api = this.apiAdapter.createAPI(pluginContext);
          console.log(`[ExtensionManager] 激活扩展: ${ext.name}`);
          const exports = await extensionModule.activate(pluginContext, api);
          this.loadedExtensions.set(ext.id, { exports, context: pluginContext });
          console.log(`[ExtensionManager] 扩展激活成功: ${ext.name}`);
        } else {
          console.warn(`[ExtensionManager] API 适配器未设置，无法激活扩展: ${ext.name}`);
        }
      }
    } catch (error) {
      console.error(`[ExtensionManager] 加载扩展失败: ${ext.name}`, error);
      throw error;
    }
  }

  /**
   * 创建 Memento 对象
   */
  private createMemento(): any {
    const storage = new Map();
    return {
      get: (key: string, defaultValue?: any) => storage.get(key) ?? defaultValue,
      update: (key: string, value: any) => storage.set(key, value),
      keys: () => Array.from(storage.keys())
    };
  }

  async activateExtension(extensionId: string): Promise<void> {
    console.log(`[ExtensionManager] 激活扩展: ${extensionId}`);
    await this.loadExtension(extensionId);
  }

  /**
   * 卸载扩展
   */
  async uninstallExtension(extensionId: string): Promise<void> {
    console.log(`[ExtensionManager] 卸载扩展: ${extensionId}`);
    
    // 从内存中移除
    this.extensions.delete(extensionId);
    this.loadedExtensions.delete(extensionId);
    
    // TODO: 实现扩展卸载逻辑
    console.warn('[ExtensionManager] 扩展卸载功能待实现');
  }

  getExtension(extensionId: string): Extension | undefined {
    return this.extensions.get(extensionId);
  }

  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  getLoadedExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }
}
