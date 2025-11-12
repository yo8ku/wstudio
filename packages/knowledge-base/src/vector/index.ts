/**
 * 向量模块导出
 * 提供文本分块和向量化功能
 */

export { VectorChunker, type ChunkerConfig } from './VectorChunker';
export { VectorEmbedder } from './VectorEmbedder';
export { PythonBridge } from './bridge/PythonBridge';
export { VectorStoreManager } from './VectorStoreManager';
export type {
  DocumentMetadata,
  SearchResult,
  AddDocumentsOptions,
  SearchOptions,
} from './VectorStoreManager';
export * from './types';

