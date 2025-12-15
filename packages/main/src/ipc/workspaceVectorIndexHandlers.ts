/**
 * 工作区向量索引 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron';
import { workspaceVectorIndexService } from '../services/WorkspaceVectorIndexService';

let isRegistered = false;

/**
 * 设置主窗口
 */
export function setWorkspaceVectorIndexMainWindow(window: BrowserWindow | null): void {
  workspaceVectorIndexService.setMainWindow(window);
}

/**
 * 注册 IPC 处理器
 */
export function registerWorkspaceVectorIndexHandlers(): void {
  if (isRegistered) {
    console.log('[WorkspaceVectorIndex IPC] 处理器已注册，跳过');
    return;
  }
  
  isRegistered = true;
  console.log('[WorkspaceVectorIndex IPC] 注册处理器...');

  // 开始索引
  ipcMain.handle('workspace-vector-index:start', async (event, workspacePath: string) => {
    try {
      await workspaceVectorIndexService.startIndexing(workspacePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[WorkspaceVectorIndex IPC] 启动索引失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // 停止索引
  ipcMain.handle('workspace-vector-index:stop', async () => {
    try {
      workspaceVectorIndexService.stop();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取进度
  ipcMain.handle('workspace-vector-index:get-progress', async () => {
    try {
      const progress = workspaceVectorIndexService.getProgress();
      return { success: true, data: progress };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  });

  // 删除文件索引（当文件被删除时调用）
  ipcMain.handle('workspace-vector-index:delete-file', async (event, filePath: string) => {
    try {
      await workspaceVectorIndexService.deleteFileIndex(filePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[WorkspaceVectorIndex IPC] 删除文件索引失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // 删除目录索引（当目录被删除时调用）
  ipcMain.handle('workspace-vector-index:delete-directory', async (event, dirPath: string) => {
    try {
      await workspaceVectorIndexService.deleteDirectoryIndex(dirPath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[WorkspaceVectorIndex IPC] 删除目录索引失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  // 索引单个文件（右键菜单"立即索引"）
  ipcMain.handle('workspace-vector-index:index-file', async (event, filePath: string) => {
    try {
      await workspaceVectorIndexService.indexSingleFile(filePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[WorkspaceVectorIndex IPC] 单文件索引失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  });

  console.log('[WorkspaceVectorIndex IPC] 处理器注册完成');
}
