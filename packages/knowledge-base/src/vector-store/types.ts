/**
 * 向量存储类型定义
 */

export interface VectorStoreConfig {
  name: string;
  connectionString?: string;
  apiKey?: string;
  collectionName?: string;
  dimensions?: number;
  [key: string]: any;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
}

export interface VectorSearchOptions {
  topK?: number;
  scoreThreshold?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata?: Record<string, any>;
}



















