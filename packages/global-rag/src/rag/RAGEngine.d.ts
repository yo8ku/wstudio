/**
 * RAG 引擎
 */
import { VectorStore } from '../vector-store/VectorStore.js';
import { RAGConfig, RAGResponse } from './types.js';
export declare class RAGEngine {
    private vectorStore;
    private contextBuilder;
    private promptTemplate;
    private config;
    constructor(vectorStore: VectorStore, config?: RAGConfig);
    /**
     * 执行 RAG 查询
     */
    query(query: string, options?: Partial<RAGConfig>): Promise<RAGResponse>;
    /**
     * 生成回答（需要集成 LLM）
     */
    private generateAnswer;
    /**
     * 更新配置
     */
    updateConfig(config: Partial<RAGConfig>): void;
}
//# sourceMappingURL=RAGEngine.d.ts.map