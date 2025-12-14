/**
 * 工作区索引数据库 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron';
import { workspaceIndexDatabase, FileIndexRecord, ParentRecord, ChildRecord } from '../services/WorkspaceIndexDatabase';

let isRegistered = false;
let mainWindow: BrowserWindow | null = null;

/**
 * 设置主窗口
 */
export function setWorkspaceIndexDbMainWindow(window: BrowserWindow | null): void {
  mainWindow = window;
}

/**
 * 注册 IPC 处理器
 */
export function registerWorkspaceIndexDbHandlers(): void {
  if (isRegistered) {
    console.log('[WorkspaceIndexDb IPC] 处理器已注册，跳过');
    return;
  }
  
  isRegistered = true;
  console.log('[WorkspaceIndexDb IPC] 注册处理器...');

  // 初始化数据库
  ipcMain.handle('workspace-index-db:initialize', async () => {
    try {
      await workspaceIndexDatabase.initialize();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 检查文件是否应该被索引
  ipcMain.handle('workspace-index-db:should-index-file', async (event, fileSize: number) => {
    return { success: true, data: workspaceIndexDatabase.shouldIndexFile(fileSize) };
  });

  // 检查文件是否已索引
  ipcMain.handle('workspace-index-db:is-file-indexed', async (event, filePath: string) => {
    return { success: true, data: workspaceIndexDatabase.isFileIndexed(filePath) };
  });

  // 获取文件索引信息
  ipcMain.handle('workspace-index-db:get-file-index', async (event, filePath: string) => {
    const record = workspaceIndexDatabase.getFileIndex(filePath);
    return { success: true, data: record };
  });

  // 添加文件索引
  ipcMain.handle('workspace-index-db:add-file-index', async (event, record: FileIndexRecord) => {
    try {
      workspaceIndexDatabase.addFileIndex(record);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 删除文件索引
  ipcMain.handle('workspace-index-db:delete-file-index', async (event, filePath: string) => {
    try {
      workspaceIndexDatabase.deleteFileIndex(filePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 添加父块
  ipcMain.handle('workspace-index-db:add-parent', async (event, record: ParentRecord) => {
    try {
      workspaceIndexDatabase.addParent(record);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 批量添加父块
  ipcMain.handle('workspace-index-db:add-parents-batch', async (event, records: ParentRecord[]) => {
    try {
      workspaceIndexDatabase.addParentsBatch(records);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取父块
  ipcMain.handle('workspace-index-db:get-parent', async (event, parentId: string) => {
    const record = workspaceIndexDatabase.getParent(parentId);
    return { success: true, data: record };
  });

  // 添加子块向量
  ipcMain.handle('workspace-index-db:add-children', async (event, records: ChildRecord[]) => {
    try {
      await workspaceIndexDatabase.addChildren(records);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 向量搜索
  ipcMain.handle('workspace-index-db:search', async (event, queryVector: number[], topK: number = 10) => {
    try {
      const results = await workspaceIndexDatabase.search(queryVector, topK);
      return { success: true, data: results };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取统计信息
  ipcMain.handle('workspace-index-db:get-stats', async () => {
    const stats = workspaceIndexDatabase.getStats();
    return { success: true, data: stats };
  });

  // 获取所有已索引文件
  ipcMain.handle('workspace-index-db:get-all-indexed-files', async () => {
    const files = workspaceIndexDatabase.getAllIndexedFiles();
    return { success: true, data: files };
  });

  // 清空所有数据
  ipcMain.handle('workspace-index-db:clear-all', async () => {
    try {
      await workspaceIndexDatabase.clearAll();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  console.log('[WorkspaceIndexDb IPC] 处理器注册完成');
}
