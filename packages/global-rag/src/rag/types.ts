/**
 * RAG 类型定义
 */

export interface RAGConfig {
  maxContextLength?: number;
  maxSourceDocuments?: number;
  minRelevanceScore?: number;
  includeMetadata?: boolean;
  temperature?: number;
  model?: string;
  /** 父子索引专用：是否去重父块（多个子块属于同一父块时只返回一次） */
  deduplicateParents?: boolean;
}

export interface RAGContext {
  query: string;
  sources: ContextSource[];
  systemPrompt?: string;
  userPrompt?: string;
}

export interface ContextSource {
  content: string;
  metadata?: Record<string, unknown>;
  score: number;
}

export interface RAGResponse {
  answer: string;
  sources: ContextSource[];
  context: string;
  metadata?: Record<string, unknown>;
}


