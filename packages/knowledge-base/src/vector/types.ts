/**
 * 向量相关类型定义
 */

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  strategy?: 'recursive' | 'character' | 'token' | 'markdown' | 'python';
  separators?: string[];
  separator?: string;
  encodingName?: string;
  [key: string]: any;
}

export interface Chunk {
  id: string;
  content: string;
  metadata: {
    chunk_index: number;
    chunk_size: number;
    [key: string]: any;
  };
}

export interface VectorChunkResult {
  chunks: Chunk[];
  totalChunks: number;
}

export interface PythonServiceRequest {
  method: string;
  params: Record<string, any>;
}

export interface PythonServiceResponse {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * 模型信息
 */
export interface ModelInfo {
  model_name: string;
  status: 'loaded' | 'error' | 'not_found' | 'unloaded';
  dimension?: number;
  error?: string;
}

/**
 * 向量嵌入结果
 */
export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  embeddings?: number[][];
  dimension?: number;
  count?: number;
  model_name?: string;
  error?: string;
}

/**
 * 相似度计算结果
 */
export interface SimilarityResult {
  success: boolean;
  similarity?: number[][];
  similarity_type?: 'cosine' | 'dot_product' | 'euclidean';
  error?: string;
}

