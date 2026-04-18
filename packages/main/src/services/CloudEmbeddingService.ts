/**
 * 云端 Embedding 服务
 * 功能：调用云端 API 生成文本向量
 * 描述：支持多个服务商的 Embedding API，使用 OpenAI 兼容格式
 * 配置持久化：使用 electron-store 存储 API Key 和模型选择
 */

import {
  EmbeddingModelConfig,
  getEmbeddingModelById,
  getEnabledEmbeddingModels,
  getAllEmbeddingProviders,
} from './EmbeddingModelConfig';
import Store from 'electron-store';
import http from 'http';
import https from 'https';

/** Embedding 请求参数 */
interface EmbeddingRequest {
  /** 输入文本（单个或数组） */
  input: string | string[];
  /** 模型 ID */
  model: string;
  /** 编码格式（可选） */
  encoding_format?: 'float' | 'base64';
}

/** Embedding 响应数据 */
interface EmbeddingData {
  object: 'embedding';
  index: number;
  embedding: number[];
}

/** Embedding API 响应 */
interface EmbeddingResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/** Embedding 结果 */
export interface EmbeddingResult {
  /** 是否成功 */
  success: boolean;
  /** 向量数组 */
  vectors?: number[][];
  /** 错误信息 */
  error?: string;
  /** 使用的 tokens */
  tokensUsed?: number;
  /** 模型 ID */
  model?: string;
}

/** 自定义模型配置 */
export interface CustomEmbeddingConfig {
  /** API 端点 */
  apiEndpoint: string;
  /** 模型名称 */
  modelName: string;
  /** 向量维度 */
  dimensions: number;
  /** 最大 Tokens */
  maxTokens: number;
}

/** 持久化配置结构 */
interface OllamaModelDetails {
  family?: string;
  families?: string[];
  format?: string;
  parameter_size?: string;
  quantization_level?: string;
}

interface OllamaModelTag {
  name: string;
  model?: string;
  digest?: string;
  size?: number;
  modified_at?: string;
  details?: OllamaModelDetails;
}

interface OllamaTagsResponse {
  models?: OllamaModelTag[];
}

interface EmbeddingStoreSchema {
  /** 当前使用的模型 ID */
  currentModelId: string;
  currentProviderId?: string;
  /** API Key（按服务商存储） */
  apiKeys: Record<string, string>;
  providerEndpoints?: Record<string, string>;
  modelDimensions?: Record<string, number>;
  /** 自定义模型配置 */
  customConfig?: CustomEmbeddingConfig;
}

/** 服务配置（运行时） */
interface ServiceConfig {
  /** 当前使用的模型 ID */
  modelId: string;
  currentProviderId?: string;
  /** API Key（按服务商存储） */
  apiKeys: Record<string, string>;
  providerEndpoints: Record<string, string>;
  modelDimensions: Record<string, number>;
  /** 自定义模型配置 */
  customConfig?: CustomEmbeddingConfig;
}

/**
 * 云端 Embedding 服务类
 */
class CloudEmbeddingServiceClass {
  private config: ServiceConfig = {
    modelId: 'BAAI/bge-m3', // 默认使用硅基流动的免费模型
    currentProviderId: 'ollama',
    apiKeys: {},
    providerEndpoints: {},
    modelDimensions: {},
  };

  private store: Store<EmbeddingStoreSchema>;

  constructor() {
    // 初始化 electron-store
    this.store = new Store<EmbeddingStoreSchema>({
      name: 'embedding-config',
      defaults: {
        currentModelId: 'BAAI/bge-m3',
        apiKeys: {},
      },
    });

    // 从持久化存储加载配置
    this.loadConfig();
  }

  /**
   * 从持久化存储加载配置
   */
  private loadConfig(): void {
    this.config.modelId = this.store.get('currentModelId', 'BAAI/bge-m3');
    this.config.apiKeys = this.store.get('apiKeys', {});
    this.config.customConfig = this.store.get('customConfig');
    const apiKeyCount = Object.keys(this.config.apiKeys).length;
    console.log(`[CloudEmbedding] 配置文件路径: ${this.store.path}`);
    console.log(`[CloudEmbedding] 已加载配置，当前模型: ${this.config.modelId}，已保存 ${apiKeyCount} 个 API Key`);
  }

  /**
   * 设置自定义模型配置
   */
  setCustomConfig(config: CustomEmbeddingConfig): void {
    this.config.customConfig = config;
    this.store.set('customConfig', config);
    console.log(`[CloudEmbedding] 已保存自定义模型配置: ${config.modelName}`);
  }

  /**
   * 获取自定义模型配置
   */
  getCustomConfig(): CustomEmbeddingConfig | undefined {
    return this.config.customConfig;
  }

  /**
   * 设置 API Key
   * @param providerId 服务商 ID
   * @param apiKey API Key
   */
  setApiKey(providerId: string, apiKey: string): void {
    this.config.apiKeys[providerId] = apiKey;
    // 持久化保存
    this.store.set('apiKeys', this.config.apiKeys);
    console.log(`[CloudEmbedding] 已设置 ${providerId} 的 API Key`);
  }

  /**
   * 获取 API Key
   * @param providerId 服务商 ID
   */
  getApiKey(providerId: string): string | undefined {
    return this.config.apiKeys[providerId];
  }

  /**
   * 设置当前使用的模型
   * @param modelId 模型 ID
   */
  setModel(modelId: string): void {
    // 自定义模型特殊处理
    if (modelId === 'custom') {
      this.config.modelId = modelId;
      this.store.set('currentModelId', modelId);
      console.log(`[CloudEmbedding] 已切换到自定义模型`);
      return;
    }

    const model = getEmbeddingModelById(modelId);
    if (!model) {
      throw new Error(`未找到模型: ${modelId}`);
    }
    this.config.modelId = modelId;
    // 持久化保存
    this.store.set('currentModelId', modelId);
    console.log(`[CloudEmbedding] 已切换到模型: ${model.displayName}`);
  }

  /**
   * 获取当前模型配置
   */
  getCurrentModel(): EmbeddingModelConfig | undefined {
    // 自定义模型特殊处理
    if (this.config.modelId === 'custom' && this.config.customConfig) {
      return {
        id: 'custom',
        name: this.config.customConfig.modelName,
        displayName: `自定义: ${this.config.customConfig.modelName}`,
        providerId: 'custom',
        apiEndpoint: this.config.customConfig.apiEndpoint,
        dimensions: this.config.customConfig.dimensions,
        maxTokens: this.config.customConfig.maxTokens,
        supportsBatch: true,
        maxBatchSize: 50,
        enabled: true,
      };
    }
    return getEmbeddingModelById(this.config.modelId);
  }

  /**
   * 获取所有可用模型
   */
  getAvailableModels(): EmbeddingModelConfig[] {
    return getEnabledEmbeddingModels();
  }

  /**
   * 获取所有服务商
   */
  getProviders() {
    return getAllEmbeddingProviders();
  }

  /**
   * 检查当前模型是否已配置有效的 API Key
   * @returns 是否已配置 API Key
   */
  hasValidApiKey(): boolean {
    const model = this.getCurrentModel();
    if (!model) {
      return false;
    }
    // Ollama 不需要 API Key
    if (model.providerId === 'ollama') {
      return true;
    }
    const apiKey = this.config.apiKeys[model.providerId];
    return !!apiKey && apiKey.trim().length > 0;
  }

  /**
   * 生成单个文本的向量
   * @param text 输入文本
   * @returns Embedding 结果
   */
  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const result = await this.generateBatchEmbeddings([text]);
    if (result.success && result.vectors && result.vectors.length > 0) {
      return {
        success: true,
        vectors: [result.vectors[0]],
        tokensUsed: result.tokensUsed,
        model: result.model,
      };
    }
    return result;
  }

  /**
   * 批量生成向量
   * @param texts 输入文本数组
   * @returns Embedding 结果
   */
  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResult> {
    const model = this.getCurrentModel();
    if (!model) {
      return {
        success: false,
        error: `未找到模型配置: ${this.config.modelId}`,
      };
    }

    const apiKey = this.config.apiKeys[model.providerId];
    // Ollama 不需要 API Key（本地运行时可以为空）
    if (!apiKey && model.providerId !== 'ollama') {
      return {
        success: false,
        error: `未配置 ${model.providerId} 的 API Key`,
      };
    }

    // 分批处理
    const allVectors: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += model.maxBatchSize) {
      const batch = texts.slice(i, i + model.maxBatchSize);
      const result = await this.callEmbeddingAPI(model, apiKey, batch);
      
      if (!result.success) {
        return result;
      }

      if (result.vectors) {
        allVectors.push(...result.vectors);
      }
      if (result.tokensUsed) {
        totalTokens += result.tokensUsed;
      }
    }

    return {
      success: true,
      vectors: allVectors,
      tokensUsed: totalTokens,
      model: model.id,
    };
  }

  /**
   * 截断文本以适应模型的 token 限制
   * 粗略估算：中文约 1 字符 = 1-2 tokens，英文约 4 字符 = 1 token
   * 保守起见，限制在 400 字符以确保不超过 512 tokens
   */
  private truncateText(text: string, maxChars: number = 400): string {
    if (text.length <= maxChars) {
      return text;
    }
    return text.substring(0, maxChars);
  }

  /**
   * 调用 Embedding API
   */
  private async callEmbeddingAPI(
    model: EmbeddingModelConfig,
    apiKey: string,
    texts: string[]
  ): Promise<EmbeddingResult> {
    // 截断过长的文本，避免超过模型的 token 限制
    const truncatedTexts = texts.map(text => this.truncateText(text));

    // Ollama 使用不同的 API 格式
    const isOllama = model.providerId === 'ollama';

    if (isOllama) {
      return this.callOllamaEmbeddingAPI(model, truncatedTexts);
    }

    const requestBody: EmbeddingRequest = {
      input: truncatedTexts.length === 1 ? truncatedTexts[0] : truncatedTexts,
      model: model.name,
      encoding_format: 'float',
    };

    try {
      console.log(`[CloudEmbedding] 调用 API: ${model.apiEndpoint}, 文本数: ${texts.length}`);

      const response = await fetch(model.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[CloudEmbedding] API 错误: ${response.status}`, errorText);
        return {
          success: false,
          error: `API 错误 (${response.status}): ${errorText}`,
        };
      }

      const data: EmbeddingResponse = await response.json();

      // 按 index 排序并提取向量
      const sortedData = data.data.sort((a, b) => a.index - b.index);
      const vectors = sortedData.map(d => d.embedding);

      console.log(`[CloudEmbedding] 成功生成 ${vectors.length} 个向量，维度: ${vectors[0]?.length}`);

      return {
        success: true,
        vectors,
        tokensUsed: data.usage?.total_tokens,
        model: data.model,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[CloudEmbedding] 请求失败:', errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * 调用 Ollama Embedding API（使用 Node.js http 模块避免 Electron fetch 限制）
   */
  private async callOllamaEmbeddingAPI(
    model: EmbeddingModelConfig,
    texts: string[]
  ): Promise<EmbeddingResult> {
    try {
      console.log(`[CloudEmbedding] 调用 Ollama API: ${model.apiEndpoint}, 文本数: ${texts.length}`);

      const vectors: number[][] = [];

      // 获取 API Key（可选，用于云端 Ollama）
      const apiKey = this.config.apiKeys[model.providerId];

      // Ollama 不支持批量请求，需要逐个处理
      for (const text of texts) {
        const requestBody = JSON.stringify({
          model: model.name,
          input: text,
        });

        const result = await this.httpRequest(model.apiEndpoint, requestBody, apiKey);

        if (!result.success) {
          return result;
        }

        const data = JSON.parse(result.data!);

        // Ollama 返回 embeddings 数组（复数）
        if (data.embeddings && Array.isArray(data.embeddings) && data.embeddings.length > 0) {
          vectors.push(data.embeddings[0]);
        } else if (data.embedding && Array.isArray(data.embedding)) {
          // 兼容旧版本返回 embedding（单数）
          vectors.push(data.embedding);
        } else {
          console.error('[CloudEmbedding] Ollama 返回数据:', JSON.stringify(data));
          return {
            success: false,
            error: 'Ollama 返回的数据格式不正确',
          };
        }
      }

      console.log(`[CloudEmbedding] Ollama 成功生成 ${vectors.length} 个向量，维度: ${vectors[0]?.length}`);

      return {
        success: true,
        vectors,
        model: model.name,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[CloudEmbedding] Ollama 请求失败:', errorMsg);
      return {
        success: false,
        error: `Ollama 连接失败: ${errorMsg}`,
      };
    }
  }

  /**
   * 使用 Node.js http/https 模块发起请求（避免 Electron fetch 对 localhost 的限制）
   */
  private httpRequest(
    url: string,
    body: string,
    apiKey?: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      // 强制使用 IPv4，避免 IPv6 连接问题
      let hostname = parsedUrl.hostname;
      if (hostname === 'localhost') {
        hostname = '127.0.0.1';
      }

      const options = {
        hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...(apiKey && apiKey.trim() ? { 'Authorization': `Bearer ${apiKey}` } : {}),
        },
      };

      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data });
          } else {
            resolve({
              success: false,
              error: `Ollama API 错误 (${res.statusCode}): ${data}`,
            });
          }
        });
      });

      req.on('error', (error) => {
        console.error('[CloudEmbedding] HTTP 请求错误:', error.message);
        resolve({
          success: false,
          error: `Ollama 连接失败: ${error.message}`,
        });
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * 测试连接
   * @param providerId 服务商 ID
   * @param apiKey API Key
   * @param modelId 模型 ID（可选）
   */
  async testConnection(
    providerId: string,
    apiKey: string,
    modelId?: string
  ): Promise<{ success: boolean; message: string; dimensions?: number }> {
    const models = getEnabledEmbeddingModels().filter(m => m.providerId === providerId);
    if (models.length === 0) {
      return { success: false, message: `未找到 ${providerId} 的模型配置` };
    }

    const model = modelId
      ? models.find(m => m.id === modelId) || models[0]
      : models[0];

    const testText = '测试连接';

    // Ollama 使用 http 模块避免 Electron fetch 限制
    if (providerId === 'ollama') {
      try {
        const requestBody = JSON.stringify({
          model: model.name,
          input: testText,
        });

        const result = await this.httpRequest(model.apiEndpoint, requestBody, apiKey);

        if (!result.success) {
          return {
            success: false,
            message: result.error || 'Ollama 连接失败',
          };
        }

        const data = JSON.parse(result.data!);
        // Ollama 返回 embeddings 数组（复数）
        const dimensions = data.embeddings?.[0]?.length || data.embedding?.length || 0;

        return {
          success: true,
          message: `连接成功，模型: ${model.name}，维度: ${dimensions}`,
          dimensions,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Ollama 连接失败: ${errorMsg}（请确保 Ollama 正在运行）` };
      }
    }

    const requestBody: EmbeddingRequest = {
      input: testText,
      model: model.name,
      encoding_format: 'float',
    };

    try {
      const response = await fetch(model.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API 错误 (${response.status}): ${errorText}`
        };
      }

      const data: EmbeddingResponse = await response.json();
      const dimensions = data.data[0]?.embedding?.length || 0;

      return {
        success: true,
        message: `连接成功，模型: ${data.model}，维度: ${dimensions}`,
        dimensions,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `连接失败: ${errorMsg}` };
    }
  }

  /**
   * 验证当前配置是否有效（在索引开始前调用）
   * @returns 验证结果
   */
  async validateCurrentConfig(): Promise<{ success: boolean; message: string }> {
    const model = this.getCurrentModel();
    if (!model) {
      return { success: false, message: '未配置 Embedding 模型，请先选择服务商和模型' };
    }

    // Ollama 不需要 API Key
    if (model.providerId !== 'ollama') {
      // 获取 API Key
      const apiKey = this.getApiKey(model.providerId);
      if (!apiKey) {
        return { success: false, message: `未配置 ${model.providerId} 的 API Key` };
      }
    }

    // 测试 API 连接
    const testText = '验证配置';
    try {
      const result = await this.generateEmbedding(testText);
      if (!result.success) {
        return { success: false, message: result.error || 'API 调用失败' };
      }
      return { success: true, message: `配置有效，模型: ${model.displayName}` };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `API 验证失败: ${errorMsg}` };
    }
  }
}

// 导出单例
export const cloudEmbeddingService = new CloudEmbeddingServiceClass();
