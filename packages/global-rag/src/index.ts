/**
 * 全局RAG模块 - 统一导出
 */

// 类型定义
export * from './types.js';

// Python桥接器
export { PythonBridge } from './python/bridge/PythonBridge.js';

// 注意：Chunker 和 Embedder 已不再导出，分块和嵌入由 Python 端处理
// 如需使用，请直接导入：import { Chunker } from '@note-studio/global-rag/chunker/Chunker.js'

// 向量存储
export { VectorStore } from './vector-store/VectorStore.js';
// 向后兼容：导出 VectorStoreManager 作为 VectorStore 的别名
export { VectorStore as VectorStoreManager } from './vector-store/VectorStore.js';
export type {
  DocumentMetadata,
  SearchResult,
  AddDocumentsOptions,
  SearchOptions,
  ProcessFilePathsOptions,
  ProcessFilePathsResult,
} from './types.js';

// RAG引擎
export * from './rag/types.js';
export { RAGEngine } from './rag/RAGEngine.js';
export { ContextBuilder } from './rag/ContextBuilder.js';
export { PromptTemplate } from './rag/PromptTemplate.js';

// 文件解析工具
export { FileParser } from './utils/FileParser.js';
export type { FileParseResult } from './utils/FileParser.js';

