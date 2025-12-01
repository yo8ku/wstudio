/**
 * 向量存储管理器
 * 管理持久化向量存储
 */
import { DocumentMetadata, SearchResult, AddDocumentsOptions, SearchOptions, ProcessFilePathsOptions, ProcessFilePathsResult } from '../types.js';
export declare class VectorStore {
    private bridge;
    constructor();
    /**
     * 初始化向量存储管理器
     */
    initialize(): Promise<void>;
    /**
     * 添加文档到向量存储
     */
    addDocuments(texts: string[], metadatas: DocumentMetadata[], options?: AddDocumentsOptions): Promise<number[]>;
    /**
     * 添加文件到向量存储
     */
    addFile(filePath: string, content: string, options?: AddDocumentsOptions): Promise<number[]>;
    /**
     * 搜索向量存储
     */
    search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * 删除文档
     */
    deleteDocuments(ids: number[]): Promise<boolean>;
    /**
     * 根据元数据查询向量ID
     */
    getIdsByMetadata(filterMetadata: Record<string, unknown>): Promise<string[]>;
    /**
     * 处理文件路径列表（由 Python 端负责：加载、分块、嵌入、存储）
     * 前端只负责发送文件路径列表，不做任何处理
     */
    processFilePaths(filePaths: string[], options?: ProcessFilePathsOptions): Promise<ProcessFilePathsResult>;
    /**
     * 关闭管理器
     */
    close(): Promise<void>;
}
//# sourceMappingURL=VectorStore.d.ts.map