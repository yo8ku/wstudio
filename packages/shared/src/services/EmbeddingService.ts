/**
 * 渲染进程 Embedding 服务
 * 通过 IPC 调用主进程的云端 Embedding 服务生成向量
 */
import { EmbeddingResponse } from '../types/embeddings';

// 声明全局 window 对象（用于检测 Electron 环境）
declare const window: any;

export class EmbeddingService {
  /**
   * 生成文本的向量表示
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    if (typeof window === 'undefined' || !window.electron?.embedding?.generate) {
      throw new Error('Embedding 服务不可用：请确保在 Electron 环境中运行');
    }

    const result = await window.electron.embedding.generate(text);
    if (!result.success) {
      throw new Error(result.error || '生成向量失败');
    }
    return result.data;
  }

  /**
   * 批量生成文本向量
   */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResponse[]> {
    if (typeof window === 'undefined' || !window.electron?.embedding?.generateBatch) {
      const results: EmbeddingResponse[] = [];
      for (const text of texts) {
        results.push(await this.generateEmbedding(text));
      }
      return results;
    }

    const result = await window.electron.embedding.generateBatch(texts);
    if (!result.success) {
      throw new Error(result.error || '批量生成向量失败');
    }
    return result.data;
  }
}
