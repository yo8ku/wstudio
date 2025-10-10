/**
 * 向量化提供者抽象基类
 */

import { EmbeddingResult, BatchEmbeddingResult, EmbeddingProviderConfig, EmbeddingOptions } from './types';

export abstract class EmbeddingProvider {
  protected config: EmbeddingProviderConfig;

  constructor(config: EmbeddingProviderConfig) {
    this.config = config;
  }

  /**
   * 对单个文本进行向量化
   */
  abstract embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;

  /**
   * 批量向量化
   */
  abstract embedBatch(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult>;

  /**
   * 获取提供者名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取向量维度
   */
  getDimensions(): number {
    return this.config.dimensions || 1536; // OpenAI 默认维度
  }

  /**
   * 获取批处理大小
   */
  getBatchSize(): number {
    return this.config.batchSize || 100;
  }

  /**
   * 标准化向量
   */
  protected normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map((val) => val / magnitude);
  }
}



















