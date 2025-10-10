/**
 * 搜索类型定义
 */

export interface SearchQuery {
  query: string;
  topK?: number;
  scoreThreshold?: number;
  filters?: SearchFilter[];
  searchType?: 'vector' | 'fulltext' | 'hybrid' | 'semantic';
  rerank?: boolean;
  rerankModel?: string;
}

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
}

export interface SearchHit {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, any>;
  highlights?: string[];
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
  maxScore: number;
  processingTime: number;
}



















