/**
 * Plugin API 适配器
 * 为内置扩展提供 PluginAPI 实现
 */

import type { PluginContext } from '../../../plugin-system/src/types/plugin';
import type { PluginAPI } from '../../../plugin-system/src/api/PluginAPI';
import type { SettingsManager } from '../config/SettingsManager';
import type { WorkspaceManager } from '../workspace/WorkspaceManager';
import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ImageCacheManager } from '../services/ImageCacheManager';

interface CachedEvent {
  event: string;
  args: any[];
}

export class PluginAPIAdapter {
  private commandHandlers: Map<string, Function> = new Map();
  private statusBarItems: Map<string, any> = new Map();
  private eventListeners: Map<string, Set<Function>> = new Map();
  private pluginStorage: Map<string, any> = new Map();
  private rendererReady: boolean = false;
  private settingsManager: SettingsManager | null = null;
  private workspaceManager: WorkspaceManager | null = null;
  private static ipcHandlersRegistered: boolean = false;
  private static currentInstance: PluginAPIAdapter | null = null;
  private cachedEvents: CachedEvent[] = []; // 缓存窗口创建前的事件

  constructor(private mainWindow: BrowserWindow | null) {
    PluginAPIAdapter.currentInstance = this;
    this.ensureMainWindowReference();
    this.setupWindowAutoDetection();
    this.setupIPCHandlers();
    // 验证处理器是否已注册
    this.verifyIPCHandlers();
    if (mainWindow) {
      this.setupRendererReadyListener();
    }
  }

  /**
   * 获取当前实例（用于静态 IPC 处理器）
   */
  private static getCurrentInstance(): PluginAPIAdapter | null {
    return PluginAPIAdapter.currentInstance;
  }

  /**
   * 设置 SettingsManager 实例
   */
  setSettingsManager(settingsManager: SettingsManager): void {
    this.settingsManager = settingsManager;
  }

  /**
   * 设置 WorkspaceManager 实例
   */
  setWorkspaceManager(workspaceManager: WorkspaceManager): void {
    this.workspaceManager = workspaceManager;
  }

  /**
   * 更新主窗口引用（当窗口创建后调用）
   */
  setMainWindow(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    
    // 确保 IPC 处理器已注册（总是重新注册以确保处理器存在）
    // 注意：setupIPCHandlers 中已经有 removeHandler 调用，所以重复注册是安全的
    this.setupIPCHandlers();
    
    this.setupRendererReadyListener();
    if (this.rendererReady) {
      this.resendAllStatusBarItems();
      this.flushCachedEvents();
    }

  }

  /**
   * 自动检测窗口创建，确保 mainWindow 引用
   */
  private setupWindowAutoDetection(): void {
    app.on('browser-window-created', (_event, window) => {
      if (!this.mainWindow || this.mainWindow.isDestroyed()) {
        this.setMainWindow(window);
      }
    });
  }

  /**
   * 在构造阶段尝试绑定已有窗口
   */
  private ensureMainWindowReference(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return;
    }
    const existingWindow = BrowserWindow.getAllWindows().find(win => !win.isDestroyed());
    if (existingWindow) {
      this.mainWindow = existingWindow;
    }
  }

  /**
   * 获取可用的主窗口（若为空则尝试自动获取）
   */
  private ensureActiveWindow(): BrowserWindow | null {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }
    const fallbackWindow = BrowserWindow.getAllWindows().find(win => !win.isDestroyed());
    if (fallbackWindow) {
      this.mainWindow = fallbackWindow;
      return fallbackWindow;
    }
    return null;
  }

  /**
   * 监听渲染进程准备就绪事件
   */
  private setupRendererReadyListener(): void {
    if (!this.mainWindow) {
      console.warn('[PluginAPIAdapter] 无法设置渲染进程就绪监听器，mainWindow 为 null');
      return;
    }
    // 移除旧的监听器（如果存在）
    ipcMain.removeAllListeners('renderer:loaded');
    ipcMain.on('renderer:loaded', async () => {
      console.log('[PluginAPIAdapter] ========== 收到渲染进程已加载通知 ==========');
      console.log('[PluginAPIAdapter] 当前状态栏项数量:', this.statusBarItems.size);
      console.log('[PluginAPIAdapter] 当前缓存事件数量:', this.cachedEvents.length);
      this.rendererReady = true;
      
      // 重新发送所有状态栏项
      if (this.mainWindow) {
        this.resendAllStatusBarItems();
        // 发送所有缓存的事件（此时渲染进程已完全加载）
        this.flushCachedEvents();
      } else {
        console.warn('[PluginAPIAdapter] 收到 renderer:loaded 事件，但 mainWindow 为 null');
      }

    });
  }

  /**
   * 安全地发送消息到渲染进程
   * @returns 是否成功发送
   */
  private safeSendToRenderer(channel: string, ...args: any[]): boolean {
    const targetWindow = this.ensureActiveWindow();
    if (targetWindow && targetWindow.webContents && !targetWindow.isDestroyed()) {
      try {
        targetWindow.webContents.send(channel, ...args);
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  }

  /**
   * 重新发送所有状态栏项到渲染进程
   */
  private resendAllStatusBarItems(): void {
    const targetWindow = this.ensureActiveWindow();
    if (!targetWindow || !targetWindow.webContents || targetWindow.isDestroyed()) {
      return;
    }
    for (const item of this.statusBarItems.values()) {
      if (this.safeSendToRenderer('plugin:status-bar-item', {
        action: 'add',
        item
      })) {}
    }
  }

  /**
   * 发送所有缓存的事件到渲染进程
   */
  private flushCachedEvents(): void {
    const targetWindow = this.ensureActiveWindow();
    if (!targetWindow || !targetWindow.webContents || targetWindow.isDestroyed()) {
      return;
    }
    
    if (this.cachedEvents.length === 0) {
      return;
    }
    
    const eventsToSend = [...this.cachedEvents]; // 复制数组，避免在循环中修改
    let successCount = 0;
    let failCount = 0;
    
    for (const cachedEvent of eventsToSend) {
      if (this.safeSendToRenderer(cachedEvent.event, ...cachedEvent.args)) {
        successCount++;
      } else {
        console.warn(`[PluginAPIAdapter] ❌ 发送缓存事件失败: ${cachedEvent.event}`);
        failCount++;
      }
    }
    
    // 清空缓存（即使有些发送失败，也清空，避免重复发送）
    this.cachedEvents = [];
  }

  /**
   * 设置IPC处理器
   */
  private setupIPCHandlers(): void {
    // 移除已有的处理器（防止重复注册）
    try {
      ipcMain.removeHandler('plugin:execute-command');
    } catch (e) {}
    
    try {
      ipcMain.removeHandler('plugin:get-status-bar-items');
    } catch (e) {
    }
    
    ipcMain.removeAllListeners('toggle-devtools');
    
    // 命令执行
    ipcMain.handle('plugin:execute-command', async (event, commandId, ...args) => {
      // 使用静态方法获取当前实例
      const adapter = PluginAPIAdapter.getCurrentInstance();
      if (!adapter) {
        throw new Error('PluginAPIAdapter 实例未初始化');
      }
      const handler = adapter.commandHandlers.get(commandId);
      if (handler) {
        try {
          return await handler(...args);
        } catch (error) {
          console.error(`[PluginAPIAdapter] 命令执行失败: ${commandId}`,error);
          throw error;
        }
      }
      throw new Error(`Command not found: ${commandId}`);
    });

    // 获取所有状态栏项
    ipcMain.handle('plugin:get-status-bar-items', async () => {
      // 使用静态方法获取当前实例
      const adapter = PluginAPIAdapter.getCurrentInstance();
      if (!adapter) {
        console.warn('[PluginAPIAdapter] 实例未初始化，返回空数组');
        return [];
      }
      const items = Array.from(adapter.statusBarItems.values());
      return items;
    });

    // 切换开发者工具
    ipcMain.on('toggle-devtools', () => {
      const adapter = PluginAPIAdapter.getCurrentInstance();
      if (adapter && adapter.mainWindow) {
        if (adapter.mainWindow.webContents.isDevToolsOpened()) {
          adapter.mainWindow.webContents.closeDevTools();
        } else {
          adapter.mainWindow.webContents.openDevTools();
        }
      }
    });

    // 监听背景图片相关事件并转发
    ipcMain.removeAllListeners('background-image:browse-image');
    ipcMain.removeAllListeners('background-image:update-config');
    ipcMain.removeAllListeners('background-image:renderer-ready');
    
    ipcMain.on('background-image:browse-image', async () => {
      // 触发事件系统，让插件处理
      const handlers = this.eventListeners.get('background-image:browse-image');
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler();
          } catch (error) {
            console.error('[PluginAPIAdapter] 处理图片选择请求失败:', error);
          }
        }
      }
    });

    ipcMain.on('background-image:update-config', async (event, config) => {
      // 触发事件系统，让插件处理
      const handlers = this.eventListeners.get('background-image:update-config');
      if (handlers && handlers.size > 0) {
        for (const handler of handlers) {
          try {
            await handler(config);
          } catch (error) {
            console.error('[PluginAPIAdapter] 处理配置更新请求失败:', error);
            console.error('[PluginAPIAdapter] 错误堆栈:', (error as Error).stack);
          }
        }
      } else {
        console.warn('[PluginAPIAdapter] ⚠️ 未找到 background-image:update-config 事件处理器！');
        console.warn('[PluginAPIAdapter] 当前已注册的事件:', Array.from(this.eventListeners.keys()));
      }
    });

    ipcMain.on('background-image:renderer-ready', async () => {
      // 触发事件系统，让插件处理
      const handlers = this.eventListeners.get('background-image:renderer-ready');
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler();
          } catch (error) {
            console.error('[PluginAPIAdapter] 处理渲染进程就绪事件失败:', error);
          }
        }
      } 
    });

    // 注册 background-image:list-images IPC 处理器
    ipcMain.removeHandler('background-image:list-images');
    ipcMain.handle('background-image:list-images', async () => {
      try {
        // 初始化图片缓存管理器
        const cacheManager = ImageCacheManager.getInstance();
        await cacheManager.initialize();

        // 统一的图片扩展名列表
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

        /**
         * 读取指定目录下的内置图片列表
         */
        const readBuiltinImages = async (dir: string) => {
          try {
            await fs.access(dir);
          } catch {
            return [];
          }

          const entries = await fs.readdir(dir, { withFileTypes: true });
          const rawImageFiles = entries
            .filter((entry) => {
              if (!entry.isFile()) return false;
              const ext = path.extname(entry.name).toLowerCase();
              return imageExtensions.includes(ext);
            })
            .map((entry) => ({
              name: entry.name,
              path: path.join(dir, entry.name),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

          return rawImageFiles.map((file) => ({
            name: file.name,
            path: file.path,
          }));
        };

        // 1. 读取内置资源图片（优先应用目录，其次工作区目录）
        const appPath = app.getAppPath();
        const appBackgroundImgDir = path.join(appPath, 'resources', 'backgroundImg');

        let builtinImages = await readBuiltinImages(appBackgroundImgDir);

        if (builtinImages.length === 0) {
          let workspaceRoot: string | undefined;

          if (this.workspaceManager) {
            workspaceRoot = this.workspaceManager.getWorkspaceDir();
          }

          if (!workspaceRoot) {
            const userDataPath = app.getPath('documents');
            workspaceRoot = path.join(userDataPath, 'NoteStudio');
          }

          const workspaceBackgroundImgDir = path.join(workspaceRoot, 'resources', 'backgroundImg');
          builtinImages = await readBuiltinImages(workspaceBackgroundImgDir);
        }

        // 2. 读取用户图片缓存列表（由背景插件管理），通过事件向插件请求
        let userImages: Array<{ imagePath: string; date: string }> = [];
        try {
          const handler = this.commandHandlers.get('background-image:get-user-images');
          if (handler) {
            const cacheResult = await handler();
            if (Array.isArray(cacheResult)) {
              userImages = cacheResult
                .filter(
                  (item) =>
                    typeof item.imagePath === 'string' &&
                    item.imagePath &&
                    typeof item.date === 'string'
                )
                .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
            }
          } 
        } catch (error) {
          console.warn('[PluginAPIAdapter] 读取用户图片缓存失败，将使用空列表:', error);
          userImages = [];
        }

        return {
          builtinImages,
          userImages,
        };
      } catch (error) {
        console.error('[PluginAPIAdapter] 列出背景图片失败:', error);
        throw error;
      }
    });

    // 注册 background-image:cache-image IPC 处理器
    ipcMain.removeHandler('background-image:cache-image');
    ipcMain.handle('background-image:cache-image', async (event, imagePath: string) => {
      try {
        // 初始化图片缓存管理器
        const cacheManager = ImageCacheManager.getInstance();
        await cacheManager.initialize();
        
        // 优先尝试获取已存在的缓存（即使原文件不存在，也可继续使用）
        let cachedPath = await cacheManager.getCachedPath(imagePath);
        if (cachedPath && cachedPath !== imagePath) {
          return { success: true, cachedPath };
        }
        
        // 如果没有缓存或缓存无效，再尝试创建新的缓存
        cachedPath = await cacheManager.cacheImage(imagePath);
        
        return { success: true, cachedPath };
      } catch (error) {
        console.error('[PluginAPIAdapter] 缓存图片失败:', imagePath, error);
        return { success: false, error: error instanceof Error ? error.message : '未知错误' };
      }
    });

    PluginAPIAdapter.ipcHandlersRegistered = true;
    // 验证处理器是否已注册
    this.verifyIPCHandlers();
  }

  /**
   * 验证 IPC 处理器是否已正确注册
   */
  private verifyIPCHandlers(): void {
    const handlersToCheck = [
      'plugin:execute-command',
      'plugin:get-status-bar-items',
      'background-image:list-images',
      'background-image:cache-image'
    ];
    
    for (const handlerName of handlersToCheck) {
      // 检查处理器是否存在（通过尝试获取处理器）
      try {
        // Electron 的 ipcMain 没有直接的方法来检查处理器是否存在
        // 但我们可以在控制台记录注册状态
      } catch (error) {
        console.error(`[PluginAPIAdapter] ✗ 处理器注册失败: ${handlerName}`, error);
      }
    }
  }

  /**
   * 创建插件API实例
   */
  createAPI(context: PluginContext): PluginAPI {
    const api: any = {
      context,

      // 事件系统
      events: {
        on: (event: string, handler: Function) => {
          if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
          }
          this.eventListeners.get(event)!.add(handler);
          return {
            dispose: () => {
              this.eventListeners.get(event)?.delete(handler);
            }
          };
        },
        once: (event: string, handler: Function) => {
          const wrapper = (...args: any[]) => {
            handler(...args);
            this.eventListeners.get(event)?.delete(wrapper);
          };
          return api.events.on(event, wrapper);
        },
        emit: async (event: string, ...args: any[]) => {
          
          // 触发主进程内部的事件监听器
          const handlers = this.eventListeners.get(event);
          if (handlers) {
            for (const handler of handlers) {
              try {
                await handler(...args);
              } catch (error) {
                console.error(`[PluginAPIAdapter] 事件处理器错误 (${event}):`, error);
              }
            }
          } 
          
          // 同时将事件发送到渲染进程
          if (this.safeSendToRenderer(event, ...args)) {
          } else {
            // 窗口尚未创建或已销毁，缓存事件以便后续发送
            this.cachedEvents.push({ event, args });
          }
          
        },
        off: (event: string, handler: Function) => {
          this.eventListeners.get(event)?.delete(handler);
        }
      },

      // 命令系统
      commands: {
        registerCommand: (command: any) => {
          this.commandHandlers.set(command.id, command.handler);
          return {
            dispose: () => {
              this.commandHandlers.delete(command.id);
            }
          };
        },
        executeCommand: async (commandId: string, ...args: any[]) => {
          const handler = this.commandHandlers.get(commandId);
          if (handler) {
            return await handler(...args);
          }
          throw new Error(`Command not found: ${commandId}`);
        },
        getCommands: () => {
          return Array.from(this.commandHandlers.keys());
        }
      },

      // UI系统
      ui: {
        registerStatusBarItem: (options: any) => {
          this.statusBarItems.set(options.id, options);
          
          // 发送到渲染进程
          this.safeSendToRenderer('plugin:status-bar-item', {
            action: 'add',
            item: options
          });

          return {
            update: (newOptions: any) => {
              const item = { ...options, ...newOptions };
              this.statusBarItems.set(options.id, item);
              this.safeSendToRenderer('plugin:status-bar-item', {
                action: 'update',
                item
              });
            },
            dispose: () => {
              this.statusBarItems.delete(options.id);
              this.safeSendToRenderer('plugin:status-bar-item', {
                action: 'remove',
                id: options.id
              });
            }
          };
        },
        registerMenuItem: (options: any) => {
          this.safeSendToRenderer('plugin:menu-item', {
            action: 'add',
            item: options
          });
          return {
            dispose: () => {
              this.safeSendToRenderer('plugin:menu-item', {
                action: 'remove',
                id: options.id
              });
            }
          };
        },
        showNotification: (notification: any) => {
          this.safeSendToRenderer('plugin:notification', notification);
        }
      },

      // 窗口API
      window: {
        showInformationMessage: (message: string, ...items: string[]) => {
          this.safeSendToRenderer('plugin:message', {
            type: 'info',
            message,
            items
          });
          return Promise.resolve(undefined);
        },
        showWarningMessage: (message: string, ...items: string[]) => {
          this.safeSendToRenderer('plugin:message', {
            type: 'warning',
            message,
            items
          });
          return Promise.resolve(undefined);
        },
        showErrorMessage: (message: string, ...items: string[]) => {
          console.error(`[PluginAPIAdapter] 错误消息: ${message}`);
          this.safeSendToRenderer('plugin:message', {
            type: 'error',
            message,
            items
          });
          return Promise.resolve(undefined);
        }
      },

      // 文件系统API
      fs: {
        readFile: async (filePath: string) => {
          return await fs.readFile(filePath, 'utf-8');
        },
        writeFile: async (filePath: string, content: string) => {
          await fs.writeFile(filePath, content, 'utf-8');
        },
        exists: async (filePath: string) => {
          try {
            await fs.access(filePath);
            return true;
          } catch {
            return false;
          }
        },
        showOpenDialog: async (options: any) => {
          if (!this.mainWindow) {
            throw new Error('主窗口未初始化，无法显示对话框');
          }
          const result = await dialog.showOpenDialog(this.mainWindow, options);
          return result.filePaths;
        },
        showSaveDialog: async (options: any) => {
          if (!this.mainWindow) {
            throw new Error('主窗口未初始化，无法显示对话框');
          }
          const result = await dialog.showSaveDialog(this.mainWindow, options);
          return result.filePath;
        }
      },

      // 存储API
      storage: {
        get: async (key: string, defaultValue?: any) => {
          try {
            const fullKey = `plugin.${context.metadata.id}.${key}`;
            const value = this.pluginStorage.get(fullKey);
            return value !== undefined ? value : defaultValue;
          } catch (error) {
            console.error(`[PluginAPIAdapter] 存储获取失败: ${key}`, error);
            return defaultValue;
          }
        },
        set: async (key: string, value: any) => {
          try {
            const fullKey = `plugin.${context.metadata.id}.${key}`;
            this.pluginStorage.set(fullKey, value);
            // 通知渲染进程存储变化
            this.safeSendToRenderer('plugin:storage-changed', { 
              pluginId: context.metadata.id,
              key, 
              value 
            });
          } catch (error) {
            console.error(`[PluginAPIAdapter] 存储设置失败: ${key}`, error);
          }
        },
        delete: async (key: string) => {
          try {
            const fullKey = `plugin.${context.metadata.id}.${key}`;
            this.pluginStorage.delete(fullKey);
          } catch (error) {
            console.error(`[PluginAPIAdapter] 存储删除失败: ${key}`, error);
          }
        },
        clear: async () => {
          try {
            const prefix = `plugin.${context.metadata.id}.`;
            for (const key of Array.from(this.pluginStorage.keys())) {
              if (key.startsWith(prefix)) {
                this.pluginStorage.delete(key);
              }
            }
          } catch (error) {
            console.error(`[PluginAPIAdapter] 存储清空失败`, error);
          }
        }
      },

      // 工作区API
      workspace: {
        getRootPath: () => {
          // 从工作区管理器获取
          if (this.workspaceManager) {
            return this.workspaceManager.getWorkspaceDir();
          }
          return undefined;
        },
        getWorkspaceFolder: () => {
          // TODO: 实现
          return undefined;
        },
        openTextDocument: async (filePath: string) => {
          // TODO: 实现
          return null as any;
        }
      },

      // HTTP API
      http: {
        get: async (url: string, options?: any) => {
          // TODO: 实现
          const response = await fetch(url, { ...options, method: 'GET' });
          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            status: response.status,
            headers,
            data: await response.text()
          };
        },
        post: async (url: string, data?: any, options?: any) => {
          // TODO: 实现
          const response = await fetch(url, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
              'Content-Type': 'application/json',
              ...options?.headers
            }
          });
          const headers: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            headers[key] = value;
          });
          return {
            status: response.status,
            headers,
            data: await response.text()
          };
        }
      },

      // Settings API
      settings: {
        get: async <T = any>(key: string, defaultValue?: T): Promise<T | undefined> => {
          if (!this.settingsManager) {
            console.warn('[PluginAPIAdapter] SettingsManager 未设置');
            return defaultValue;
          }
          try {
            const value = this.settingsManager.getPluginSetting<T>(key, defaultValue);
            const result = value !== undefined ? value : defaultValue;
            return result;
          } catch (error) {
            console.error(`[PluginAPIAdapter] 读取设置失败: ${key}`, error);
            return defaultValue;
          }
        },
        update: async (key: string, value: any): Promise<void> => {
          if (!this.settingsManager) {
            console.warn('[PluginAPIAdapter] SettingsManager 未设置');
            return;
          }
          try {
            await this.settingsManager.updatePluginSetting(key, value);
          } catch (error) {
            console.error(`[PluginAPIAdapter] 更新设置失败: ${key}`, error);
          }
        }
      }
    };

    return api;
  }

  /**
   * 触发事件（供系统内部调用）
   */
  async triggerEvent(event: string, ...args: any[]): Promise<void> {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(...args);
        } catch (error) {
          console.error(`[PluginAPIAdapter] 事件处理器错误 (${event}):`, error);
        }
      }
    }
  }

  /**
   * 获取所有状态栏项（供UI使用）
   */
  getAllStatusBarItems(): any[] {
    return Array.from(this.statusBarItems.values());
  }
}

