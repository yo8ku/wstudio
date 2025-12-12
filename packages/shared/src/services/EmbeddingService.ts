import { EmbeddingConfig, EmbeddingResponse } from '../types/embeddings';

// 声明全局 window 对象（用于检测 Electron 环境）
declare const window: any;

export class EmbeddingService {
  private config: EmbeddingConfig;

  constructor(config: EmbeddingConfig = {}) {
    this.config = config;
  }

  // 预加载和路径获取方法已移除
  // 现在所有 Embedding 计算都在主进程中进行

  /**
   * 生成文本的向量表示
   * @param text 要转换为向量的文本
   * @returns 向量数据和使用统计
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    return this.generateLocalEmbedding(text);
  }

  /**
   * 批量生成文本向量
   * @param texts 文本数组
   * @returns 向量数组
   */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResponse[]> {
    try {
      // 检查是否在 Electron 环境中
      if (typeof window === 'undefined' || !window.electron?.embedding?.generateBatch) {
        // 回退到逐个生成
        const results: EmbeddingResponse[] = [];
        for (const text of texts) {
          const result = await this.generateEmbedding(text);
          results.push(result);
        }
        return results;
      }

      console.log('[EmbeddingService] 批量生成向量，数量:', texts.length);

      // 通过 IPC 调用主进程的批量生成服务
      const result = await window.electron.embedding.generateBatch(texts);

      if (!result.success) {
        throw new Error(result.error || '批量生成向量失败');
      }

      console.log('[EmbeddingService] ✓ 批量向量生成成功');

      return result.data;
    } catch (error) {
      console.error('[EmbeddingService] 批量生成失败，回退到逐个生成');
      // 回退到逐个生成
      const results: EmbeddingResponse[] = [];
      for (const text of texts) {
        const result = await this.generateEmbedding(text);
        results.push(result);
      }
      return results;
    }
  }

  /**
   * 使用主进程的 Embedding 服务生成向量
   */
  private async generateLocalEmbedding(text: string): Promise<EmbeddingResponse> {
    try {
      // 检查是否在 Electron 环境中
      if (typeof window === 'undefined' || !window.electron?.embedding?.generate) {
        throw new Error('Embedding 服务不可用：请确保在 Electron 环境中运行');
      }

      console.log('[EmbeddingService] 调用主进程生成向量，文本长度:', text.length);

      // 通过 IPC 调用主进程的 Embedding 服务
      const result = await window.electron.embedding.generate(text);

      if (!result.success) {
        throw new Error(result.error || '生成向量失败');
      }

      console.log('[EmbeddingService] ✓ 向量生成成功，维度:', result.data.vectors.length);

      return result.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[EmbeddingService] 生成向量失败:', errorMessage);
      throw new Error(`本地 embedding 生成失败: ${errorMessage}`);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: EmbeddingConfig): void {
    this.config = config;
    // 注意：主进程的 pipeline 缓存由主进程管理
  }

  /**
   * 获取当前配置
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}
