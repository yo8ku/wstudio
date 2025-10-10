/**
 * 扩展管理器 - 负责扩展的生命周期管理
 * 功能：自动监听扩展目录变化，动态加载新安装的扩展和主题
 */

import { Extension } from '@note-studio/extension-api/src/types/extension';
import { ExtensionLoader } from './ExtensionLoader';
import { ExtensionScanner } from './ExtensionScanner';
import { VSIXInstaller, InstallResult } from './vscode-adapter/VSIXInstaller';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtensionChangeEvent {
  type: 'added' | 'removed' | 'changed';
  extension: Extension;
}

export class ExtensionManager extends EventEmitter {
  private extensions: Map<string, Extension> = new Map();
  private loader: ExtensionLoader;
  private scanner: ExtensionScanner;
  private vsixInstaller: VSIXInstaller;
  private watcher: fs.FSWatcher | null = null;
  private watchDebounceTimer: NodeJS.Timeout | null = null;

  constructor(private extensionsPath: string) {
    super();
    this.loader = new ExtensionLoader();
    this.scanner = new ExtensionScanner(extensionsPath);
    this.vsixInstaller = new VSIXInstaller(extensionsPath);
  }

  async initialize(): Promise<void> {
    console.log('[ExtensionManager] 初始化扩展管理器');
    const extensions = await this.scanner.scanExtensions();
    
    for (const ext of extensions) {
      this.extensions.set(ext.id, ext);
    }

    // 启动文件监听
    this.startWatching();
  }

  /**
   * 启动扩展目录监听
   */
  private startWatching(): void {
    if (this.watcher) {
      return; // 已经在监听中
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
      const newExtensions = await this.scanner.scanExtensions();
      
      // 更新扩展列表
      this.extensions.clear();
      for (const ext of newExtensions) {
        this.extensions.set(ext.id, ext);
      }

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

  async loadExtension(extensionId: string): Promise<void> {
    const ext = this.extensions.get(extensionId);
    if (!ext) {
      throw new Error(`Extension ${extensionId} not found`);
    }
    
    await this.loader.load(ext);
  }

  async activateExtension(extensionId: string): Promise<void> {
    console.log(`[ExtensionManager] 激活扩展: ${extensionId}`);
  }

  /**
   * 安装本地 VSIX 文件
   */
  async installVSIX(vsixPath: string): Promise<InstallResult> {
    console.log(`[ExtensionManager] 安装 VSIX: ${vsixPath}`);
    
    const result = await this.vsixInstaller.installVSIX(vsixPath);
    
    if (result.success) {
      // 重新扫描扩展目录
      await this.initialize();
      
      // 自动加载新安装的扩展
      try {
        await this.loadExtension(result.extensionId);
      } catch (error) {
        console.error(`[ExtensionManager] 加载新扩展失败:`, error);
      }
    }
    
    return result;
  }

  /**
   * 从 VSCode Marketplace 安装扩展
   */
  async installFromMarketplace(extensionId: string, version?: string): Promise<InstallResult> {
    console.log(`[ExtensionManager] 从 Marketplace 安装: ${extensionId}`);
    
    const result = await this.vsixInstaller.installFromMarketplace(extensionId, version);
    
    if (result.success) {
      // 重新扫描扩展目录
      await this.initialize();
      
      // 自动加载新安装的扩展
      try {
        await this.loadExtension(result.extensionId);
      } catch (error) {
        console.error(`[ExtensionManager] 加载新扩展失败:`, error);
      }
    }
    
    return result;
  }

  /**
   * 卸载扩展
   */
  async uninstallExtension(extensionId: string): Promise<void> {
    console.log(`[ExtensionManager] 卸载扩展: ${extensionId}`);
    
    // 从内存中移除
    this.extensions.delete(extensionId);
    
    // 从磁盘删除
    await this.vsixInstaller.uninstall(extensionId);
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
