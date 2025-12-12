/**
 * 向量文本分块器
 * 本地实现，不依赖 Python
 */

import { ChunkOptions, Chunk, VectorChunkResult } from '../types.js';

export interface ChunkerConfig {
  chunkSize?: number;
  chunkOverlap?: number;
  strategy?: 'recursive' | 'character' | 'token' | 'markdown' | 'python';
}

export class Chunker {
  private defaultChunkSize: number;
  private defaultChunkOverlap: number;
  private defaultStrategy: 'recursive' | 'character' | 'token' | 'markdown' | 'python';

  constructor(config?: ChunkerConfig) {
    this.defaultChunkSize = config?.chunkSize ?? 1000;
    this.defaultChunkOverlap = config?.chunkOverlap ?? 200;
    this.defaultStrategy = config?.strategy ?? 'recursive';
  }

  /**
   * 初始化分块器
   */
  async initialize(): Promise<void> {
    // 本地实现，无需初始化
    console.log('[Chunker] 本地分块器已初始化');
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
   * 对文本进行分块（递归策略）
   */
  async chunkText(text: string, options?: ChunkOptions): Promise<VectorChunkResult> {
    const chunkSize = options?.chunkSize ?? this.defaultChunkSize;
    const chunkOverlap = options?.chunkOverlap ?? this.defaultChunkOverlap;
    const separators = options?.separators ?? ['\n\n', '\n', '。', '！', '？', '.', '!', '?', ' ', ''];

    const chunks = this.recursiveSplit(text, separators, chunkSize, chunkOverlap);

    return {
      chunks: chunks.map((content, index) => ({
        id: `chunk_${index}`,
        content,
        metadata: {
          chunk_index: index,
          chunk_size: content.length,
        },
      })),
      totalChunks: chunks.length,
    };
  }

  /**
   * 递归切分文本
   */
  private recursiveSplit(
    text: string,
    separators: string[],
    chunkSize: number,
    chunkOverlap: number
  ): string[] {
    const chunks: string[] = [];

    if (text.length <= chunkSize) {
      return [text];
    }

    // 尝试使用分隔符切分
    for (const separator of separators) {
      if (separator === '') {
        // 最后的备选方案：按字符切分
        return this.splitBySize(text, chunkSize, chunkOverlap);
      }

      if (text.includes(separator)) {
        const splits = text.split(separator);
        let currentChunk = '';

        for (const split of splits) {
          const testChunk = currentChunk
            ? currentChunk + separator + split
            : split;

          if (testChunk.length <= chunkSize) {
            currentChunk = testChunk;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
              // 添加重叠
              const overlapStart = Math.max(
                0,
                currentChunk.length - chunkOverlap
              );
              currentChunk = currentChunk.substring(overlapStart) + separator + split;
            } else {
              // 单个 split 太大，需要进一步切分
              const subChunks = this.recursiveSplit(
                split,
                separators.slice(1),
                chunkSize,
                chunkOverlap
              );
              chunks.push(...subChunks);
              currentChunk = '';
            }
          }
        }

        if (currentChunk) {
          chunks.push(currentChunk);
        }

        return chunks;
      }
    }

    // 如果没有找到分隔符，按大小切分
    return this.splitBySize(text, chunkSize, chunkOverlap);
  }

  /**
   * 按固定大小切分文本
   */
  private splitBySize(
    text: string,
    chunkSize: number,
    chunkOverlap: number
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      chunks.push(text.substring(start, end));
      start = end - chunkOverlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * 对多个文档进行分块
   */
  async chunkDocuments(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    options?: ChunkOptions
  ): Promise<VectorChunkResult> {
    const allChunks: Chunk[] = [];
    let totalIndex = 0;

    for (const doc of documents) {
      const result = await this.chunkText(doc.content, options);
      for (const chunk of result.chunks) {
        allChunks.push({
          ...chunk,
          id: `chunk_${totalIndex}`,
          metadata: {
            ...chunk.metadata,
            ...doc.metadata,
            chunk_index: totalIndex,
          },
        });
        totalIndex++;
      }
    }

    return {
      chunks: allChunks,
      totalChunks: allChunks.length,
    };
  }

  /**
   * 关闭分块器
   */
  async close(): Promise<void> {
    // 本地实现，无需关闭
    console.log('[Chunker] 分块器已关闭');
  }
}
