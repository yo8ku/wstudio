/**
 * electron-store IPC 通信处理器
 * 提供渲染进程访问 electron-store 的 IPC 接口
 */

import { ipcMain, BrowserWindow } from 'electron';
import { electronStore } from '../services/ElectronStoreService';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册 electron-store 相关的 IPC 处理器
 */
export function registerStoreHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'store:get', 'store:set', 'store:delete', 'store:has', 'store:clear'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }
  
  isRegistered = true;
  
  // ==================== electron-store IPC 处理器 ====================
  // 获取存储值
  ipcMain.handle('store:get', async (event, key: string) => {
    try {
      return electronStore.get(key as any);
    } catch (error) {
      console.error('[Store IPC] 获取值失败:', error);
      throw error;
    }
  });

  // 设置存储值
  ipcMain.handle('store:set', async (event, key: string, value: any) => {
    try {
      electronStore.set(key as any, value);
      return { success: true };
    } catch (error) {
      console.error('[Store IPC] 设置值失败:', error);
      throw error;
    }
  });

  // 删除存储值
  ipcMain.handle('store:delete', async (event, key: string) => {
    try {
      electronStore.delete(key as any);
      return { success: true };
    } catch (error) {
      console.error('[Store IPC] 删除值失败:', error);
      throw error;
    }
  });

  // 检查键是否存在
  ipcMain.handle('store:has', async (event, key: string) => {
    try {
      return electronStore.has(key as any);
    } catch (error) {
      console.error('[Store IPC] 检查键存在失败:', error);
      throw error;
    }
  });

  // 清除所有存储
  ipcMain.handle('store:clear', async () => {
    try {
      electronStore.clear();
      return { success: true };
    } catch (error) {
      console.error('[Store IPC] 清除存储失败:', error);
      throw error;
    }
  });

  // 获取所有数据
  ipcMain.handle('store:getAll', async () => {
    try {
      return electronStore.getAll();
    } catch (error) {
      console.error('[Store IPC] 获取所有数据失败:', error);
      throw error;
    }
  });

  // 批量设置
  ipcMain.handle('store:setMultiple', async (event, data: Record<string, any>) => {
    try {
      electronStore.setMultiple(data);
      return { success: true };
    } catch (error) {
      console.error('[Store IPC] 批量设置失败:', error);
      throw error;
    }
  });

  // 重置为默认值
  ipcMain.handle('store:reset', async (event, key: string) => {
    try {
      electronStore.reset(key as any);
      return { success: true };
    } catch (error) {
      console.error('[Store IPC] 重置失败:', error);
      throw error;
    }
  });

  // 获取存储路径
  ipcMain.handle('store:getPath', async () => {
    try {
      return electronStore.getPath();
    } catch (error) {
      console.error('[Store IPC] 获取路径失败:', error);
      throw error;
    }
  });

  console.log('[Store IPC]  所有 electron-store IPC 处理器已注册');
}

