/**
 * 文件操作 IPC 处理器
 * 处理文件读取、写入等操作
 */

import { ipcMain, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册文件操作相关的 IPC 处理器
 */
export function registerFileHandlers(): void {
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'read-file', 'write-file', 'file-exists', 'file-stat', 'folder:rename', 'folder:delete', 'folder:reveal-in-explorer', 'delete-file'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }
  

  /**
   * 读取文件内容
   */
  ipcMain.handle('read-file', async (event, filePath: string) => {
    try {
      
      // 检查文件是否存在
      try {
        await fs.access(filePath);
      } catch (error) {
        console.error('[FileHandlers] 文件不存在:', filePath);
        throw new Error(`文件不存在: ${filePath}`);
      }
      
      // 读取文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      
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
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      
      // 写入文件内容
      await fs.writeFile(filePath, content, 'utf-8');
      
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

  /**
   * 重命名文件或文件夹
   */
  ipcMain.handle('folder:rename', async (event, oldPath: string, newName: string) => {
    try {
      
      // 检查源文件/文件夹是否存在
      try {
        await fs.access(oldPath);
      } catch (error) {
        console.error('[FileHandlers] 源文件不存在:', oldPath);
        return { success: false, error: '源文件或文件夹不存在' };
      }
      
      // 计算新路径
      const dir = path.dirname(oldPath);
      const newPath = path.join(dir, newName);
      
      // 检查目标是否已存在
      try {
        await fs.access(newPath);
        console.error('[FileHandlers] 目标已存在:', newPath);
        return { success: false, error: '目标文件或文件夹已存在' };
      } catch (error) {
        // 目标不存在，可以继续
      }
      
      // 执行重命名
      await fs.rename(oldPath, newPath);
      
      return {
        success: true,
        data: {
          path: newPath,
          name: newName
        }
      };
    } catch (error) {
      console.error('[FileHandlers] 重命名失败:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 删除文件或文件夹（移动到回收站）
   */
  const handleDelete = async (event: Electron.IpcMainInvokeEvent, targetPath: string) => {
    try {
      
      // 检查文件/文件夹是否存在
      try {
        await fs.access(targetPath);
      } catch (error) {
        console.error('[FileHandlers] 文件/文件夹不存在:', targetPath);
        return { success: false, error: '文件或文件夹不存在' };
      }
      
      // 使用 Electron 的 shell.trashItem 将文件移动到回收站
      // 这样可以恢复文件，而不是永久删除
      try {
        await shell.trashItem(targetPath);
        console.log('[FileHandlers] 文件已移动到回收站:', targetPath);
        return { success: true };
      } catch (trashError) {
        // 如果移动到回收站失败（某些系统可能不支持），回退到永久删除
        console.warn('[FileHandlers] 移动到回收站失败，尝试永久删除:', trashError);
        
        // 获取文件/文件夹信息
        const stats = await fs.stat(targetPath);
        
        if (stats.isDirectory()) {
          // 删除文件夹（递归删除所有内容）
          await fs.rm(targetPath, { recursive: true, force: true });
        } else {
          // 删除文件
          await fs.unlink(targetPath);
        }
        
        console.log('[FileHandlers] 文件已永久删除（回收站不可用）:', targetPath);
        return { success: true };
      }
    } catch (error) {
      console.error('[FileHandlers] 删除失败:', error);
      return { success: false, error: String(error) };
    }
  };

  // 注册 folder:delete 处理器（保持向后兼容）
  ipcMain.handle('folder:delete', handleDelete);

  // 注册 delete-file 处理器（前端使用的名称）
  ipcMain.handle('delete-file', handleDelete);

  /**
   * 在资源管理器中打开文件或文件夹
   */
  ipcMain.handle('folder:reveal-in-explorer', async (event, targetPath: string) => {
    try {
      
      // 检查文件/文件夹是否存在
      try {
        await fs.access(targetPath);
      } catch (error) {
        console.error('[FileHandlers] 文件/文件夹不存在:', targetPath);
        return { success: false, error: '文件或文件夹不存在' };
      }
      
      // 使用 Electron 的 shell.showItemInFolder 在系统文件管理器中显示
      shell.showItemInFolder(targetPath);
      
      return { success: true };
    } catch (error) {
      console.error('[FileHandlers] 在资源管理器中打开失败:', error);
      return { success: false, error: String(error) };
    }
  });

  isRegistered = true;
}

