/**
 * 知识库向量入库 IPC 处理器
 * 功能：处理知识库文件的上传、切分、向量化、入库请求
 */

import { ipcMain } from 'electron';
import { KnowledgeBaseVectorIngestionService } from '../services/KnowledgeBaseVectorIngestionService.js';
import { VectorIngestionOptions } from '@note-studio/global-rag';

// 使用子进程版本的 Embedding 服务（避免阻塞主进程）
// eslint-disable-next-line @typescript-eslint/no-require-imports
const embeddingWorkerService = require('../services/EmbeddingWorkerService.js');

/**
 * 子进程 Embedding API 适配器
 * 将 EmbeddingWorkerService 的接口适配为 EmbeddingAPI 接口
 */
class EmbeddingAPIAdapter {
  async embedText(text: string): Promise<number[]> {
    const result = await embeddingWorkerService.generateEmbedding(text);
    return result.vectors;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const results = await embeddingWorkerService.generateBatchEmbeddings(texts);
    return results.map((r: { vectors: number[] }) => r.vectors);
  }
}

// 防止重复注册的标志
let isRegistered = false;

/**
 * 获取知识库向量入库服务实例
 */
function getService(): KnowledgeBaseVectorIngestionService {
  return KnowledgeBaseVectorIngestionService.getInstance();
}

/**
 * 注册知识库向量入库 IPC 处理器
 */
export function registerKnowledgeBaseVectorIngestionHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  try {
    // 移除可能存在的旧处理器（防止热重载时重复注册）
    const handlersToRemove = [
      'knowledge-base:process-file',
      'knowledge-base:process-files',
    ];

    for (const handler of handlersToRemove) {
      try {
        ipcMain.removeHandler(handler);
      } catch (e) {
        // 忽略未注册的处理器
      }
    }

    // 处理单个文件
    ipcMain.handle('knowledge-base:process-file', async (
      event,
      filePath: string,
      knowledgeBaseId: string,
      options?: VectorIngestionOptions
    ) => {
      try {
        const service = getService();
        await service.initialize();

        // 使用子进程 Embedding API（不阻塞主进程）
        const embeddingAPI = new EmbeddingAPIAdapter();

        // 处理文件
        const result = await service.processFile(
          filePath,
          knowledgeBaseId,
          embeddingAPI,
          options
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('[IPC] 处理知识库文件失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 批量处理多个文件
    ipcMain.handle('knowledge-base:process-files', async (
      event,
      filePaths: string[],
      knowledgeBaseId: string,
      options?: VectorIngestionOptions
    ) => {
      try {
        const service = getService();
        await service.initialize();

        // 使用子进程 Embedding API（不阻塞主进程）
        const embeddingAPI = new EmbeddingAPIAdapter();

        // 处理文件（注意：进度回调需要通过其他方式传递，例如通过事件）
        const result = await service.processFiles(
          filePaths,
          knowledgeBaseId,
          embeddingAPI,
          options
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        console.error('[IPC] 批量处理知识库文件失败:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // 所有处理器注册完成后，设置注册标志
    isRegistered = true;
    console.log('[IPC] 知识库向量入库处理器已注册');
  } catch (error) {
    console.error('[IPC] 注册知识库向量入库处理器失败:', error);
    isRegistered = false;
  }
}


