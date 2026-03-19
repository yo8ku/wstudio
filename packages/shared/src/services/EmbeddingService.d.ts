/**
 * 渲染进程 Embedding 服务
 * 通过 IPC 调用主进程的云端 Embedding 服务生成向量
 */
import { EmbeddingResponse } from '../types/embeddings';
export declare class EmbeddingService {
    /**
     * 生成文本的向量表示
     */
    generateEmbedding(text: string): Promise<EmbeddingResponse>;
    /**
     * 批量生成文本向量
     */
    generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResponse[]>;
}
//# sourceMappingURL=EmbeddingService.d.ts.map