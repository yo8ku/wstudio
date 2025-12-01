/**
 * Anthropic AI提供商实现
 * 功能：提供Anthropic Claude API的完整功能，包括推理、工具调用、网络搜索等
 * 描述：支持Claude系列模型，包括Claude 3.5 Sonnet、Claude 3 Opus、Claude 3 Haiku等
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

export class AnthropicProvider extends BaseAIProvider {
  constructor() {
    super(
      'anthropic',
      'Anthropic',
      'Claude',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.VISION,
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

  // 从API获取模型列表（Anthropic没有公开API，只能从缓存加载）
  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    // Anthropic没有公开的模型列表API，无法获取真实模型列表
    // 返回空数组，由用户手动配置模型ID
    console.warn('[Anthropic] No public models API available. Please configure model ID manually.');
    return [];
  }

  // 获取模型信息
  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(model => model.id === modelId) || null;
  }

  // 检测模型能力
  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const model = await this.getModelInfo(modelId);
    return model?.capabilities || [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING];
  }

  // 生成文本
  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      const requestBody = this.buildRequestBody(params);
      
      const response = await this.makeRequest(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
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
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
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
    // Anthropic本身不提供网络搜索，这里可以实现第三方搜索API集成
    throw new Error('Web search not directly supported by Anthropic. Use function calling with web search tools.');
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

  // 测试连接
  async testConnection(): Promise<boolean> {
    try {
      const testParams: AIRequestParams = {
        model: 'claude-3-haiku-20240307',
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
      max_tokens: params.maxTokens ?? this.config.maxTokens ?? 2000,
      messages: this.convertMessages(params.messages),
      stream: stream
    };

    if (params.temperature !== undefined) {
      requestBody.temperature = params.temperature;
    } else if (this.config.temperature !== undefined) {
      requestBody.temperature = this.config.temperature;
    }

    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    return requestBody;
  }

  // 转换消息格式
  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => {
      const converted: any = {
        role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'user' : 'user',
        content: msg.content
      };

      if (msg.tool_calls) {
        converted.tool_use = msg.tool_calls;
      }

      if (msg.tool_call_id) {
        converted.tool_use_id = msg.tool_call_id;
      }

      return converted;
    });
  }

  // 解析响应
  private parseResponse(data: any): AIResponse {
    const response: AIResponse = {
      content: data.content?.[0]?.text || '',
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens
      } : undefined,
      finishReason: data.stop_reason
    };

    if (data.content?.[0]?.tool_use) {
      response.toolCalls = data.content[0].tool_use.map((tool: any) => ({
        id: tool.id,
        type: 'function',
        function: {
          name: tool.name,
          arguments: JSON.stringify(tool.input)
        }
      }));
    }

    return response;
  }

  // 处理流式数据
  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    if (data.type === 'content_block_delta' && data.delta?.text) {
      callback.onContent?.(data.delta.text);
    }

    if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
      // 处理工具调用开始
    }

    if (data.type === 'content_block_delta' && data.delta?.partial_json) {
      // 处理工具调用参数
    }

    if (data.type === 'message_stop') {
      callback.onComplete?.(this.parseResponse(data));
    }
  }
}
