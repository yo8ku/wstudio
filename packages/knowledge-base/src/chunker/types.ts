/**
 * 分块器类型定义
 */

export interface ChunkResult {
  chunks: TextChunk[];
  metadata?: ChunkingMetadata;
}

export interface TextChunk {
  content: string;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, any>;
}

export interface ChunkingMetadata {
  totalChunks: number;
  avgChunkSize: number;
  strategy: string;
  [key: string]: any;
}

export interface ChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  preserveSentences?: boolean;
  preserveParagraphs?: boolean;
  customDelimiters?: string[];
  [key: string]: any;
}

export interface ChunkerConfig {
  name: string;
  defaultChunkSize?: number;
  defaultOverlap?: number;
}




















