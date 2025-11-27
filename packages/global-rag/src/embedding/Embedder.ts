/**
 * 向量嵌入器
 * 使用 sentence-transformers 进行文本向量化
 */

import { PythonBridge } from '../python/bridge/PythonBridge.js';
import { ModelInfo, EmbeddingResult, SimilarityResult } from '../types.js';

export class Embedder {
  private bridge: PythonBridge;
  private defaultModel: string = 'BAAI/bge-large-zh-v1.5';

  constructor(defaultModel?: string) {
    this.bridge = new PythonBridge();
    if (defaultModel) {
      this.defaultModel = defaultModel;
    }
  }

  /**
   * 初始化嵌入器
   */
  async initialize(): Promise<void> {
    await this.bridge.start();
    // 自动加载默认模型
    await this.loadModel(this.defaultModel);
  }

  /**
   * 加载模型
   */
  async loadModel(modelName?: string): Promise<ModelInfo> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'load_model',
      params: {
        model_name: modelName || this.defaultModel,
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to load model');
    }

    return response.result as ModelInfo;
  }

  /**
   * 卸载模型
   */
  async unloadModel(modelName: string): Promise<ModelInfo> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'unload_model',
      params: {
        model_name: modelName,
      },
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to unload model');
    }

    return response.result as ModelInfo;
  }

  /**
   * 获取当前使用的模型
   */
  async getCurrentModel(): Promise<string | null> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'get_current_model',
      params: {},
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to get current model');
    }

    return response.result as string | null;
  }

  /**
   * 列出已加载的模型
   */
  async listModels(): Promise<string[]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'list_models',
      params: {},
    });

    if (!response.success || !response.result) {
      throw new Error(response.error || 'Failed to list models');
    }

    return response.result as string[];
  }

  /**
   * 对单个文本进行向量化
   */
  async embedText(text: string, modelName?: string): Promise<number[]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'embed_text',
      params: {
        text,
        model_name: modelName,
      },
    });

    const result = response as EmbeddingResult;
    if (!result.success || !result.embedding) {
      throw new Error(result.error || 'Failed to embed text');
    }

    return result.embedding;
  }

  /**
   * 对多个文本进行向量化
   */
  async embedTexts(texts: string[], modelName?: string): Promise<number[][]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'embed_texts',
      params: {
        texts,
        model_name: modelName,
      },
    });

    const result = response as EmbeddingResult;
    if (!result.success || !result.embeddings) {
      throw new Error(result.error || 'Failed to embed texts');
    }

    return result.embeddings;
  }

  /**
   * 计算两个向量列表之间的相似度
   */
  async computeSimilarity(
    embeddings1: number[][],
    embeddings2: number[][],
    similarityType: 'cosine' | 'dot_product' | 'euclidean' = 'cosine'
  ): Promise<number[][]> {
    if (!this.bridge.isServiceReady()) {
      await this.initialize();
    }

    const response = await this.bridge.request({
      method: 'compute_similarity',
      params: {
        embeddings1,
        embeddings2,
        similarity_type: similarityType,
      },
    });

    const result = response as SimilarityResult;
    if (!result.success || !result.similarity) {
      throw new Error(result.error || 'Failed to compute similarity');
    }

    return result.similarity;
  }

  /**
   * 关闭嵌入器
   */
  async close(): Promise<void> {
    await this.bridge.stop();
  }
}


