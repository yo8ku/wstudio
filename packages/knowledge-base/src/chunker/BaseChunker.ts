/**
 * 分块器基类
 */

import { ChunkResult, ChunkerOptions, ChunkerConfig } from './types';

export abstract class BaseChunker {
  protected config: ChunkerConfig;

  constructor(config: ChunkerConfig) {
    this.config = config;
  }

  /**
   * 对文本进行分块
   */
  abstract chunk(text: string, options?: ChunkerOptions): Promise<ChunkResult>;

  /**
   * 获取分块器名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取默认分块大小
   */
  getDefaultChunkSize(): number {
    return this.config.defaultChunkSize || 1000;
  }

  /**
   * 获取默认重叠大小
   */
  getDefaultOverlap(): number {
    return this.config.defaultOverlap || 200;
  }

  /**
   * 计算分块统计信息
   */
  protected calculateMetadata(chunks: any[]): any {
    const totalChunks = chunks.length;
    const avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0) / totalChunks;

    return {
      totalChunks,
      avgChunkSize: Math.round(avgChunkSize),
      strategy: this.getName(),
    };
  }

  /**
   * 验证和标准化选项
   */
  protected normalizeOptions(options?: ChunkerOptions): Required<ChunkerOptions> {
    return {
      chunkSize: options?.chunkSize || this.getDefaultChunkSize(),
      chunkOverlap: options?.chunkOverlap || this.getDefaultOverlap(),
      minChunkSize: options?.minChunkSize || 100,
      maxChunkSize: options?.maxChunkSize || 5000,
      preserveSentences: options?.preserveSentences ?? true,
      preserveParagraphs: options?.preserveParagraphs ?? false,
      customDelimiters: options?.customDelimiters || [],
      ...options,
    };
  }
}




















