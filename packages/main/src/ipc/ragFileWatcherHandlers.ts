/**
 * RAG 文件监听 IPC 处理器
 * 处理 RAG 文件监听相关的 IPC 请求
 */

import { ipcMain } from 'electron';
import { RAGFileWatcherService } from '../services/RAGFileWatcherService';

let watcherService: RAGFileWatcherService | null = null;

function getWatcherService(): RAGFileWatcherService {
  if (!watcherService) {
    watcherService = new RAGFileWatcherService();
  }
  return watcherService;
}

/**
 * 获取监听服务实例（供外部使用）
 */
export function getRAGFileWatcherService(): RAGFileWatcherService {
  return getWatcherService();
}

/**
 * 注册 RAG 文件监听 IPC 处理器
 * 注意：前端不再使用这些 IPC 接口，但保留以备将来需要
 */
export function registerRAGFileWatcherHandlers(): void {
  // 设置工作区路径
  ipcMain.handle('rag-file-watcher:set-workspace', async (_event, workspacePath: string | null) => {
    try {
      const service = getWatcherService();
      service.setWorkspacePath(workspacePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 设置工作区路径失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 停止监听
  ipcMain.handle('rag-file-watcher:stop', async () => {
    try {
      const service = getWatcherService();
      service.stopWatching();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 停止监听失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取监听状态
  ipcMain.handle('rag-file-watcher:get-status', async () => {
    try {
      const service = getWatcherService();
      const status = service.getWatchingStatus();
      return {
        success: true,
        data: status
      };
    } catch (error) {
      console.error('[IPC] 获取监听状态失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[RAGFileWatcher IPC] IPC 处理器注册完成');
}



