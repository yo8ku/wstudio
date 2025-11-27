/**
 * 向量存储管理器
 * 管理持久化向量存储
 */

import { PythonBridge } from '../python/bridge/PythonBridge.js';
import { DocumentMetadata, SearchResult, AddDocumentsOptions, SearchOptions, ProcessFilePathsOptions, ProcessFilePathsResult } from '../types.js';

export class VectorStore {
  private bridge: PythonBridge;

  constructor() {
    this.bridge = new PythonBridge();
  }

  /**
   * 初始化向量存储管理器
   */
  async initialize(): Promise<void> {
    try {
      await this.bridge.start();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 提供更友好的错误信息
      if (errorMessage.includes('Python') || errorMessage.includes('依赖') || errorMessage.includes('module')) {
        throw new Error(`Python 服务启动失败: ${errorMessage}`);
      }
      throw error;
    }
  }

  /**
   * 添加文档到向量存储
   */
  async addDocuments(
    texts: string[],
    metadatas: DocumentMetadata[],
    options: AddDocumentsOptions = {}
  ): Promise<number[]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const {
      modelName,
    } = options;

    // 确保文本和元数据数量一致
    const processedMetadatas = [...metadatas];
    if (processedMetadatas.length < texts.length) {
      // 如果元数据不足，用空对象填充
      while (processedMetadatas.length < texts.length) {
        processedMetadatas.push({});
      }
    }

    // 调用Python服务添加文档
    const response = await this.bridge.request({
      method: 'add_documents_to_store',
      params: {
        texts,
        metadatas: processedMetadatas,
        model_name: modelName,
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to add documents to vector store');
    }

    return response.result as number[];
  }

  /**
   * 添加文件到向量存储
   */
  async addFile(
    filePath: string,
    content: string,
    options: AddDocumentsOptions = {}
  ): Promise<number[]> {
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    const fileType = fileName.split('.').pop() || '';

    const metadata: DocumentMetadata = {
      filePath,
      fileName,
      fileType,
    };

    return this.addDocuments([content], [metadata], options);
  }

  /**
   * 搜索向量存储
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const {
      topK = 5,
      modelName,
      filterMetadata,
    } = options;

    const response = await this.bridge.request({
      method: 'search_vector_store',
      params: {
        query,
        top_k: topK,
        model_name: modelName,
        filter_metadata: filterMetadata,
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to search vector store');
    }

    return response.result as SearchResult[];
  }

  /**
   * 删除文档
   */
  async deleteDocuments(
    ids: number[]
  ): Promise<boolean> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'delete_from_store',
      params: {
        ids,
      },
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete documents from vector store');
    }

    return response.result as boolean;
  }

  /**
   * 根据元数据查询向量ID
   */
  async getIdsByMetadata(
    filterMetadata: Record<string, unknown>
  ): Promise<string[]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'get_ids_by_metadata',
      params: {
        filter_metadata: filterMetadata,
      },
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get vector IDs by metadata');
    }

    return response.result as string[];
  }

  /**
   * 处理文件路径列表（由 Python 端负责：加载、分块、嵌入、存储）
   * 前端只负责发送文件路径列表，不做任何处理
   */
  async processFilePaths(
    filePaths: string[],
    options: ProcessFilePathsOptions = {}
  ): Promise<ProcessFilePathsResult> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const {
      modelName,
      knowledgeBaseId,
      chunkSize = 1000,
      chunkOverlap = 200,
      strategy = 'recursive',
    } = options;

    try {
      console.log('[VectorStore] 开始处理文件路径:', {
        fileCount: filePaths.length,
        knowledgeBaseId,
        modelName,
        chunkSize,
        chunkOverlap,
        strategy,
      });

      const response = await this.bridge.request({
        method: 'process_file_paths',
        params: {
          file_paths: filePaths,
          model_name: modelName,
          knowledge_base_id: knowledgeBaseId,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
          strategy,
        },
      });

      if (!response.success || !response.result) {
        // 提供更详细的错误信息
        const errorMessage = response.error || 'Failed to process file paths';
        console.error('[VectorStore] 处理文件路径失败:', {
          error: errorMessage,
          fileCount: filePaths.length,
          filePaths: filePaths.slice(0, 3), // 只记录前3个文件路径
        });
        throw new Error(errorMessage);
      }

      const result = response.result as ProcessFilePathsResult;
      console.log('[VectorStore] 文件处理成功:', {
        processedCount: result.processedCount,
        fileCount: result.fileCount,
        errorCount: result.errors?.length || 0,
      });

      return result;
    } catch (error) {
      // 如果错误信息已经包含详细描述，直接抛出
      if (error instanceof Error) {
        console.error('[VectorStore] 处理文件路径异常:', {
          error: error.message,
          stack: error.stack,
          fileCount: filePaths.length,
        });
        throw error;
      }
      // 否则包装成 Error
      const errorMessage = `处理文件路径失败: ${String(error)}`;
      console.error('[VectorStore] 处理文件路径未知错误:', errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * 关闭管理器
   */
  async close(): Promise<void> {
    await this.bridge.stop();
  }
}


