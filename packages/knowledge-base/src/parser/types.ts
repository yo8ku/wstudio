/**
 * 解析器类型定义
 */

export interface ParseResult {
  content: string;
  metadata: ParseMetadata;
  sections?: ParsedSection[];
}

export interface ParseMetadata {
  title?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
  language?: string;
  encoding?: string;
  pageCount?: number;
  wordCount?: number;
  [key: string]: any;
}

export interface ParsedSection {
  heading: string;
  level: number;
  content: string;
  startIndex: number;
  endIndex: number;
}

export interface ParserOptions {
  extractMetadata?: boolean;
  preserveFormatting?: boolean;
  extractImages?: boolean;
  extractLinks?: boolean;
  extractTables?: boolean;
  [key: string]: any;
}

export interface ParserConfig {
  name: string;
  fileTypes: string[];
  mimeTypes?: string[];
  priority?: number;
}




















