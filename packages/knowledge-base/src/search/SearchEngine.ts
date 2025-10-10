/**
 * 搜索引擎
 */

import { VectorSearch } from './VectorSearch';
import { HybridSearch } from './HybridSearch';
import { SearchQuery, SearchResponse } from './types';

export class SearchEngine {
  private vectorSearch: VectorSearch;
  private hybridSearch: HybridSearch;

  constructor(vectorSearch: VectorSearch, hybridSearch: HybridSearch) {
    this.vectorSearch = vectorSearch;
    this.hybridSearch = hybridSearch;
  }

  /**
   * 执行搜索
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    let hits;

    switch (query.searchType) {
      case 'vector':
        hits = await this.vectorSearch.search(query);
        break;
      case 'hybrid':
        hits = await this.hybridSearch.search(query);
        break;
      case 'semantic':
        hits = await this.vectorSearch.semanticSearch(query);
        break;
      default:
        hits = await this.hybridSearch.search(query);
    }

    const processingTime = Date.now() - startTime;
    const maxScore = hits.length > 0 ? Math.max(...hits.map((h) => h.score)) : 0;

    return {
      hits,
      total: hits.length,
      maxScore,
      processingTime,
    };
  }
}




























































