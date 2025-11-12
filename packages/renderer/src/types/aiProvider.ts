/**
 * AI提供商基础类型定义
 * 功能：定义AI提供商的统一接口和数据结果 * 描述：为所有AI提供商提供统一的类型定义，包括配置、模型、能力等
 */

// AI提供商基础配置
export interface AIProviderConfig {
  id?: string; // 配置ID，可选（临时配置可以不传ID）
  name: string;
  apiKey: string;
  apiEndpoint: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retryCount?: number;
  modelId?: string; // 魔塔社区等服务商需要的模型ID（单个模型，向后兼容）
  models?: string[]; // 魔塔社区等服务商的多个模型ID列表
  isEnabled?: boolean; // 是否启用该配置（默认为true）
}

// AI模型信息
export interface AIModel {
  id: string;
  name: string;
  displayName?: string;
  provider: string;
  capabilities: ModelCapability[];
  maxTokens?: number;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  supportsWebSearch?: boolean;
  isDeprecated?: boolean;
}

// 模型能力枚举
export enum ModelCapability {
  TEXT_GENERATION = 'text_generation',
  CODE_GENERATION = 'code_generation',
  REASONING = 'reasoning',
  VISION = 'vision',
  TOOLS = 'tools',
  FUNCTION_CALLING = 'function_calling',
  WEB_SEARCH = 'web_search',
  STREAMING = 'streaming',
  EMBEDDING = 'embedding',
  MODERATION = 'moderation'
}

// 聊天消息
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

// 工具调用
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// 工具定义
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

// 网络搜索结果
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  source?: string;
}

// 网络搜索配置
export interface WebSearchConfig {
  enabled: boolean;
  maxResults?: number;
  searchEngine?: 'google' | 'bing' | 'duckduckgo';
  apiKey?: string;
  customEndpoint?: string;
}

// 推理配置
export interface ReasoningConfig {
  enabled: boolean;
  thinkingBudget?: number;
  maxThinkingTime?: number;
}

// AI请求参数
export interface AIRequestParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
  webSearch?: WebSearchConfig;
  reasoning?: ReasoningConfig;
  signal?: AbortSignal; // 用于中断请求
}

// AI响应
export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  toolCalls?: ToolCall[];
  webSearchResults?: WebSearchResult[];
  reasoning?: string;
}

// 流式响应回调
export interface StreamCallback {
  onContent?: (content: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onWebSearch?: (results: WebSearchResult[]) => void;
  onReasoning?: (reasoning: string) => void;
  onComplete?: (response: AIResponse) => void;
  onError?: (error: Error) => void;
}

// AI提供商接口
export interface AIProvider {
  // 基础信息
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly supportedCapabilities: ModelCapability[];

  // 配置管理
  configure(config: AIProviderConfig): Promise<void>;
  getConfig(): AIProviderConfig;
  validateConfig(config: AIProviderConfig): Promise<boolean>;

  // 模型管理
  getAvailableModels(): Promise<AIModel[]>;
  getModelInfo(modelId: string): Promise<AIModel | null>;
  detectModelCapabilities(modelId: string): Promise<ModelCapability[]>;

  // 推理功能
  generateText(params: AIRequestParams): Promise<AIResponse>;
  generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 网络搜索功能
  searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]>;
  generateWithWebSearch(params: AIRequestParams): Promise<AIResponse>;
  generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 工具调用功能
  generateWithTools(params: AIRequestParams): Promise<AIResponse>;
  generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 测试连接
  testConnection(): Promise<boolean>;
  getConnectionStatus(): 'connected' | 'disconnected' | 'error';
}

// 提供商工厂接口
export interface AIProviderFactory {
  createProvider(providerId: string, config: AIProviderConfig): AIProvider;
  getSupportedProviders(): string[];
  getProviderInfo(providerId: string): { id: string; name: string; icon: string; capabilities: ModelCapability[] } | null;
}

// 错误类型
export class AIProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class ModelNotFoundError extends AIProviderError {
  constructor(modelId: string, provider: string) {
    super(`Model ${modelId} not found in provider ${provider}`, provider, 'MODEL_NOT_FOUND');
    this.name = 'ModelNotFoundError';
  }
}

export class APIKeyError extends AIProviderError {
  constructor(provider: string, message?: string) {
    // 使用API返回的原始message，如果没有则使用默认消息
    super(message || `Invalid API key for provider ${provider}`, provider, 'INVALID_API_KEY', 401);
    this.name = 'APIKeyError';
  }
}

export class RateLimitError extends AIProviderError {
  constructor(provider: string, message?: string, retryAfter?: number) {
    // 使用API返回的原始message，如果没有则使用默认消息
    super(message || `Rate limit exceeded for provider ${provider}`, provider, 'RATE_LIMIT', 429);
    this.name = 'RateLimitError';
  }
}
