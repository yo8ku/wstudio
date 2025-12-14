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

  console.log('[WorkspaceVectorIndex IPC] 处理器注册完成');
}
