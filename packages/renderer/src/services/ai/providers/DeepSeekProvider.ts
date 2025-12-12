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
  ToolCall
} from '../../../types/aiProvider';
import { getProviderModels, getModelConfig } from '../index';

export class DeepSeekProvider extends BaseAIProvider {
  // DeepSeek 官方 API 端点
  static readonly DEFAULT_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';

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

  // 获取正确的 API 端点
  private getApiEndpoint(): string {
    const endpoint = this.config.apiEndpoint;
    // 如果端点不包含 /v1/，使用默认端点
    if (!endpoint || !endpoint.includes('/v1/')) {
      console.log('[DeepSeek] 使用默认 API 端点:', DeepSeekProvider.DEFAULT_API_ENDPOINT);
      return DeepSeekProvider.DEFAULT_API_ENDPOINT;
    }
    return endpoint;
  }

  // 获取可用模型列表（使用缓存机制）
  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromAPI());
  }

  // 从配置文件获取模型列表
  // 模型列表定义在 config.json 中
  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    try {
      // 从配置文件读取模型列表
      const configModels = await getProviderModels('deepseek');
      
      console.log('[DeepSeek] 从配置文件获取模型列表，数量:', configModels.length);
      
      const models: AIModel[] = [];
      
      for (const model of configModels) {
        const capabilities = await this.detectModelCapabilities(model.id);
        models.push({
          id: model.id,
          name: model.name,
          displayName: model.name,
          provider: this.id,
          capabilities,
          maxTokens: this.getModelMaxTokens(model.id),
          supportsStreaming: true,
          supportsTools: capabilities.includes(ModelCapability.TOOLS),
          supportsFunctionCalling: capabilities.includes(ModelCapability.FUNCTION_CALLING),
          isDeprecated: false
        });
      }
      
      return models;
    } catch (error) {
      console.error('[DeepSeek] Failed to load models from config:', error);
      return [];
    }
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
      const requestBody = await this.buildRequestBody(params);
      
      const response = await this.makeRequest(this.getApiEndpoint(), {
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
      const requestBody = await this.buildRequestBody(params, true);
      
      const response = await this.makeRequest(this.getApiEndpoint(), {
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
  private async buildRequestBody(params: AIRequestParams, stream: boolean = false): Promise<any> {
    const requestBody: any = {
      model: params.model,
      messages: params.messages,
      max_tokens: params.maxTokens ?? this.config.maxTokens ?? 2000,
      stream: stream
    };

    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
      requestBody.tool_choice = params.toolChoice || 'auto';
    }

    // 获取模型配置，检查是否支持 thinking
    // enable_thinking 放在 extra_body 中
    try {
      const modelConfig = await getModelConfig('deepseek', params.model);
      if (modelConfig?.capabilities?.thinking !== undefined) {
        // 如果模型配置中定义了 thinking 能力，添加到 extra_body
        requestBody.extra_body = {
          enable_thinking: modelConfig.capabilities.thinking
        };
        console.log(`[DeepSeek] 模型 ${params.model} extra_body.enable_thinking: ${modelConfig.capabilities.thinking}`);
      }
    } catch (error) {
      console.warn('[DeepSeek] 获取模型配置失败，跳过 enable_thinking 设置:', error);
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

    // 获取 reasoning_content（深度思考内容）
    if (choice.message?.reasoning_content) {
      response.reasoning = choice.message.reasoning_content;
    }

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

  /**
   * 估算文本的 token 数量
   * 规则：
   * - 1 个英文字符 ≈ 0.3 个 token
   * - 1 个中文字符 ≈ 0.6 个 token
   * @param text 要计算的文本
   * @returns 估算的 token 数量
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    let englishCount = 0;
    let chineseCount = 0;

    for (const char of text) {
      // 判断是否为中文字符（包括中文标点）
      // Unicode 范围：\u4e00-\u9fff 基本汉字，\u3000-\u303f 中文标点
      if (/[\u4e00-\u9fff\u3000-\u303f]/.test(char)) {
        chineseCount++;
      } else {
        englishCount++;
      }
    }

    // 计算 token 数量并向上取整
    const tokens = englishCount * 0.3 + chineseCount * 0.6;
    return Math.ceil(tokens);
  }

  // 最大上下文长度 128K tokens
  static readonly MAX_CONTEXT_LENGTH = 128 * 1024;

  /**
   * 计算上下文总长度
   * @param systemPrompt 系统提示词
   * @param userInput 用户输入
   * @param modelOutput 模型输出（可选，用于预估或已有输出）
   * @returns 上下文信息对象
   */
  calculateContextLength(
    systemPrompt: string,
    userInput: string,
    modelOutput: string = ''
  ): {
    systemTokens: number;
    userTokens: number;
    outputTokens: number;
    totalTokens: number;
    maxTokens: number;
    remainingTokens: number;
    isWithinLimit: boolean;
  } {
    const systemTokens = this.estimateTokens(systemPrompt);
    const userTokens = this.estimateTokens(userInput);
    const outputTokens = this.estimateTokens(modelOutput);
    const totalTokens = systemTokens + userTokens + outputTokens;
    const maxTokens = DeepSeekProvider.MAX_CONTEXT_LENGTH;
    const remainingTokens = maxTokens - totalTokens;

    return {
      systemTokens,
      userTokens,
      outputTokens,
      totalTokens,
      maxTokens,
      remainingTokens,
      isWithinLimit: totalTokens <= maxTokens
    };
  }

  /**
   * 检查上下文是否超出限制
   * @param systemPrompt 系统提示词
   * @param userInput 用户输入
   * @param expectedOutputTokens 预期输出 token 数（默认预留 4096）
   * @returns 是否在限制内
   */
  isContextWithinLimit(
    systemPrompt: string,
    userInput: string,
    expectedOutputTokens: number = 4096
  ): boolean {
    const systemTokens = this.estimateTokens(systemPrompt);
    const userTokens = this.estimateTokens(userInput);
    const totalTokens = systemTokens + userTokens + expectedOutputTokens;
    return totalTokens <= DeepSeekProvider.MAX_CONTEXT_LENGTH;
  }
}
