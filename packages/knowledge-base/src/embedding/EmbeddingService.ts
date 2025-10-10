/**
 * 向量化服务
 */

import { EmbeddingProvider } from './EmbeddingProvider';
import { EmbeddingCache } from './EmbeddingCache';
import { EmbeddingResult, BatchEmbeddingResult, EmbeddingOptions } from './types';

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache?: EmbeddingCache;

  constructor(provider: EmbeddingProvider, enableCache = true) {
    this.provider = provider;
    if (enableCache) {
      this.cache = new EmbeddingCache();
    }
  }

  /**
   * 向量化单个文本
   */
  async embed(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
    const useCache = options?.cache !== false && this.cache;

    if (useCache) {
      const cached = await this.cache!.get(text);
      if (cached) {
        return cached;
      }
    }

    const result = await this.provider.embed(text, options);

    if (useCache) {
      await this.cache!.set(text, result);
    }

    return result;
  }

  /**
   * 批量向量化
   */
  async embedBatch(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult> {
    const batchSize = this.provider.getBatchSize();
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const result = await this.provider.embedBatch(batch, options);
      allEmbeddings.push(...result.embeddings);
    }

    return {
      embeddings: allEmbeddings,
      model: this.provider.getName(),
      dimensions: this.provider.getDimensions(),
    };
  }

  /**
   * 计算文本相似度
   */
  async computeSimilarity(text1: string, text2: string): Promise<number> {
    const [result1, result2] = await Promise.all([
      this.embed(text1),
      this.embed(text2),
    ]);

    return this.cosineSimilarity(result1.embedding, result2.embedding);
  }

  /**
   * 余弦相似度计算
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const mag1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }

  /**
   * 获取提供者信息
   */
  getProviderInfo() {
    return {
      name: this.provider.getName(),
      dimensions: this.provider.getDimensions(),
      batchSize: this.provider.getBatchSize(),
    };
  }

  /**
   * 清空缓存
   */
  async clearCache(): Promise<void> {
    if (this.cache) {
      await this.cache.clear();
    }
  }
}



















