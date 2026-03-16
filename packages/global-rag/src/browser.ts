/**
 * 全局 RAG 浏览器入口。
 * 仅导出 renderer 可安全使用的模块，避免将 Node 专属实现打进浏览器包。
 */

export * from './types.js';

export { Chunker } from './chunker/Chunker.js';
export type { ChunkerConfig } from './chunker/Chunker.js';
export { ParentChildChunker } from './chunker/ParentChildChunker.js';
export type {
  ParentChunk,
  ChildChunk,
  ParentChildChunkResult,
  ParentChildChunkerConfig,
} from './chunker/ParentChildChunker.js';

export { VectorStore } from './vector-store/VectorStore.js';
export { VectorStore as VectorStoreManager } from './vector-store/VectorStore.js';
export { ParentChildVectorStore } from './vector-store/ParentChildVectorStore.js';
export { ParentChildVectorStoreOptimized, BatchEmbeddingGenerator, PerformanceMonitor } from './vector-store/ParentChildVectorStoreOptimized.js';
export type {
  ParentDocument,
  ChildDocument,
  ParentChildSearchResult,
  AddParentChildDocumentsOptions,
  ParentChildSearchOptions,
} from './vector-store/ParentChildVectorStore.js';
export type { BatchProcessOptions } from './vector-store/ParentChildVectorStoreOptimized.js';
export type {
  DocumentMetadata,
  SearchResult,
  AddDocumentsOptions,
  SearchOptions,
} from './types.js';

export * from './rag/types.js';
export { RAGEngine } from './rag/RAGEngine.js';
export { ContextBuilder } from './rag/ContextBuilder.js';
export { PromptTemplate } from './rag/PromptTemplate.js';

export { FileParser } from './utils/FileParser.js';
export type { FileParseResult } from './utils/FileParser.js';
