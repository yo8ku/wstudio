/**
 * Embedding 模型配置
 * 功能：定义云端 Embedding 模型的配置
 * 描述：支持多个服务商的 Embedding API，后续可迁移到数据库
 */

/** Embedding 模型配置接口 */
export interface EmbeddingModelConfig {
  /** 模型唯一标识 */
  id: string;
  /** 模型名称 */
  name: string;
  /** 显示名称 */
  displayName: string;
  /** 服务商 ID */
  providerId: string;
  /** API 端点 */
  apiEndpoint: string;
  /** 向量维度 */
  dimensions: number;
  /** 最大输入 tokens */
  maxTokens: number;
  /** 是否支持批量请求 */
  supportsBatch: boolean;
  /** 每批最大数量 */
  maxBatchSize: number;
  /** 价格（每百万 tokens，单位：美元或人民币） */
  pricePerMillion?: number;
  /** 价格货币 */
  currency?: 'USD' | 'CNY';
  /** 是否启用 */
  enabled: boolean;
  /** 备注 */
  description?: string;
}

/** Embedding 服务商配置接口 */
export interface EmbeddingProviderConfig {
  /** 服务商 ID */
  id: string;
  /** 服务商名称 */
  name: string;
  /** API Key（从 AI 配置中获取或单独配置） */
  apiKey?: string;
  /** 默认 API 端点 */
  defaultEndpoint: string;
  /** API Key 获取链接 */
  apiKeyUrl: string;
  /** 支持的模型列表 */
  models: EmbeddingModelConfig[];
}

/**
 * 预定义的 Embedding 模型配置
 * 包含主流服务商的推荐模型
 */
export const EMBEDDING_PROVIDERS: EmbeddingProviderConfig[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultEndpoint: 'https://api.openai.com/v1/embeddings',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    models: [
      {
        id: 'text-embedding-3-small',
        name: 'text-embedding-3-small',
        displayName: 'OpenAI Embedding 3 Small',
        providerId: 'openai',
        apiEndpoint: 'https://api.openai.com/v1/embeddings',
        dimensions: 1536,
        maxTokens: 8191,
        supportsBatch: true,
        maxBatchSize: 2048,
        pricePerMillion: 0.02,
        currency: 'USD',
        enabled: true,
        description: '性价比最高，适合大多数场景',
      },
      {
        id: 'text-embedding-3-large',
        name: 'text-embedding-3-large',
        displayName: 'OpenAI Embedding 3 Large',
        providerId: 'openai',
        apiEndpoint: 'https://api.openai.com/v1/embeddings',
        dimensions: 3072,
        maxTokens: 8191,
        supportsBatch: true,
        maxBatchSize: 2048,
        pricePerMillion: 0.13,
        currency: 'USD',
        enabled: true,
        description: '更高精度，适合对质量要求高的场景',
      },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    defaultEndpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    models: [
      {
        id: 'embedding-3',
        name: 'embedding-3',
        displayName: '智谱 Embedding-3',
        providerId: 'zhipu',
        apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/embeddings',
        dimensions: 2048,
        maxTokens: 8192,
        supportsBatch: true,
        maxBatchSize: 64,
        pricePerMillion: 0.5,
        currency: 'CNY',
        enabled: true,
        description: '国产模型，中文效果好',
      },
    ],
  },
  {
    id: 'aliyun',
    name: '阿里云',
    defaultEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    apiKeyUrl: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
    models: [
      {
        id: 'text-embedding-v3',
        name: 'text-embedding-v3',
        displayName: '阿里云 Embedding V3',
        providerId: 'aliyun',
        apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
        dimensions: 1024,
        maxTokens: 8192,
        supportsBatch: true,
        maxBatchSize: 25,
        pricePerMillion: 0.7,
        currency: 'CNY',
        enabled: true,
        description: '阿里云通义千问 Embedding',
      },
    ],
  },
  {
    id: 'jina',
    name: 'Jina AI',
    defaultEndpoint: 'https://api.jina.ai/v1/embeddings',
    apiKeyUrl: 'https://jina.ai/api-dashboard/',
    models: [
      {
        id: 'jina-embeddings-v3',
        name: 'jina-embeddings-v3',
        displayName: 'Jina Embeddings V3',
        providerId: 'jina',
        apiEndpoint: 'https://api.jina.ai/v1/embeddings',
        dimensions: 1024,
        maxTokens: 8192,
        supportsBatch: true,
        maxBatchSize: 2048,
        pricePerMillion: 0.02,
        currency: 'USD',
        enabled: true,
        description: '多语言支持，性价比高',
      },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    defaultEndpoint: 'http://localhost:11434/api/embed',
    apiKeyUrl: 'https://ollama.com/',
    models: [
      {
        id: 'nomic-embed-text',
        name: 'nomic-embed-text',
        displayName: 'Nomic Embed Text',
        providerId: 'ollama',
        apiEndpoint: 'http://localhost:11434/api/embed',
        dimensions: 768,
        maxTokens: 8192,
        supportsBatch: false,
        maxBatchSize: 1,
        pricePerMillion: 0,
        enabled: true,
        description: '本地免费，适合隐私敏感场景',
      },
      {
        id: 'mxbai-embed-large',
        name: 'mxbai-embed-large',
        displayName: 'MxBai Embed Large',
        providerId: 'ollama',
        apiEndpoint: 'http://localhost:11434/api/embed',
        dimensions: 1024,
        maxTokens: 512,
        supportsBatch: false,
        maxBatchSize: 1,
        pricePerMillion: 0,
        enabled: true,
        description: '本地免费，高质量嵌入',
      },
      {
        id: 'bge-m3',
        name: 'bge-m3',
        displayName: 'BGE-M3',
        providerId: 'ollama',
        apiEndpoint: 'http://localhost:11434/api/embed',
        dimensions: 1024,
        maxTokens: 8192,
        supportsBatch: false,
        maxBatchSize: 1,
        pricePerMillion: 0,
        enabled: true,
        description: '本地免费，多语言支持',
      },
    ],
  },
  {
    id: 'custom',
    name: '自定义',
    defaultEndpoint: '',
    apiKeyUrl: '',
    models: [],
  },
];

/**
 * 获取所有 Embedding 服务商
 */
export function getAllEmbeddingProviders(): EmbeddingProviderConfig[] {
  return EMBEDDING_PROVIDERS;
}

/**
 * 获取所有启用的 Embedding 模型
 */
export function getEnabledEmbeddingModels(): EmbeddingModelConfig[] {
  const models: EmbeddingModelConfig[] = [];
  for (const provider of EMBEDDING_PROVIDERS) {
    for (const model of provider.models) {
      if (model.enabled) {
        models.push(model);
      }
    }
  }
  return models;
}

/**
 * 根据 ID 获取 Embedding 模型配置
 */
export function getEmbeddingModelById(modelId: string): EmbeddingModelConfig | undefined {
  for (const provider of EMBEDDING_PROVIDERS) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return model;
    }
  }
  return undefined;
}

/**
 * 根据服务商 ID 获取 Embedding 模型列表
 */
export function getEmbeddingModelsByProvider(providerId: string): EmbeddingModelConfig[] {
  const provider = EMBEDDING_PROVIDERS.find(p => p.id === providerId);
  return provider?.models || [];
}
