/**
 * 索引类型定义
 */

export interface IndexConfig {
  type: 'fulltext' | 'metadata' | 'graph';
  enableCache?: boolean;
}

export interface IndexStats {
  totalEntries: number;
  indexSize: number;
  lastUpdated: Date;
}




































































