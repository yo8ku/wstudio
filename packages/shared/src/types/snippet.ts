/**
 * snippet.ts
 * 片段相关的共享类型定义
 */

export interface Snippet {
  id?: number;
  name: string;          // 片段名称，用于显示和区分片段
  prefix: string;        // 触发前缀（必填），用于自动补全，应该是独一无二的
  body: string;
  description?: string;
  language?: string;
  tags?: string;
}

export interface SnippetQuery {
  prefix?: string;
  language?: string;
  tags?: string[];
  limit?: number;
}

export interface SnippetAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

