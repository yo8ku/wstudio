/**
 * 向量搜索
 */

import { BaseVectorStore } from '../vector-store/BaseVectorStore';
import { EmbeddingService } from '../embedding/EmbeddingService';
import { SearchQuery, SearchHit } from './types';

export class VectorSearch {
  private vectorStore: BaseVectorStore;
  private embeddingService: EmbeddingService;

  constructor(vectorStore: BaseVectorStore, embeddingService: EmbeddingService) {
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
  }

  /**
   * 向量搜索
   */
  async search(query: SearchQuery): Promise<SearchHit[]> {
    // 对查询进行向量化
    const { embedding } = await this.embeddingService.embed(query.query);

    // 执行向量搜索
    const results = await this.vectorStore.search(embedding, {
      topK: query.topK || 10,
      scoreThreshold: query.scoreThreshold,
    });

    // 转换为 SearchHit 格式
    return results.map((result) => ({
      id: result.id,
      score: result.score,
      content: result.metadata?.content || '',
      metadata: result.metadata,
    }));
  }

  /**
   * 语义搜索（带查询扩展）
   */
  async semanticSearch(query: SearchQuery): Promise<SearchHit[]> {
    // 可以在这里添加查询扩展逻辑
    return this.search(query);
  }
}




























































