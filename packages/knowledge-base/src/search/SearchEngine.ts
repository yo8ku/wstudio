/**
 * 搜索引擎
 */

import { HybridSearch } from './HybridSearch';
import { SearchQuery, SearchResponse } from './types';

export class SearchEngine {
  private hybridSearch: HybridSearch;

  constructor(hybridSearch: HybridSearch) {
    this.hybridSearch = hybridSearch;
  }

  /**
   * 执行搜索
   */
  async search(query: SearchQuery): Promise<SearchResponse> {
    const startTime = Date.now();
    let hits;

    switch (query.searchType) {
      case 'hybrid':
        hits = await this.hybridSearch.search(query);
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




































































