/**
 * Knowledge Base System - 统一导出
 */

// 核心模块
export * from './core/types';
export { KnowledgeBase } from './core/KnowledgeBase';
export { KnowledgeBaseManager } from './core/KnowledgeBaseManager';

// 解析器
export * from './parser/types';
export { BaseParser } from './parser/BaseParser';
export { ParserRegistry } from './parser/ParserRegistry';
export { MarkdownParser } from './parser/parsers/MarkdownParser';
export { TextParser } from './parser/parsers/TextParser';
export { PDFParser } from './parser/parsers/PDFParser';
export { HTMLParser } from './parser/parsers/HTMLParser';
export { DocxParser } from './parser/parsers/DocxParser';
export { CodeParser } from './parser/parsers/CodeParser';

// 分块器
export * from './chunker/types';
export { BaseChunker } from './chunker/BaseChunker';
export { ChunkerRegistry } from './chunker/ChunkerRegistry';
export { SentenceChunker } from './chunker/chunkers/SentenceChunker';
export { ParagraphChunker } from './chunker/chunkers/ParagraphChunker';
export { SlidingWindowChunker } from './chunker/chunkers/SlidingWindowChunker';
export { MarkdownChunker } from './chunker/chunkers/MarkdownChunker';
export { SemanticChunker } from './chunker/chunkers/SemanticChunker';


// 导入
export { ImportService } from './import/ImportService';
export { FileScanner } from './import/FileScanner';
export { BatchImporter } from './import/BatchImporter';
export { ImportQueue } from './import/ImportQueue';
export type { ImportOptions, ImportProgress } from './import/ImportService';
export type { ScanOptions } from './import/FileScanner';

// 索引
export { IndexManager } from './indexer/IndexManager';
export { FullTextIndex } from './indexer/FullTextIndex';
export { MetadataIndex } from './indexer/MetadataIndex';

// 搜索
export type { SearchQuery, SearchHit, SearchResponse } from './search/types';
export { SearchEngine } from './search/SearchEngine';
export { HybridSearch } from './search/HybridSearch';

// RAG
export * from './rag/types';
export { RAGEngine } from './rag/RAGEngine';
export { ContextBuilder } from './rag/ContextBuilder';
export { PromptTemplate } from './rag/PromptTemplate';

// 元数据
export { MetadataExtractor } from './metadata/MetadataExtractor';
export { MetadataManager } from './metadata/MetadataManager';
export type { FileMetadata } from './metadata/MetadataExtractor';

// 存储
export { DocumentStore } from './storage/DocumentStore';

// 同步
export { SyncManager } from './sync/SyncManager';
export { FileWatcher } from './sync/FileWatcher';
export { DeltaSync } from './sync/DeltaSync';
export type { SyncOptions } from './sync/SyncManager';

// 工具
export { TextUtils } from './utils/TextUtils';
export { Logger, LogLevel } from './utils/Logger';

// 向量模块
export { VectorChunker, type ChunkerConfig } from './vector/VectorChunker';
export { VectorEmbedder } from './vector/VectorEmbedder';
export { PythonBridge } from './vector/bridge/PythonBridge';
export { VectorStoreManager } from './vector/VectorStoreManager';
export type { ChunkOptions, Chunk, VectorChunkResult, PythonServiceRequest, PythonServiceResponse, ModelInfo, EmbeddingResult, SimilarityResult } from './vector/types';
export type { DocumentMetadata, SearchResult, AddDocumentsOptions, SearchOptions } from './vector/VectorStoreManager';




















