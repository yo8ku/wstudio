/**
 * 全局RAG模块 - 统一导出
 */

// 类型定义
export * from './types.js';

// 文本分块器
export { Chunker } from './chunker/Chunker.js';
export type { ChunkerConfig } from './chunker/Chunker.js';
export { ParentChildChunker } from './chunker/ParentChildChunker.js';
export type {
  ParentChunk,
  ChildChunk,
  ParentChildChunkResult,
  ParentChildChunkerConfig,
} from './chunker/ParentChildChunker.js';

// 向量存储
export { VectorStore } from './vector-store/VectorStore.js';
// 向后兼容：导出 VectorStoreManager 作为 VectorStore 的别名
export { VectorStore as VectorStoreManager } from './vector-store/VectorStore.js';
export { ParentChildVectorStore } from './vector-store/ParentChildVectorStore.js';
// 注意：ParentChildVectorStorePersistent 只能在 Node.js 环境中使用
// 在浏览器环境中导入会导致错误，请使用动态导入
// export { ParentChildVectorStorePersistent } from './vector-store/ParentChildVectorStorePersistent.js';
export { ParentChildVectorStoreOptimized, BatchEmbeddingGenerator, PerformanceMonitor } from './vector-store/ParentChildVectorStoreOptimized.js';
// 父子索引向量入库服务
export { ParentChildVectorIngestion } from './vector-store/ParentChildVectorIngestion.js';
export type { ParentDatabase, VectorIngestionOptions, VectorIngestionResult } from './vector-store/ParentChildVectorIngestion.js';
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

// RAG引擎
export * from './rag/types.js';
export { RAGEngine } from './rag/RAGEngine.js';
export { ContextBuilder } from './rag/ContextBuilder.js';
export { PromptTemplate } from './rag/PromptTemplate.js';

// 文件解析工具
export { FileParser } from './utils/FileParser.js';
export type { FileParseResult } from './utils/FileParser.js';

