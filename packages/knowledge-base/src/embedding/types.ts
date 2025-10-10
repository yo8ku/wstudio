/**
 * 向量化类型定义
 */

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  metadata?: Record<string, any>;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
}

export interface EmbeddingProviderConfig {
  name: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  dimensions?: number;
  batchSize?: number;
  [key: string]: any;
}

export interface EmbeddingOptions {
  normalize?: boolean;
  cache?: boolean;
  timeout?: number;
}



















