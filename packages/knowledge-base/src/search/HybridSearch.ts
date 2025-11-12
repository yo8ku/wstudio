/**
 * 混合搜索（向量 + 全文）
 */

import { SearchQuery, SearchHit } from './types';

export class HybridSearch {
  constructor() {}

  /**
   * 混合搜索
   */
  async search(query: SearchQuery): Promise<SearchHit[]> {
    // 这里可以添加全文搜索并融合结果
    // const fulltextResults = await this.fulltextSearch(query);
    // return this.mergeResults(vectorResults, fulltextResults);

    return [];
  }

  /**
   * 融合搜索结果（RRF - Reciprocal Rank Fusion）
   */
  private mergeResults(results1: SearchHit[], results2: SearchHit[]): SearchHit[] {
    const merged = new Map<string, SearchHit>();

    // RRF 常数
    const k = 60;

    // 计算 RRF 分数
    results1.forEach((hit, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      merged.set(hit.id, {
        ...hit,
        score: rrfScore,
      });
    });

    results2.forEach((hit, rank) => {
      const rrfScore = 1 / (k + rank + 1);
      const existing = merged.get(hit.id);
      if (existing) {
        existing.score += rrfScore;
      } else {
        merged.set(hit.id, {
          ...hit,
          score: rrfScore,
        });
      }
    });

    // 排序并返回
    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
  }
}




































































