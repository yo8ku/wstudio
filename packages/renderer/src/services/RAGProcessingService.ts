/**
 * RAG 处理服务
 * 简化版本：只负责发送文件路径列表给 Python 端处理
 * Python 端负责：加载、分块、嵌入、存储
 */

import { VectorStore, ProcessFilePathsResult, ProcessFilePathsOptions } from '@note-studio/global-rag';
import { knowledgeBaseService } from '../components/Layout/Sidebar/KnowledgeBase/knowledgeBaseService';

class RAGProcessingService {
  private static instance: RAGProcessingService;
  private vectorStore: VectorStore | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): RAGProcessingService {
    if (!RAGProcessingService.instance) {
      RAGProcessingService.instance = new RAGProcessingService();
    }
    return RAGProcessingService.instance;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 只初始化向量存储（用于与 Python 端通信）
      this.vectorStore = new VectorStore();
      await this.vectorStore.initialize();

      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 上传文件列表到知识库
   * 等待后台处理完成（加载、分块、嵌入、存储）
   * @param filePaths 文件路径列表
   * @param knowledgeBaseId 知识库ID
   * @param options 可选的处理选项
   * @param onProgress 进度回调函数，参数为 (filePath: string, progress: number)
   */
  async uploadFilesToKnowledgeBase(
    filePaths: string[],
    knowledgeBaseId: string,
    options?: Omit<ProcessFilePathsOptions, 'knowledgeBaseId'>,
    onProgress?: (filePath: string, progress: number) => void
  ): Promise<{ success: boolean; filePaths: string[] }> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.vectorStore) {
        throw new Error('向量存储未初始化');
      }

      if (filePaths.length === 0) {
        return {
          success: true,
          filePaths: [],
        };
      }

      // 等待后台处理完成
      await this.processFilesInBackground(filePaths, knowledgeBaseId, options, onProgress);

      return {
        success: true,
        filePaths,
      };
    } catch (error) {
      // 确保错误信息能够正确传递
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[RAGProcessingService] uploadFilesToKnowledgeBase 失败:', errorMessage);
      throw error;
    }
  }

  /**
   * 后台处理文件（异步）
   */
  private async processFilesInBackground(
    filePaths: string[],
    knowledgeBaseId: string,
    options?: Omit<ProcessFilePathsOptions, 'knowledgeBaseId'>,
    onProgress?: (filePath: string, progress: number) => void
  ): Promise<void> {
    try {
      // 检查 vectorStore 和方法是否存在
      if (!this.vectorStore) {
        throw new Error('向量存储未初始化');
      }

      // 检查方法是否存在
      if (typeof this.vectorStore.processFilePaths !== 'function') {
        const prototype = Object.getPrototypeOf(this.vectorStore);
        const store = this.vectorStore as unknown as Record<string, unknown>;
        const methods = Object.getOwnPropertyNames(prototype).filter(
          name => typeof store[name] === 'function'
        );
        throw new Error(`processFilePaths 方法不存在。可用方法: ${methods.join(', ')}`);
      }

      // 获取知识库配置（嵌入模型、分块参数等）
      let embeddingModel: string | undefined;
      let chunkSize: number | undefined;
      let chunkOverlap: number | undefined;
      
      try {
        const knowledgeBase = await knowledgeBaseService.findItem(knowledgeBaseId);
        if (knowledgeBase?.metadata) {
          embeddingModel = knowledgeBase.metadata.embeddingModel;
          chunkSize = knowledgeBase.metadata.chunkSettings?.chunkSize;
          chunkOverlap = knowledgeBase.metadata.chunkSettings?.chunkOverlap;
        }
      } catch (error) {
        console.warn('[RAGProcessingService] 获取知识库配置失败，使用默认配置:', error);
      }
      
      // 如果没有配置嵌入模型，使用默认值
      if (!embeddingModel) {
        embeddingModel = 'BAAI/bge-large-zh-v1.5';
        console.log('[RAGProcessingService] 知识库未配置嵌入模型，使用默认模型:', embeddingModel);
      }

      // 启动进度模拟器（从10%到90%）
      const progressIntervals: NodeJS.Timeout[] = [];
      const fileProgressMap = new Map<string, number>();
      
      // 初始化所有文件的进度为10%
      filePaths.forEach((filePath) => {
        fileProgressMap.set(filePath, 10);
        if (onProgress) {
          onProgress(filePath, 10);
        }
      });
      
      // 为所有文件启动一个统一的进度模拟器
      // 从10%逐步增加到90%，平均分配给所有文件
      let currentProgress = 10;
      const targetProgress = 90;
      const progressStep = 2; // 每次增加2%
      const updateInterval = 500; // 每500ms更新一次
      
      const interval = setInterval(() => {
        currentProgress += progressStep;
        if (currentProgress < targetProgress) {
          // 更新所有文件的进度
          filePaths.forEach((filePath) => {
            const oldProgress = fileProgressMap.get(filePath) || 10;
            const newProgress = Math.min(Math.floor(currentProgress), targetProgress);
            if (newProgress > oldProgress) {
              fileProgressMap.set(filePath, newProgress);
              if (onProgress) {
                onProgress(filePath, newProgress);
              }
            }
          });
        } else {
          // 达到目标进度，停止模拟
          clearInterval(interval);
        }
      }, updateInterval);
      
      progressIntervals.push(interval);

      // 调用 Python 端处理文件
      console.log('[RAGProcessingService] 开始调用 Python 端处理文件:', {
        fileCount: filePaths.length,
        knowledgeBaseId,
        embeddingModel,
        chunkSize: chunkSize || options?.chunkSize,
        chunkOverlap: chunkOverlap || options?.chunkOverlap,
      });

      let result: ProcessFilePathsResult;
      try {
        result = await this.vectorStore.processFilePaths(filePaths, {
          ...options,
          knowledgeBaseId: knowledgeBaseId,
          modelName: embeddingModel, // 传递嵌入模型名称
          chunkSize: chunkSize || options?.chunkSize, // 传递分块大小
          chunkOverlap: chunkOverlap || options?.chunkOverlap, // 传递分块重叠大小
        });
      } catch (error) {
        // 清除所有进度定时器
        progressIntervals.forEach(interval => clearInterval(interval));
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[RAGProcessingService] Python 端处理文件失败:', {
          error: errorMessage,
          fileCount: filePaths.length,
          filePaths: filePaths.slice(0, 3), // 只记录前3个文件路径
        });
        throw error;
      }

      // 清除所有进度定时器
      progressIntervals.forEach(interval => clearInterval(interval));

      console.log('[RAGProcessingService] Python 端处理完成:', {
        processedCount: result.processedCount,
        fileCount: result.fileCount,
        errorCount: result.errors?.length || 0,
      });

      // 检查处理结果是否有错误
      if (result.errors && result.errors.length > 0) {
        const errorMessage = `处理文件时发生错误: ${result.errors.join('; ')}`;
        console.error('[RAGProcessingService] 处理结果包含错误:', {
          errors: result.errors,
          fileCount: filePaths.length,
        });
        throw new Error(errorMessage);
      }

      // 检查处理的文件数量是否匹配
      if (result.processedCount !== filePaths.length) {
        console.warn('[RAGProcessingService] 处理文件数量不匹配:', {
          expected: filePaths.length,
          actual: result.processedCount,
        });
      }

      // 更新所有文件为100%
      if (onProgress) {
        filePaths.forEach(filePath => {
          onProgress(filePath, 100);
        });
      }
    } catch (error) {
      // 清除所有进度定时器
      if (onProgress) {
        filePaths.forEach(filePath => {
          onProgress(filePath, 0); // 错误时设置为0，由调用方处理error状态
        });
      }
      // 静默处理错误
      throw error;
    }
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    try {
      if (this.vectorStore) {
        await this.vectorStore.close();
        this.vectorStore = null;
      }
      this.isInitialized = false;
    } catch (error) {
      // 静默处理错误
    }
  }
}

export const ragProcessingService = RAGProcessingService.getInstance();

