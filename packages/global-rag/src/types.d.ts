/**
 * 全局RAG模块类型定义
 */
export interface ChunkOptions {
    chunkSize?: number;
    chunkOverlap?: number;
    strategy?: 'recursive' | 'character' | 'token' | 'markdown' | 'python';
    separators?: string[];
    separator?: string;
    encodingName?: string;
    [key: string]: unknown;
}
export interface Chunk {
    id: string;
    content: string;
    metadata: {
        chunk_index: number;
        chunk_size: number;
        [key: string]: unknown;
    };
}
export interface VectorChunkResult {
    chunks: Chunk[];
    totalChunks: number;
}
export interface PythonServiceRequest {
    method: string;
    params: Record<string, unknown>;
}
export interface PythonServiceResponse {
    success: boolean;
    result?: unknown;
    error?: string;
}
/**
 * 模型信息
 */
export interface ModelInfo {
    model_name: string;
    status: 'loaded' | 'error' | 'not_found' | 'unloaded';
    dimension?: number;
    error?: string;
}
/**
 * 向量嵌入结果
 */
export interface EmbeddingResult {
    success: boolean;
    embedding?: number[];
    embeddings?: number[][];
    dimension?: number;
    count?: number;
    model_name?: string;
    error?: string;
}
/**
 * 相似度计算结果
 */
export interface SimilarityResult {
    success: boolean;
    similarity?: number[][];
    similarity_type?: 'cosine' | 'dot_product' | 'euclidean';
    error?: string;
}
/**
 * 文档元数据
 */
export interface DocumentMetadata {
    filePath?: string;
    fileName?: string;
    fileType?: string;
    chunkIndex?: number;
    totalChunks?: number;
    [key: string]: unknown;
}
/**
 * 搜索结果
 */
export interface SearchResult {
    id: number;
    text: string;
    metadata: DocumentMetadata;
    score: number;
}
/**
 * 添加文档选项
 */
export interface AddDocumentsOptions {
    modelName?: string;
}
/**
 * 处理文件路径选项
 */
export interface ProcessFilePathsOptions {
    modelName?: string;
    knowledgeBaseId?: string;
    chunkSize?: number;
    chunkOverlap?: number;
    strategy?: 'recursive' | 'character' | 'token' | 'markdown' | 'python';
}
/**
 * 处理文件路径结果
 */
export interface ProcessFilePathsResult {
    ids: number[];
    processedCount: number;
    fileCount: number;
    errors?: string[];
}
/**
 * 文件处理进度
 */
export interface FileProcessingProgress {
    /** 文件路径 */
    filePath: string;
    /** 当前处理的文件索引（从0开始） */
    currentFileIndex: number;
    /** 总文件数 */
    totalFiles: number;
    /** 当前文件已处理的块数 */
    currentFileChunks?: number;
    /** 当前文件总块数 */
    currentFileTotalChunks?: number;
    /** 处理状态 */
    status: 'pending' | 'loading' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'error';
    /** 错误信息 */
    error?: string;
}
/**
 * 搜索选项
 */
export interface SearchOptions {
    topK?: number;
    modelName?: string;
    filterMetadata?: Record<string, unknown>;
}
//# sourceMappingURL=types.d.ts.map