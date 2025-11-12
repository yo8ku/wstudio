/**
 * 核心类型定义
 */

export interface KnowledgeBaseConfig {
  id: string;
  name: string;
  description?: string;
  storagePath: string;
  
  // 分块配置
  chunkStrategy?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  
  // 索引配置
  enableFullTextIndex?: boolean;
  enableMetadataIndex?: boolean;
  enableGraphIndex?: boolean;
  
  // 其他配置
  autoSync?: boolean;
  metadata?: Record<string, any>;
}

export interface Document {
  id: string;
  knowledgeBaseId: string;
  title: string;
  content: string;
  filePath?: string;
  fileType?: string;
  fileSize?: number;
  hash?: string;
  metadata: DocumentMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentMetadata {
  author?: string;
  tags?: string[];
  category?: string;
  language?: string;
  source?: string;
  [key: string]: any;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  knowledgeBaseId: string;
  content: string;
  embedding?: number[];
  position: number;
  metadata: ChunkMetadata;
  createdAt: Date;
}

export interface ChunkMetadata {
  startIndex: number;
  endIndex: number;
  type?: string;
  heading?: string;
  [key: string]: any;
}

export interface SearchOptions {
  query: string;
  topK?: number;
  scoreThreshold?: number;
  filters?: SearchFilter[];
  searchType?: 'vector' | 'fulltext' | 'hybrid' | 'semantic';
  includeMetadata?: boolean;
  rerank?: boolean;
}

export interface SearchFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
  value: any;
}

export interface SearchResult {
  chunk: DocumentChunk;
  document: Document;
  score: number;
  highlights?: string[];
}

export interface ImportOptions {
  parseStrategy?: string;
  chunkStrategy?: string;
  extractMetadata?: boolean;
  skipDuplicates?: boolean;
  batchSize?: number;
}

export interface ImportProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentFile?: string;
}

export interface SyncOptions {
  watch?: boolean;
  interval?: number;
  deleteRemoved?: boolean;
}

export enum KnowledgeBaseStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  INDEXING = 'indexing',
  SYNCING = 'syncing',
  ERROR = 'error'
}

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  INDEXED = 'indexed',
  FAILED = 'failed'
}




















