/**
 * 工作区索引 IPC 处理器
 */

import { ipcMain, BrowserWindow } from 'electron';
import { WorkspaceIndexService } from '../services/WorkspaceIndexService';

let indexService: WorkspaceIndexService | null = null;

// 防止重复注册的标志
let isRegistered = false;

function getIndexService(): WorkspaceIndexService {
  if (!indexService) {
    indexService = new WorkspaceIndexService();
  }
  return indexService;
}

/**
 * 获取索引服务实例（供外部使用）
 */
export function getWorkspaceIndexService(): WorkspaceIndexService {
  return getIndexService();
}

/**
 * 设置主窗口（用于发送进度事件）
 */
export function setWorkspaceIndexMainWindow(window: BrowserWindow | null): void {
  const service = getIndexService();
  service.setMainWindow(window);
}

/**
 * 注册工作区索引 IPC 处理器
 */
export function registerWorkspaceIndexHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    console.log('[WorkspaceIndex IPC] IPC 处理器已注册，跳过重复注册');
    return;
  }

  console.log('[WorkspaceIndex IPC] 开始注册工作区索引 IPC 处理器...');

  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'workspace-index:initialize',
    'workspace-index:index-workspace',
    'workspace-index:get-progress',
    'workspace-index:is-indexing',
    'workspace-index:search',
    'workspace-index:update-file',
    'workspace-index:delete-file',
    'workspace-index:get-stats',
    'workspace-index:clear'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  console.log('[WorkspaceIndex IPC] 已清理旧的 IPC 处理器');
  isRegistered = true;

  // 初始化索引服务
  ipcMain.handle('workspace-index:initialize', async () => {
    try {
      const service = getIndexService();
      await service.initialize();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 初始化索引服务失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 索引整个工作区
  ipcMain.handle('workspace-index:index-workspace', async (event, workspacePath: string) => {
    try {
      const service = getIndexService();
      const result = await service.indexWorkspace(workspacePath);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('[IPC] 索引工作区失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取索引进度
  ipcMain.handle('workspace-index:get-progress', async () => {
    try {
      const service = getIndexService();
      const progress = service.getIndexingProgress();
      return {
        success: true,
        data: progress
      };
    } catch (error) {
      console.error('[IPC] 获取索引进度失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 检查是否正在索引
  ipcMain.handle('workspace-index:is-indexing', async () => {
    try {
      const service = getIndexService();
      const isIndexing = service.isIndexingInProgress();
      return {
        success: true,
        data: isIndexing
      };
    } catch (error) {
      console.error('[IPC] 检查索引状态失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 搜索文件
  ipcMain.handle('workspace-index:search', async (event, options: {
    query: string;
    fileExtension?: string;
    language?: string;
    limit?: number;
  }) => {
    try {
      const service = getIndexService();
      const results = await service.search(options);
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error('[IPC] 搜索失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 更新单个文件的索引
  ipcMain.handle('workspace-index:update-file', async (event, filePath: string) => {
    try {
      const service = getIndexService();
      await service.updateFileIndex(filePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 更新文件索引失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 删除文件索引
  ipcMain.handle('workspace-index:delete-file', async (event, filePath: string) => {
    try {
      const service = getIndexService();
      await service.deleteFileIndex(filePath);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 删除文件索引失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取索引统计信息
  ipcMain.handle('workspace-index:get-stats', async () => {
    try {
      const service = getIndexService();
      const stats = await service.getIndexStats();
      return {
        success: true,
        data: stats
      };
    } catch (error) {
      console.error('[IPC] 获取索引统计信息失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 清空索引
  ipcMain.handle('workspace-index:clear', async () => {
    try {
      const service = getIndexService();
      await service.clearIndex();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 清空索引失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}

