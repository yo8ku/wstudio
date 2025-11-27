/**
 * 向量文本分块器
 * 使用 Python LangChain 进行文本分块
 */

import { PythonBridge } from '../python/bridge/PythonBridge.js';
import { ChunkOptions, Chunk, VectorChunkResult } from '../types.js';

export interface ChunkerConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  strategy?: 'recursive' | 'character' | 'token' | 'markdown' | 'python';
}

export class Chunker {
  private bridge: PythonBridge;
  private defaultChunkSize: number;
  private defaultChunkOverlap: number;
  private defaultStrategy: 'recursive' | 'character' | 'token' | 'markdown' | 'python';

  constructor(config?: ChunkerConfig) {
    this.bridge = new PythonBridge();
    // 设置默认值，如果用户后续提供，可以修改
    this.defaultChunkSize = config?.chunkSize ?? 1000;
    this.defaultChunkOverlap = config?.chunkOverlap ?? 200;
    this.defaultStrategy = config?.strategy ?? 'recursive';
  }

  /**
   * 初始化分块器
   */
  async initialize(): Promise<void> {
    await this.bridge.start();
  }

  /**
   * 设置默认配置
   */
  setDefaultConfig(config: ChunkerConfig): void {
    if (config.chunkSize !== undefined) {
      this.defaultChunkSize = config.chunkSize;
    }
    if (config.chunkOverlap !== undefined) {
      this.defaultChunkOverlap = config.chunkOverlap;
    }
    if (config.strategy !== undefined) {
      this.defaultStrategy = config.strategy;
    }
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): ChunkerConfig {
    return {
      chunkSize: this.defaultChunkSize,
      chunkOverlap: this.defaultChunkOverlap,
      strategy: this.defaultStrategy,
    };
  }

  /**
   * 对文本进行分块
   */
  async chunkText(text: string, options?: ChunkOptions): Promise<VectorChunkResult> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'chunk_text',
      params: {
        text,
        chunk_size: options?.chunkSize ?? this.defaultChunkSize,
        chunk_overlap: options?.chunkOverlap ?? this.defaultChunkOverlap,
        strategy: options?.strategy ?? this.defaultStrategy,
        kwargs: {
          ...(options?.separators && { separators: options.separators }),
          ...(options?.separator && { separator: options.separator }),
          ...(options?.encodingName && { encoding_name: options.encodingName }),
        },
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to chunk text');
    }

    const chunks = response.result as Chunk[];
    return {
      chunks,
      totalChunks: chunks.length,
    };
  }

  /**
   * 对多个文档进行分块
   */
  async chunkDocuments(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    options?: ChunkOptions
  ): Promise<VectorChunkResult> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'chunk_documents',
      params: {
        documents,
        chunk_size: options?.chunkSize ?? this.defaultChunkSize,
        chunk_overlap: options?.chunkOverlap ?? this.defaultChunkOverlap,
        strategy: options?.strategy ?? this.defaultStrategy,
        kwargs: {
          ...(options?.separators && { separators: options.separators }),
          ...(options?.separator && { separator: options.separator }),
          ...(options?.encodingName && { encoding_name: options.encodingName }),
        },
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to chunk documents');
    }

    const chunks = response.result as Chunk[];
    return {
      chunks,
      totalChunks: chunks.length,
    };
  }

  /**
   * 关闭分块器
   */
  async close(): Promise<void> {
    await this.bridge.stop();
  }
}

