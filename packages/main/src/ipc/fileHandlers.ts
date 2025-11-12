/**
 * 文件操作 IPC 处理器
 * 处理文件读取、写入等操作
 */

import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册文件操作相关的 IPC 处理器
 */
export function registerFileHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    console.log('[FileHandlers] IPC 处理器已注册，跳过重复注册');
    return;
  }
  
  console.log('[FileHandlers] 开始注册 IPC 处理器...');
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'read-file', 'write-file', 'file-exists', 'get-file-stats'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }
  
  console.log('[FileHandlers] 已清理旧的 IPC 处理器');
  isRegistered = true;

  /**
   * 读取文件内容
   */
  ipcMain.handle('read-file', async (event, filePath: string) => {
    try {
      console.log('[FileHandlers] 读取文件:', filePath);
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error('[FileHandlers] 文件不存在:', filePath);
        throw new Error(`文件不存在: ${filePath}`);
      }
      
      // 读取文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      console.log('[FileHandlers] 文件读取成功，长度:', content.length);
      
      return content;
    } catch (error) {
      console.error('[FileHandlers] 读取文件失败:', error);
      throw error;
    }
  });

  /**
   * 写入文件内容
   */
  ipcMain.handle('write-file', async (event, filePath: string, content: string) => {
    try {
      console.log('[FileHandlers] 写入文件:', filePath);
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // 写入文件内容
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('[FileHandlers] 文件写入成功');
      
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 写入文件失败:', error);
      throw error;
    }
  });

  /**
   * 检查文件是否存在
   */
  ipcMain.handle('file-exists', async (event, filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  });

  /**
   * 获取文件信息
   */
  ipcMain.handle('file-stat', async (event, filePath: string) => {
    try {
      const stats = await fs.stat(filePath);
      return {
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.getTime(),
        ctime: stats.ctime.getTime(),
      };
    } catch (error) {
      console.error('[FileHandlers] 获取文件信息失败:', error);
      throw error;
    }
  });

  console.log('[FileHandlers] 文件操作 IPC 处理器注册完成');
}

