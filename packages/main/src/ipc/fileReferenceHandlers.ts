/**
 * 文件引用 IPC 处理器
 */

import { ipcMain } from 'electron';
import { FileReferenceService } from '../services/FileReferenceService';

// 全局文件引用服务实例
let fileReferenceService: FileReferenceService | null = null;

// 防止重复注册的标志
let isRegistered = false;

/**
 * 获取或创建文件引用服务实例
 */
function getFileReferenceService(): FileReferenceService {
  if (!fileReferenceService) {
    fileReferenceService = new FileReferenceService();
  }
  return fileReferenceService;
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

  try {
    // 移除可能存在的旧处理器（防止热重载时重复注册）
    const handlersToRemove = [
      'file-reference:add',
      'file-reference:search',
    ];

    for (const handler of handlersToRemove) {
      try {
        ipcMain.removeHandler(handler);
      } catch (e) {
        // 忽略未注册的处理器
      }
    }

    // 重置注册标志（因为我们已经移除了旧处理器）
    isRegistered = false;

    
    // 添加文件引用到向量存储
    ipcMain.handle('file-reference:add', async (event, filePath: string, content: string, options?: {
      modelName?: string;
    }) => {
      try {
        const service = getFileReferenceService();
        await service.initialize();
        const ids = await service.addFileReference(filePath, content, options);
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
  ipcMain.handle('file-reference:search', async (event, query: string, options?: {
    topK?: number;
    modelName?: string;
    filterMetadata?: Record<string, unknown>;
  }) => {
    try {
      const service = getFileReferenceService();
      await service.initialize();
      const results = await service.searchFileReferences(query, {
        topK: options?.topK,
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

    // 所有处理器注册完成后，设置注册标志
    isRegistered = true;
  } catch (error) {
    console.error('[FileReferenceHandlers] ❌ 注册 IPC 处理器时发生错误:', error);
    // 如果注册失败，重置标志以便下次重试
    isRegistered = false;
    // 不抛出错误，而是记录错误，允许应用继续运行
    // 这样即使第一次注册失败，第二次调用时也能重试
    console.error('[FileReferenceHandlers] 注册失败，但允许后续重试');
  }
}

