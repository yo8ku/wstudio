/**
 * snippet.ts
 * 片段相关的共享类型定义
 */
export interface Snippet {
    id?: number;
    name: string;
    prefix: string;
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
//# sourceMappingURL=snippet.d.ts.map