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
}

export interface RAGContext {
  query: string;
  sources: ContextSource[];
  systemPrompt?: string;
  userPrompt?: string;
}

export interface ContextSource {
  content: string;
  metadata?: Record<string, any>;
  score: number;
}

export interface RAGResponse {
  answer: string;
  sources: ContextSource[];
  context: string;
  metadata?: Record<string, any>;
}




























































