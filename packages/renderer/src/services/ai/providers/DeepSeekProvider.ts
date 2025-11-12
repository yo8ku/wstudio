/**
 * DeepSeek AI提供商实现
 * 功能：提供DeepSeek API的完整功能，包括推理、工具调用、网络搜索等
 * 描述：支持DeepSeek系列模型，包括DeepSeek Chat、DeepSeek Coder等
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

export class DeepSeekProvider extends BaseAIProvider {
  constructor() {
    super(
      'deepseek',
      'DeepSeek',
      'DeepSeek',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING
      ]
    );
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
      console.error('[DeepSeek] Failed to fetch models:', error);
      // 失败时返回空数组，不使用预定义模型
      return [];
    }
  }

  /**
   * 过滤预览版本模型，只保留最新的预览版本
   */
  private filterPreviewModels(models: AIModel[]): AIModel[] {
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
    
    if (previewModels.length === 0) {
      return nonPreviewModels;
    }
    
    const previewGroups = new Map<string, AIModel[]>();
    
    previewModels.forEach(model => {
      const baseName = this.extractModelBaseName(model.id);
      if (!previewGroups.has(baseName)) {
        previewGroups.set(baseName, []);
      }
      previewGroups.get(baseName)!.push(model);
    });
    
    const latestPreviews: AIModel[] = [];
    previewGroups.forEach((group) => {
      const sorted = group.sort((a, b) => {
        const dateA = this.extractModelDate(a.id);
        const dateB = this.extractModelDate(b.id);
        return dateB - dateA;
      });
      latestPreviews.push(sorted[0]);
    });
    
    return [...nonPreviewModels, ...latestPreviews];
  }
  
  private extractModelBaseName(modelId: string): string {
    const lower = modelId.toLowerCase();
    let baseName = lower.replace(/\d{4}-?\d{2}-?\d{2}/g, '');
    baseName = baseName.replace(/-+/g, '-').replace(/^-|-$/g, '');
    return baseName;
  }
  
  private extractModelDate(modelId: string): number {
    const lower = modelId.toLowerCase();
    const dateMatch = lower.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const day = parseInt(dateMatch[3]);
      return new Date(year, month - 1, day).getTime();
    }
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

    if (modelId.includes('deepseek-chat')) {
      capabilities.push(
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING
      );
    }

    if (modelId.includes('deepseek-coder')) {
      capabilities.push(
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING
      );
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
      this.handleError(error, 'Failed to generate text');
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
        body: JSON.stringify(requestBody)
      });

      await this.handleStreamResponse(response, callback);
    } catch (error) {
      this.handleError(error, 'Failed to generate text stream');
    }
  }

  // 网络搜索功能
  async searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    // DeepSeek本身不提供网络搜索，这里可以实现第三方搜索API集成
    throw new Error('Web search not directly supported by DeepSeek. Use function calling with web search tools.');
  }

  // 带网络搜索的生成
  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
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

  // 测试连接
  async testConnection(): Promise<boolean> {
    try {
      const testParams: AIRequestParams = {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        maxTokens: 10
      };

      await this.generateText(testParams);
      this.connectionStatus = 'connected';
      
      // 注意：测试连接时不再自动保存配置，只在用户点击"保存配置"时才保存
      // 这样可以避免重复创建配置记录
      
      return true;
    } catch (error) {
      this.connectionStatus = 'error';
      
      // 测试失败时，清空缓存的模型列表
      this.cachedModels = null;
      
      // 抛出原始错误，让调用方获取服务商返回的具体错误信息
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
      throw new Error('No response from DeepSeek');
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
    // 处理思考内容（DeepSeek R1 系列模型）
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
      'deepseek-chat': 'DeepSeek Chat',
      'deepseek-coder': 'DeepSeek Coder'
    };

    return displayNames[modelId] || modelId;
  }

  // 获取模型最大令牌数
  private getModelMaxTokens(modelId: string): number {
    const maxTokens: Record<string, number> = {
      'deepseek-chat': 32768,
      'deepseek-coder': 16384
    };

    return maxTokens[modelId] || 4096;
  }

  // 检查模型是否已弃用
  private isModelDeprecated(modelId: string): boolean {
    const deprecatedModels = [
      'deepseek-chat-6.7b',
      'deepseek-chat-1.3b'
    ];

    return deprecatedModels.includes(modelId);
  }
}
