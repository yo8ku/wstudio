/**
 * OpenAI AI提供商实现
 * 功能：提供OpenAI API的完整功能，包括推理、工具调用、网络搜索等
 * 描述：支持GPT系列模型，包括GPT-4o、GPT-4 Turbo、GPT-3.5 Turbo等
 */

import { BaseAIProvider } from '../BaseAIProvider';
import { 
  AIProviderConfig, 
  AIModel, 
  AIRequestParams, 
  AIResponse, 
  StreamCallback,
  WebSearchResult,
  WebSearchConfig,
  ModelCapability,
  ToolCall,
  ChatMessage
} from '../../../types/aiProvider';

export class OpenAIProvider extends BaseAIProvider {
  constructor() {
    super(
      'openai',
      'OpenAI',
      'OpenAI',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.VISION,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.EMBEDDING,
        ModelCapability.MODERATION
      ]
    );
  }

  setConfig(config: AIProviderConfig): void {
    const raw = config.apiEndpoint || 'https://api.openai.com/v1/chat/completions';
    // 如果只填了 base URL（没有 /v1/chat/completions），自动补全
    const endpoint = raw.includes('/chat/completions')
      ? raw
      : raw.replace(/\/+$/, '') + '/v1/chat/completions';
    super.setConfig({ ...config, apiEndpoint: endpoint });
  }

  // 获取可用模型列表（使用缓存机制）
  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromAPI());
  }

  // 从API获取模型列表
  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    try {
      const response = await this.makeRequest(`${this.config.apiEndpoint.replace('/chat/completions', '/models')}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      const data = await response.json();
      const tempModels: AIModel[] = [];

      if (data.data && Array.isArray(data.data)) {
        for (const model of data.data) {
          // 过滤：跳过包含 latest 的模型
          if (model.id.toLowerCase().includes('latest')) {
            continue;
          }
          
          const capabilities = await this.detectModelCapabilities(model.id);
          tempModels.push({
            id: model.id,
            name: model.id,
            displayName: this.getModelDisplayName(model.id),
            provider: this.id,
            capabilities,
            maxTokens: this.getModelMaxTokens(model.id),
            supportsStreaming: true,
            supportsTools: capabilities.includes(ModelCapability.TOOLS),
            supportsVision: capabilities.includes(ModelCapability.VISION),
            supportsFunctionCalling: capabilities.includes(ModelCapability.FUNCTION_CALLING),
            isDeprecated: this.isModelDeprecated(model.id)
          });
        }
      }

      // 过滤废弃模型
      const nonDeprecatedModels = tempModels.filter(model => !model.isDeprecated);
      
      // 过滤预览版本：只保留最新的预览版本
      return this.filterPreviewModels(nonDeprecatedModels);
    } catch (error) {
      console.error('[OpenAI] Failed to fetch models:', error);
      // 失败时返回空数组，不使用预定义模型
      return [];
    }
  }

  /**
   * 过滤预览版本模型，只保留最新的预览版本
   * 对于每个模型系列（如 gpt-4o, o1 等），只保留一个最新的预览版本
   */
  private filterPreviewModels(models: AIModel[]): AIModel[] {
    // 将模型分为预览版本和非预览版本
    const previewModels: AIModel[] = [];
    const nonPreviewModels: AIModel[] = [];
    
    models.forEach(model => {
      const lowerModelId = model.id.toLowerCase();
      if (lowerModelId.includes('preview') || lowerModelId.includes('-exp-') || lowerModelId.includes('experimental')) {
        previewModels.push(model);
      } else {
        nonPreviewModels.push(model);
      }
    });
    
    // 如果没有预览版本，直接返回
    if (previewModels.length === 0) {
      return nonPreviewModels;
    }
    
    // 按模型系列分组预览版本
    const previewGroups = new Map<string, AIModel[]>();
    
    previewModels.forEach(model => {
      // 提取模型基础名称（去掉日期、预览标记等后缀）
      const baseName = this.extractModelBaseName(model.id);
      
      if (!previewGroups.has(baseName)) {
        previewGroups.set(baseName, []);
      }
      previewGroups.get(baseName)!.push(model);
    });
    
    // 对每个组，只保留最新的一个预览版本
    const latestPreviews: AIModel[] = [];
    previewGroups.forEach((group) => {
      // 按日期排序，取最新的
      const sorted = group.sort((a, b) => {
        const dateA = this.extractModelDate(a.id);
        const dateB = this.extractModelDate(b.id);
        return dateB - dateA; // 降序，最新的在前
      });
      
      latestPreviews.push(sorted[0]);
    });
    
    // 返回非预览版本 + 最新的预览版本
    return [...nonPreviewModels, ...latestPreviews];
  }
  
  /**
   * 提取模型基础名称（用于分组）
   * 例如：gpt-4o-2024-08-06-preview -> gpt-4o-preview
   *      o1-preview-2024-09-12 -> o1-preview
   */
  private extractModelBaseName(modelId: string): string {
    const lower = modelId.toLowerCase();
    
    // 移除日期部分
    let baseName = lower.replace(/\d{4}-?\d{2}-?\d{2}/g, '');
    
    // 移除多余的连字符
    baseName = baseName.replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    return baseName;
  }
  
  /**
   * 从模型名称中提取日期信息（用于排序）
   */
  private extractModelDate(modelId: string): number {
    const lower = modelId.toLowerCase();
    
    // 匹配日期格式 YYYYMMDD 或 YYYY-MM-DD
    const dateMatch = lower.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const day = parseInt(dateMatch[3]);
      return new Date(year, month - 1, day).getTime();
    }
    
    // 如果没有日期，返回默认值
    return 0;
  }

  // 获取模型信息
  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(model => model.id === modelId) || null;
  }

  // 检测模型能力
  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const capabilities: ModelCapability[] = [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING];

    // 基础能力检测
    if (modelId.includes('gpt-4')) {
      capabilities.push(ModelCapability.REASONING, ModelCapability.CODE_GENERATION);
    }

    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-vision')) {
      capabilities.push(ModelCapability.VISION);
    }

    if (modelId.includes('gpt-4') || modelId.includes('gpt-3.5-turbo')) {
      capabilities.push(ModelCapability.TOOLS, ModelCapability.FUNCTION_CALLING);
    }

    if (modelId.includes('embedding')) {
      capabilities.push(ModelCapability.EMBEDDING);
    }

    if (modelId.includes('moderation')) {
      capabilities.push(ModelCapability.MODERATION);
    }

    return capabilities;
  }

  // 生成文本
  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      const requestBody = this.buildRequestBody(params);
      
      const response = await this.makeRequest(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      this.handleError(error);
    }
  }

  // 流式生成文本
  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      const requestBody = this.buildRequestBody(params, true);
      
      const response = await this.makeRequest(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: params.signal // 传递 AbortSignal
      });

      await this.handleStreamResponse(response, callback, params.signal);
    } catch (error) {
      // 如果是取消操作，直接返回，不抛出错误
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      this.handleError(error, 'Failed to generate text stream');
    }
  }

  // 网络搜索功能
  async searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    // OpenAI本身不提供网络搜索，这里可以实现第三方搜索API集成
    // 例如：Google Search API, Bing Search API等
    throw new Error('Web search not directly supported by OpenAI. Use function calling with web search tools.');
  }

  // 带网络搜索的生成
  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    // 实现网络搜索工具调用
    const searchTool = {
      type: 'function' as const,
      function: {
        name: 'web_search',
        description: 'Search the web for current information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query'
            }
          },
          required: ['query']
        }
      }
    };

    const enhancedParams = {
      ...params,
      tools: [...(params.tools || []), searchTool]
    };

    return this.generateText(enhancedParams);
  }

  // 带网络搜索的流式生成
  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    const searchTool = {
      type: 'function' as const,
      function: {
        name: 'web_search',
        description: 'Search the web for current information',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query'
            }
          },
          required: ['query']
        }
      }
    };

    const enhancedParams = {
      ...params,
      tools: [...(params.tools || []), searchTool]
    };

    return this.generateTextStream(enhancedParams, callback);
  }

  // 工具调用功能
  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  // 流式工具调用
  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  // 测试连接（成功后刷新模型缓存）
  async testConnection(): Promise<boolean> {
    try {
      if (!this.config.modelId) {
        throw new Error('请填写模型 ID 后再测试连接');
      }

      const testParams: AIRequestParams = {
        model: this.config.modelId,
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      };

      await this.generateText(testParams);
      this.connectionStatus = 'connected';
      return true;
    } catch (error) {
      this.connectionStatus = 'error';
      this.cachedModels = null;
      throw error;
    }
  }

  // 构建请求体
  private buildRequestBody(params: AIRequestParams, stream: boolean = false): any {
    const requestBody: any = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? this.config.maxTokens ?? 2000,
      stream: stream
    };

    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
      requestBody.tool_choice = params.toolChoice || 'auto';
    }

    return requestBody;
  }

  // 解析响应
  private parseResponse(data: any): AIResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No response from OpenAI');
    }

    const response: AIResponse = {
      content: choice.message?.content || '',
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined,
      finishReason: choice.finish_reason
    };

    if (choice.message?.tool_calls) {
      response.toolCalls = choice.message.tool_calls;
    }

    return response;
  }

  // 处理流式数据
  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    // 处理思考内容（o1 系列模型）
    if (data.choices?.[0]?.delta?.reasoning_content) {
      callback.onReasoning?.(data.choices[0].delta.reasoning_content);
    }

    // 处理正常内容
    if (data.choices?.[0]?.delta?.content) {
      callback.onContent?.(data.choices[0].delta.content);
    }

    // 处理工具调用
    if (data.choices?.[0]?.delta?.tool_calls) {
      for (const toolCall of data.choices[0].delta.tool_calls) {
        callback.onToolCall?.(toolCall);
      }
    }

    // 完成回调
    if (data.choices?.[0]?.finish_reason) {
      callback.onComplete?.(this.parseResponse(data));
    }
  }

  // 获取模型显示名称
  private getModelDisplayName(modelId: string): string {
    const displayNames: Record<string, string> = {
      'gpt-4o': 'GPT-4o',
      'gpt-4-turbo': 'GPT-4 Turbo',
      'gpt-4': 'GPT-4',
      'gpt-3.5-turbo': 'GPT-3.5 Turbo',
      'gpt-4-vision': 'GPT-4 Vision',
      'text-embedding-3-large': 'Text Embedding 3 Large',
      'text-embedding-3-small': 'Text Embedding 3 Small',
      'text-embedding-ada-002': 'Text Embedding Ada 002'
    };

    return displayNames[modelId] || modelId;
  }

  // 获取模型最大令牌数
  private getModelMaxTokens(modelId: string): number {
    const maxTokens: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384,
      'gpt-4-vision': 128000
    };

    return maxTokens[modelId] || 4096;
  }

  // 检查模型是否已弃用
  private isModelDeprecated(modelId: string): boolean {
    const deprecatedModels = [
      'gpt-3.5-turbo-0301',
      'gpt-3.5-turbo-0613',
      'gpt-3.5-turbo-1106',
      'gpt-4-0314',
      'gpt-4-0613',
      'text-davinci-003',
      'text-davinci-002',
      'text-davinci-001',
      'text-curie-001',
      'text-babbage-001',
      'text-ada-001'
    ];

    return deprecatedModels.includes(modelId);
  }
}
