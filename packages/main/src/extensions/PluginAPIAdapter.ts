/**
 * Plugin API 适配器
 * 为内置扩展提供 PluginAPI 实现
 */

import type { PluginContext } from '../../../plugin-system/src/types/plugin';
import type { PluginAPI } from '../../../plugin-system/src/api/PluginAPI';
import type { SettingsManager } from '../config/SettingsManager';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PluginAPIAdapter {
  private commandHandlers: Map<string, Function> = new Map();
  private statusBarItems: Map<string, any> = new Map();
  private eventListeners: Map<string, Set<Function>> = new Map();
  private pluginStorage: Map<string, any> = new Map();
  private rendererReady: boolean = false;
  private settingsManager: SettingsManager | null = null;

  constructor(private mainWindow: BrowserWindow) {
    console.log('[PluginAPIAdapter] ========== 构造函数被调用 ==========');
    console.log('[PluginAPIAdapter] 创建新的 PluginAPIAdapter 实例');
    this.setupIPCHandlers();
    this.setupRendererReadyListener();
    console.log('[PluginAPIAdapter] ========== 构造完成 ==========');
  }

  /**
   * 设置 SettingsManager 实例
   */
  setSettingsManager(settingsManager: SettingsManager): void {
    this.settingsManager = settingsManager;
  }

  /**
   * 监听渲染进程准备就绪事件
   */
  private setupRendererReadyListener(): void {
    console.log('[PluginAPIAdapter] 设置渲染进程就绪监听器');
    ipcMain.on('renderer:loaded', () => {
      console.log('[PluginAPIAdapter] ========== 收到渲染进程已加载通知 ==========');
      console.log('[PluginAPIAdapter] 当前状态栏项数量:', this.statusBarItems.size);
      this.rendererReady = true;
      // 重新发送所有状态栏项
      this.resendAllStatusBarItems();
      console.log('[PluginAPIAdapter] ==========================================');
    });
  }

  /**
   * 重新发送所有状态栏项到渲染进程
   */
  private resendAllStatusBarItems(): void {
    console.log(`[PluginAPIAdapter] 重新发送所有状态栏项，数量: ${this.statusBarItems.size}`);
    for (const item of this.statusBarItems.values()) {
      this.mainWindow.webContents.send('plugin:status-bar-item', {
        action: 'add',
        item
      });
      console.log(`[PluginAPIAdapter] 重新发送状态栏项: ${item.id}`);
    }
  }

  /**
   * 设置IPC处理器
   */
  private setupIPCHandlers(): void {
    console.log('[PluginAPIAdapter] ========== setupIPCHandlers 开始 ==========');
    // 移除已有的处理器（防止重复注册）
    try {
      ipcMain.removeHandler('plugin:execute-command');
      console.log('[PluginAPIAdapter] 已移除旧的 plugin:execute-command handler');
    } catch (e) {
      console.log('[PluginAPIAdapter] 没有旧的 plugin:execute-command handler 需要移除');
    }
    
    try {
      ipcMain.removeHandler('plugin:get-status-bar-items');
      console.log('[PluginAPIAdapter] 已移除旧的 plugin:get-status-bar-items handler');
    } catch (e) {
      console.log('[PluginAPIAdapter] 没有旧的 plugin:get-status-bar-items handler 需要移除');
    }
    
    ipcMain.removeAllListeners('toggle-devtools');
    console.log('[PluginAPIAdapter] 已移除旧的 toggle-devtools listeners');
    
    // 命令执行
    console.log('[PluginAPIAdapter] 注册 plugin:execute-command handler');
    ipcMain.handle('plugin:execute-command', async (event, commandId, ...args) => {
      const handler = this.commandHandlers.get(commandId);
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
    console.log('[PluginAPIAdapter] 注册 plugin:get-status-bar-items handler');
    ipcMain.handle('plugin:get-status-bar-items', async () => {
      console.log('[PluginAPIAdapter] ========== 渲染进程请求状态栏项 ==========');
      console.log('[PluginAPIAdapter] 当前数量:', this.statusBarItems.size);
      const items = Array.from(this.statusBarItems.values());
      console.log('[PluginAPIAdapter] 返回项目:', JSON.stringify(items, null, 2));
      console.log('[PluginAPIAdapter] ==========================================');
      return items;
    });
    
    console.log('[PluginAPIAdapter] ========== setupIPCHandlers 完成 ==========');

    // 切换开发者工具
    ipcMain.on('toggle-devtools', () => {
      console.log('[PluginAPIAdapter] 切换开发者工具');
      if (this.mainWindow.webContents.isDevToolsOpened()) {
        this.mainWindow.webContents.closeDevTools();
      } else {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // 监听背景图片相关事件并转发
    ipcMain.removeAllListeners('background-image:browse-image');
    ipcMain.removeAllListeners('background-image:update-config');
    ipcMain.removeAllListeners('background-image:renderer-ready');
    
    ipcMain.on('background-image:browse-image', async () => {
      console.log('[PluginAPIAdapter] 收到渲染进程的图片选择请求');
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
      console.log('[PluginAPIAdapter] 收到渲染进程的配置更新请求:', config);
      // 触发事件系统，让插件处理
      const handlers = this.eventListeners.get('background-image:update-config');
      if (handlers) {
        for (const handler of handlers) {
          try {
            await handler(config);
          } catch (error) {
            console.error('[PluginAPIAdapter] 处理配置更新请求失败:', error);
          }
        }
      }
    });

    ipcMain.on('background-image:renderer-ready', async () => {
      console.log('[PluginAPIAdapter] 收到渲染进程准备就绪通知');
      // 触发事件系统，让插件处理
      const handlers = this.eventListeners.get('background-image:renderer-ready');
      if (handlers) {
        console.log(`[PluginAPIAdapter] 找到 ${handlers.size} 个 renderer-ready 处理器`);
        for (const handler of handlers) {
          try {
            await handler();
          } catch (error) {
            console.error('[PluginAPIAdapter] 处理渲染进程就绪事件失败:', error);
          }
        }
      } else {
        console.log('[PluginAPIAdapter] 没有找到 renderer-ready 处理器');
      }
    });
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
          console.log(`[PluginAPIAdapter] ========== events.emit 被调用 ==========`);
          console.log(`[PluginAPIAdapter] 事件名称: ${event}`);
          console.log(`[PluginAPIAdapter] 参数数量: ${args.length}`);
          console.log(`[PluginAPIAdapter] 参数内容:`, args);
          console.log(`[PluginAPIAdapter] mainWindow 可用: ${!!this.mainWindow}`);
          console.log(`[PluginAPIAdapter] webContents 可用: ${!!this.mainWindow?.webContents}`);
          
          // 触发主进程内部的事件监听器
          const handlers = this.eventListeners.get(event);
          if (handlers) {
            console.log(`[PluginAPIAdapter] 找到 ${handlers.size} 个主进程内部监听器`);
            for (const handler of handlers) {
              try {
                await handler(...args);
              } catch (error) {
                console.error(`[PluginAPIAdapter] 事件处理器错误 (${event}):`, error);
              }
            }
          } else {
            console.log(`[PluginAPIAdapter] 没有找到主进程内部监听器`);
          }
          
          // 同时将事件发送到渲染进程
          try {
            this.mainWindow.webContents.send(event, ...args);
            console.log(`[PluginAPIAdapter]  事件已发送到渲染进程: ${event}`);
          } catch (error) {
            console.error(`[PluginAPIAdapter]  发送事件到渲染进程失败 (${event}):`, error);
          }
          
          console.log(`[PluginAPIAdapter] ===============================================`);
        },
        off: (event: string, handler: Function) => {
          this.eventListeners.get(event)?.delete(handler);
        }
      },

      // 命令系统
      commands: {
        registerCommand: (command: any) => {
          console.log(`[PluginAPIAdapter] 注册命令: ${command.id}`);
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
          console.log(`[PluginAPIAdapter] 注册状态栏项: ${options.id}`);
          this.statusBarItems.set(options.id, options);
          
          // 发送到渲染进程
          this.mainWindow.webContents.send('plugin:status-bar-item', {
            action: 'add',
            item: options
          });

          return {
            update: (newOptions: any) => {
              const item = { ...options, ...newOptions };
              this.statusBarItems.set(options.id, item);
              this.mainWindow.webContents.send('plugin:status-bar-item', {
                action: 'update',
                item
              });
            },
            dispose: () => {
              this.statusBarItems.delete(options.id);
              this.mainWindow.webContents.send('plugin:status-bar-item', {
                action: 'remove',
                id: options.id
              });
            }
          };
        },
        registerMenuItem: (options: any) => {
          console.log(`[PluginAPIAdapter] 注册菜单项: ${options.id}`);
          this.mainWindow.webContents.send('plugin:menu-item', {
            action: 'add',
            item: options
          });
          return {
            dispose: () => {
              this.mainWindow.webContents.send('plugin:menu-item', {
                action: 'remove',
                id: options.id
              });
            }
          };
        },
        showNotification: (notification: any) => {
          this.mainWindow.webContents.send('plugin:notification', notification);
        }
      },

      // 窗口API
      window: {
        showInformationMessage: (message: string, ...items: string[]) => {
          console.log(`[PluginAPIAdapter] 信息消息: ${message}`);
          this.mainWindow.webContents.send('plugin:message', {
            type: 'info',
            message,
            items
          });
          return Promise.resolve(undefined);
        },
        showWarningMessage: (message: string, ...items: string[]) => {
          console.log(`[PluginAPIAdapter] 警告消息: ${message}`);
          this.mainWindow.webContents.send('plugin:message', {
            type: 'warning',
            message,
            items
          });
          return Promise.resolve(undefined);
        },
        showErrorMessage: (message: string, ...items: string[]) => {
          console.error(`[PluginAPIAdapter] 错误消息: ${message}`);
          this.mainWindow.webContents.send('plugin:message', {
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
          const result = await dialog.showOpenDialog(this.mainWindow, options);
          return result.filePaths;
        },
        showSaveDialog: async (options: any) => {
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
            this.mainWindow.webContents.send('plugin:storage-changed', { 
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
          // TODO: 从工作区管理器获取
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
          console.log(`[PluginAPIAdapter] settings.get 被调用, key: ${key}, defaultValue:`, defaultValue);
          if (!this.settingsManager) {
            console.warn('[PluginAPIAdapter] SettingsManager 未设置');
            return defaultValue;
          }
          try {
            console.log('[PluginAPIAdapter] SettingsManager 存在，调用 settingsManager.get...');
            const value = this.settingsManager.get(key as any);
            console.log(`[PluginAPIAdapter] settingsManager.get 返回值:`, value);
            console.log(`[PluginAPIAdapter] value 类型:`, typeof value);
            console.log(`[PluginAPIAdapter] value !== undefined:`, value !== undefined);
            const result = value !== undefined ? (value as T) : defaultValue;
            console.log(`[PluginAPIAdapter] 最终返回值:`, result);
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
            await this.settingsManager.update(key as any, value);
          } catch (error) {
            console.error(`[PluginAPIAdapter] 更新设置失败: ${key}`, error);
          }
        }
      }
    };

    // 验证 API 对象
    console.log(`[PluginAPIAdapter] 创建 API 对象完成`);
    console.log(`[PluginAPIAdapter] api.events 类型:`, typeof api.events);
    console.log(`[PluginAPIAdapter] api.events.emit 类型:`, typeof api.events.emit);
    console.log(`[PluginAPIAdapter] api.events.emit 是否为函数:`, typeof api.events.emit === 'function');

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

