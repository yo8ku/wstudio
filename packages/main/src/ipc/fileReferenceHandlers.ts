/**
 * 文件引用 IPC 处理器
 */

import { ipcMain } from 'electron';
import { FileReferenceService } from '../services/FileReferenceService';

// 全局文件引用服务实例（按会话ID管理）
const fileReferenceServices: Map<string, FileReferenceService> = new Map();

// 防止重复注册的标志
let isRegistered = false;

/**
 * 获取或创建文件引用服务实例
 */
function getFileReferenceService(sessionId: string = 'default'): FileReferenceService {
  if (!fileReferenceServices.has(sessionId)) {
    const service = new FileReferenceService(sessionId);
    fileReferenceServices.set(sessionId, service);
  }
  return fileReferenceServices.get(sessionId)!;
}

/**
 * 验证处理器是否已注册
 */
function isHandlerRegistered(handlerName: string): boolean {
  try {
    // 尝试获取处理器（如果存在）
    // 注意：Electron 的 ipcMain 没有直接的方法来检查处理器是否存在
    // 所以我们通过尝试移除它来检查（如果移除成功，说明存在）
    // 但实际上，我们无法直接检查，所以使用标志位 + 实际测试
    return isRegistered;
  } catch {
    return false;
  }
}

/**
 * 注册文件引用 IPC 处理器
 */
export function registerFileReferenceHandlers(): void {
  // 如果已注册，先检查关键处理器是否存在
  if (isRegistered) {
    // 尝试移除并重新注册，确保处理器确实存在
    // 这样可以处理热重载或异常情况
    console.log('[FileReferenceHandlers] 检测到已注册标志，验证并重新注册处理器...');
  } else {
    console.log('[FileReferenceHandlers] 开始注册 IPC 处理器...');
  }

  try {
    // 移除可能存在的旧处理器（防止热重载时重复注册）
    const handlersToRemove = [
      'file-reference:add',
      'file-reference:search',
      'file-reference:search-both',
      'file-reference:clear-temporary',
      'file-reference:set-session'
    ];

    for (const handler of handlersToRemove) {
      try {
        ipcMain.removeHandler(handler);
        console.log(`[FileReferenceHandlers] 已移除旧处理器: ${handler}`);
      } catch (e) {
        // 忽略未注册的处理器
        console.log(`[FileReferenceHandlers] 处理器 ${handler} 不存在，跳过移除`);
      }
    }

    // 重置注册标志（因为我们已经移除了旧处理器）
    isRegistered = false;

    console.log('[FileReferenceHandlers] 已清理旧的 IPC 处理器');
    
    // 添加文件引用到向量存储
    ipcMain.handle('file-reference:add', async (event, filePath: string, content: string, storeType: 'persistent' | 'temporary' = 'temporary', sessionId: string = 'default', options?: {
    modelName?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    chunkStrategy?: string;
  }) => {
    try {
      const service = getFileReferenceService(sessionId);
      await service.initialize();
      const ids = await service.addFileReference(filePath, content, storeType, options);
      return { success: true, data: ids };
    } catch (error) {
      console.error('[IPC] 添加文件引用失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 搜索文件引用
  ipcMain.handle('file-reference:search', async (event, query: string, sessionId: string = 'default', options?: {
    topK?: number;
    storeTypes?: ('persistent' | 'temporary')[];
    modelName?: string;
    filterMetadata?: Record<string, unknown>;
  }) => {
    try {
      const service = getFileReferenceService(sessionId);
      await service.initialize();
      const results = await service.searchFileReferences(query, {
        topK: options?.topK,
        storeTypes: options?.storeTypes,
        modelName: options?.modelName,
        filterMetadata: options?.filterMetadata,
      });
      return { success: true, data: results };
    } catch (error) {
      console.error('[IPC] 搜索文件引用失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 联合搜索（同时搜索持久化和临时存储）
  ipcMain.handle('file-reference:search-both', async (event, query: string, sessionId: string = 'default', options?: {
    topK?: number;
    modelName?: string;
    filterMetadata?: Record<string, unknown>;
  }) => {
    try {
      const service = getFileReferenceService(sessionId);
      await service.initialize();
      const results = await service.searchBoth(query, {
        topK: options?.topK,
        modelName: options?.modelName,
        filterMetadata: options?.filterMetadata,
      });
      return { success: true, data: results };
    } catch (error) {
      console.error('[IPC] 联合搜索文件引用失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 清空临时存储
  ipcMain.handle('file-reference:clear-temporary', async (event, sessionId: string = 'default') => {
    try {
      const service = getFileReferenceService(sessionId);
      await service.initialize();
      await service.clearTemporaryStore();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 清空临时存储失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // 设置会话ID
  ipcMain.handle('file-reference:set-session', async (event, sessionId: string) => {
    try {
      const service = getFileReferenceService(sessionId);
      await service.setSessionId(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 设置会话ID失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

    // 所有处理器注册完成后，设置注册标志
    isRegistered = true;
    console.log('[FileReferenceHandlers] ✅ 所有 IPC 处理器注册完成！');
    console.log('[FileReferenceHandlers] 已注册的处理器: file-reference:add, file-reference:search, file-reference:search-both, file-reference:clear-temporary, file-reference:set-session');
  } catch (error) {
    console.error('[FileReferenceHandlers] ❌ 注册 IPC 处理器时发生错误:', error);
    // 如果注册失败，重置标志以便下次重试
    isRegistered = false;
    // 不抛出错误，而是记录错误，允许应用继续运行
    // 这样即使第一次注册失败，第二次调用时也能重试
    console.error('[FileReferenceHandlers] 注册失败，但允许后续重试');
  }
}

