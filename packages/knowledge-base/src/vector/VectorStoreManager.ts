/**
 * 向量存储管理器
 * 管理持久化和临时向量存储
 */

import { PythonBridge } from './bridge/PythonBridge';
import { VectorChunker } from './VectorChunker';

export interface DocumentMetadata {
  filePath?: string;
  fileName?: string;
  fileType?: string;
  chunkIndex?: number;
  totalChunks?: number;
  [key: string]: unknown;
}

export interface SearchResult {
  id: number;
  text: string;
  metadata: DocumentMetadata;
  score: number;
  storeType: 'persistent' | 'temporary';
}

export interface AddDocumentsOptions {
  storeType?: 'persistent' | 'temporary';
  sessionId?: string;
  modelName?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  chunkStrategy?: string;
}

export interface SearchOptions {
  topK?: number;
  storeTypes?: ('persistent' | 'temporary')[];
  sessionId?: string;
  modelName?: string;
  filterMetadata?: Record<string, unknown>;
}

export class VectorStoreManager {
  private bridge: PythonBridge;
  private chunker: VectorChunker;
  private defaultSessionId: string = 'default';

  constructor() {
    this.bridge = new PythonBridge();
    this.chunker = new VectorChunker();
  }

  /**
   * 初始化向量存储管理器
   */
  async initialize(): Promise<void> {
    await this.bridge.start();
    await this.chunker.initialize();
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
      storeType = 'temporary',
      sessionId = this.defaultSessionId,
      modelName,
      chunkSize,
      chunkOverlap,
      chunkStrategy = 'recursive',
    } = options;

    // 如果提供了分块参数，先对文本进行分块
    let processedTexts = texts;
    let processedMetadatas = metadatas;

    if (chunkSize && chunkOverlap !== undefined) {
      // 对每个文本进行分块
      const allChunks: string[] = [];
      const allChunkMetadatas: DocumentMetadata[] = [];

      for (let i = 0; i < texts.length; i++) {
        const text = texts[i];
        const metadata = metadatas[i] || {};

        try {
          const chunkResult = await this.chunker.chunkText(text, {
            chunkSize,
            chunkOverlap,
            strategy: chunkStrategy as 'recursive' | 'character' | 'token' | 'markdown' | 'python',
          });

          chunkResult.chunks.forEach((chunk, chunkIndex) => {
            allChunks.push(chunk.content);
            allChunkMetadatas.push({
              ...metadata,
              chunkIndex,
              totalChunks: chunkResult.totalChunks,
            });
          });
        } catch (error) {
          // 如果分块失败，使用原始文本
          console.warn(`[VectorStoreManager] 分块失败，使用原始文本:`, error);
          allChunks.push(text);
          allChunkMetadatas.push(metadata);
        }
      }

      processedTexts = allChunks;
      processedMetadatas = allChunkMetadatas;
    }

    // 确保文本和元数据数量一致
    if (processedTexts.length !== processedMetadatas.length) {
      // 如果元数据不足，用空对象填充
      while (processedMetadatas.length < processedTexts.length) {
        processedMetadatas.push({});
      }
    }

    // 调用Python服务添加文档
    const response = await this.bridge.request({
      method: 'add_documents_to_store',
      params: {
        texts: processedTexts,
        metadatas: processedMetadatas,
        store_type: storeType,
        session_id: sessionId,
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
      storeTypes,
      sessionId = this.defaultSessionId,
      modelName,
      filterMetadata,
    } = options;

    const response = await this.bridge.request({
      method: 'search_vector_store',
      params: {
        query,
        top_k: topK,
        store_types: storeTypes,
        session_id: sessionId,
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
   * 联合搜索（同时搜索持久化和临时存储）
   */
  async searchBoth(
    query: string,
    options: Omit<SearchOptions, 'storeTypes'> = {}
  ): Promise<SearchResult[]> {
    return this.search(query, {
      ...options,
      storeTypes: ['persistent', 'temporary'],
    });
  }

  /**
   * 删除文档
   */
  async deleteDocuments(
    ids: number[],
    storeType: 'persistent' | 'temporary' = 'temporary',
    sessionId: string = this.defaultSessionId
  ): Promise<boolean> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'delete_from_store',
      params: {
        ids,
        store_type: storeType,
        session_id: sessionId,
      },
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to delete documents from vector store');
    }

    return response.result as boolean;
  }

  /**
   * 清空临时存储
   */
  async clearTemporaryStore(sessionId: string = this.defaultSessionId): Promise<void> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'clear_temporary_store',
      params: {
        session_id: sessionId,
      },
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to clear temporary store');
    }
  }

  /**
   * 清空所有临时存储
   */
  async clearAllTemporaryStores(): Promise<void> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'clear_all_temporary_stores',
      params: {},
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to clear all temporary stores');
    }
  }

  /**
   * 设置默认会话ID
   */
  setDefaultSessionId(sessionId: string): void {
    this.defaultSessionId = sessionId;
  }

  /**
   * 关闭管理器
   */
  async close(): Promise<void> {
    await this.bridge.stop();
  }
}







