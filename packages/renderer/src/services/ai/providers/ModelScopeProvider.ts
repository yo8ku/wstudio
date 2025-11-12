/**
 * 魔塔社区AI提供商
 * 功能：提供魔塔社区AI服务的接口实现
 * 描述：魔塔社区需要在请求时指定模型ID，不支持获取模型列表
 */

import { BaseAIProvider } from '../BaseAIProvider';
import {
  AIModel,
  AIRequestParams,
  AIResponse,
  AIProviderConfig,
  StreamCallback,
  ModelCapability,
  AIProviderError
} from '../../../types/aiProvider';
import { diagnoseModelScopeConnection } from './ModelScopeHelper';

export class ModelScopeProvider extends BaseAIProvider {
  private modelId: string = '';
  private models: string[] = [];

  constructor() {
    super(
      'modelscope',
      '魔塔社区',
      '',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.STREAMING,
        ModelCapability.REASONING
      ]
    );
  }

  /**
   * 设置配置（重写以获取模型ID）
   */
  setConfig(config: AIProviderConfig): void {
    super.setConfig(config);
    // 从配置中获取模型ID（向后兼容）
    this.modelId = config.modelId || '';
    // 从配置中获取多个模型ID
    this.models = config.models || [];
    console.log(`[${this.name}] 设置配置:`, {
      modelId: this.modelId,
      models: this.models,
      apiEndpoint: config.apiEndpoint,
      hasApiKey: !!config.apiKey,
      configModelId: config.modelId
    });
  }

  /**
   * 获取聊天完成端点URL
   * 魔塔社区API: base_url + /chat/completions
   * 与诊断工具保持一致的逻辑
   */
  private getChatCompletionsEndpoint(): string {
    let apiEndpoint = this.config.apiEndpoint;
    
    // 移除末尾的斜杠
    apiEndpoint = apiEndpoint.replace(/\/+$/, '');
    
    // 如果已经包含 /chat/completions，直接返回
    if (apiEndpoint.endsWith('/chat/completions')) {
      return apiEndpoint;
    }
    
    // 与诊断工具保持一致：如果以 /v1 结尾，直接添加 /chat/completions
    // 否则，添加 /v1/chat/completions
    if (apiEndpoint.endsWith('/v1')) {
      return `${apiEndpoint}/chat/completions`;
    }
    
    // 如果只是 base_url (例如 https://api-inference.modelscope.cn)
    // 则添加 /v1/chat/completions
    return `${apiEndpoint}/v1/chat/completions`;
  }

  /**
   * 获取可用模型列表
   * 魔塔社区不提供模型列表API，返回用户配置的模型
   */
  async getAvailableModels(): Promise<AIModel[]> {
    console.log(`[${this.name}] getAvailableModels 被调用`, {
      'this.modelId': this.modelId,
      'this.models': this.models,
      'this.config.modelId': (this.config as any).modelId,
      'this.config.models': (this.config as any).models,
      'modelId类型': typeof this.modelId,
      'modelId长度': this.modelId?.length,
      'models长度': this.models?.length,
      'modelId是否为空': !this.modelId,
      'models是否为空': !this.models || this.models.length === 0
    });

    // 优先使用 models 数组，如果为空则使用单个 modelId（向后兼容）
    const modelIds = this.models && this.models.length > 0 ? this.models : (this.modelId ? [this.modelId] : []);

    if (modelIds.length === 0) {
      console.warn(`[${this.name}] ❌ 未配置模型ID，返回空列表`);
      console.warn(`[${this.name}] 请确保：`);
      console.warn(`[${this.name}]   1. 已调用 setConfig() 并传入了 modelId 或 models`);
      console.warn(`[${this.name}]   2. modelId 或 models 不是空`);
      console.warn(`[${this.name}]   3. configure() 已成功执行`);
      return [];
    }

    console.log(`[${this.name}] ✓ 模型ID已配置，共 ${modelIds.length} 个:`, modelIds);

    // 返回所有配置的模型
    const models: AIModel[] = modelIds.map(modelId => ({
      id: modelId,
      name: modelId,
      displayName: this.getModelDisplayName(modelId),
      provider: this.id,
      capabilities: [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.STREAMING,
        ModelCapability.REASONING
      ],
      maxTokens: this.getModelMaxTokens(modelId),
      supportsStreaming: true,
      supportsTools: false,
      supportsVision: modelId.includes('vision'),
      supportsFunctionCalling: false,
      isDeprecated: false
    }));

    console.log(`[${this.name}] ✓ 返回 ${models.length} 个模型:`, models);
    return models;
  }

  /**
   * 获取模型显示名称
   */
  private getModelDisplayName(modelId: string): string {
    // 从 model-id 中提取友好名称
    // 例如：ZhipuAI/GLM-4.6 -> GLM-4.6
    // 例如：deepseek-ai/DeepSeek-V3.2-Exp -> DeepSeek-V3.2-Exp
    const parts = modelId.split('/');
    const modelName = parts[parts.length - 1];
    
    // 直接返回模型名称，保持原有格式
    // 不进行任何替换，保持 GLM-4.6 这样的格式
    return modelName;
  }

  /**
   * 获取模型最大 tokens
   */
  private getModelMaxTokens(modelId: string): number {
    // 根据模型名称推断最大tokens
    const lowerModelId = modelId.toLowerCase();
    
    if (lowerModelId.includes('32k')) return 32000;
    if (lowerModelId.includes('64k')) return 64000;
    if (lowerModelId.includes('128k')) return 128000;
    
    // 默认值
    return 8000;
  }

  /**
   * 获取认证头
   */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }

  /**
   * 生成文本（非流式）
   */
  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      // 🔥 修复：优先使用参数中的模型ID，确保模型切换生效
      const requestModel = params.model || this.modelId;
      
      const response = await this.makeRequest(this.getChatCompletionsEndpoint(), {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          model: requestModel,
          messages: params.messages,
          temperature: params.temperature ?? this.config.temperature,
          max_tokens: params.maxTokens ?? this.config.maxTokens,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AIProviderError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          this.id,
          errorData.error?.code,
          response.status
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      return {
        content: choice?.message?.content || '',
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        finishReason: choice?.finish_reason,
        toolCalls: choice?.message?.tool_calls
      };
    } catch (error) {
      console.error(`[${this.name}] 生成文本失败:`, error);
      throw error;
    }
  }

  /**
   * 生成文本（流式）
   * 支持魔塔社区的推理内容（reasoning_content）
   */
  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      // 🔥 修复：优先使用参数中的模型ID，确保模型切换生效
      const requestModel = params.model || this.modelId;
      const endpoint = this.getChatCompletionsEndpoint();
      
      console.log(`[${this.name}] 🚀 发送流式请求:`, {
        endpoint,
        model: requestModel,
        requestModelFromParams: params.model,
        configModelId: this.modelId,
        apiEndpoint: this.config.apiEndpoint,
        hasApiKey: !!this.config.apiKey,
        messagesCount: params.messages?.length,
        hasAbortSignal: !!params.signal
      });
      
      const response = await this.makeRequest(endpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          model: requestModel,
          messages: params.messages,
          temperature: params.temperature ?? this.config.temperature,
          max_tokens: params.maxTokens ?? this.config.maxTokens,
          stream: true
        }),
        signal: params.signal // 传递 AbortSignal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new AIProviderError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          this.id,
          errorData.error?.code,
          response.status
        );
        callback.onError?.(error);
        throw error;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let fullReasoning = '';
      let usage: AIResponse['usage'] | undefined;
      let doneReasoning = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              
              // 处理推理内容（reasoning_content）
              if (delta?.reasoning_content) {
                fullReasoning += delta.reasoning_content;
                callback.onReasoning?.(delta.reasoning_content);
              }
              
              // 处理答案内容（content）
              if (delta?.content) {
                // 如果之前有推理内容且还未标记完成，标记推理完成
                if (fullReasoning && !doneReasoning) {
                  doneReasoning = true;
                  console.log('\n\n === Final Answer ===\n');
                }
                
                fullContent += delta.content;
                callback.onContent?.(delta.content);
              }
              
              // 处理工具调用（虽然魔塔社区一般不支持）
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  callback.onToolCall?.(toolCall);
                }
              }

              // 处理使用统计
              if (parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens
                };
              }
            } catch (e) {
              console.warn(`[${this.name}] 解析流数据失败:`, e);
            }
          }
        }
      }

      callback.onComplete?.({
        content: fullContent,
        model: requestModel,
        usage
      });
    } catch (error) {
      // 如果是用户主动中断，不记录错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[${this.name}] 流式请求已被用户中断`);
        return;
      }
      
      console.error(`[${this.name}] 流式生成失败:`, error);
      if (error instanceof Error) {
        callback.onError?.(error);
      }
      throw error;
    }
  }

  /**
   * 测试连接
   * 魔塔社区需要模型ID才能测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`[${this.name}] 测试连接 - 当前状态:`, {
        'this.modelId': this.modelId,
        'this.models': this.models,
        'this.config.modelId': (this.config as any).modelId,
        'this.config.models': (this.config as any).models,
        'config对象': this.config,
        'modelId是否为空': !this.modelId,
        'models是否为空': !this.models || this.models.length === 0,
        'modelId长度': this.modelId?.length,
        'models长度': this.models?.length
      });

      // 优先使用 models 数组，如果为空则使用单个 modelId（向后兼容）
      const modelIds = this.models && this.models.length > 0 ? this.models : (this.modelId ? [this.modelId] : []);

      if (modelIds.length === 0) {
        console.error(`[${this.name}] ❌ 测试连接失败：未配置模型ID`);
        console.error(`[${this.name}] 请检查：`);
        console.error(`[${this.name}]   1. 是否填写了模型ID字段`);
        console.error(`[${this.name}]   2. setConfig() 是否被正确调用`);
        console.error(`[${this.name}]   3. 配置对象是否包含 modelId 或 models 属性`);
        throw new Error('请配置模型ID');
      }

      // 使用第一个模型ID进行测试
      const testModelId = modelIds[0];
      console.log(`[${this.name}] ✓ 模型ID已配置，共 ${modelIds.length} 个，使用第一个进行测试: ${testModelId}`);
      console.log(`[${this.name}] 测试连接配置:`, {
        apiEndpoint: this.config.apiEndpoint,
        modelId: testModelId,
        hasApiKey: !!this.config.apiKey
      });

      // 使用诊断工具进行详细检查
      console.log(`[${this.name}] 开始诊断连接...`);
      const diagnosis = await diagnoseModelScopeConnection(
        this.config.apiEndpoint,
        this.config.apiKey,
        testModelId
      );

      if (!diagnosis.success) {
        console.error(`[${this.name}] 诊断失败:`, diagnosis.error);
        if (diagnosis.suggestions && diagnosis.suggestions.length > 0) {
          console.log(`[${this.name}] 建议:`, diagnosis.suggestions.join('\n'));
        }
        if (diagnosis.details) {
          console.log(`[${this.name}] 详细信息:`, diagnosis.details);
        }
        throw new Error(diagnosis.error || '连接失败');
      }

      console.log(`[${this.name}] 诊断成功！`);
      if (diagnosis.details) {
        console.log(`[${this.name}] 详细信息:`, diagnosis.details);
      }
      if (diagnosis.suggestions && diagnosis.suggestions.length > 0) {
        console.warn(`[${this.name}] 提示:`, diagnosis.suggestions.join('\n'));
      }

      return true;
    } catch (error) {
      console.error(`[${this.name}] 连接测试异常:`, {
        error,
        message: error instanceof Error ? error.message : '未知错误',
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * 获取模型信息
   */
  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(m => m.id === modelId) || null;
  }

  /**
   * 检测模型能力
   */
  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    // 返回魔塔社区支持的默认能力
    return [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING,
      ModelCapability.REASONING
    ];
  }

  /**
   * 强制刷新模型列表
   */
  async forceRefreshModels(): Promise<AIModel[]> {
    // 魔塔社区不需要刷新，直接返回当前配置的模型
    return this.getAvailableModels();
  }

  /**
   * 网络搜索功能（不支持）
   */
  async searchWeb(query: string, config?: any): Promise<any[]> {
    throw new Error(`Web search not supported by ${this.name}`);
  }

  /**
   * 带网络搜索的生成（不支持）
   */
  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  /**
   * 带网络搜索的流式生成（不支持）
   */
  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  /**
   * 工具调用功能（不支持）
   */
  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  /**
   * 流式工具调用（不支持）
   */
  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  /**
   * 处理流式数据（SSE格式）
   */
  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    // 处理推理内容
    if (data.choices?.[0]?.delta?.reasoning_content) {
      callback.onReasoning?.(data.choices[0].delta.reasoning_content);
    }

    // 处理内容
    if (data.choices?.[0]?.delta?.content) {
      callback.onContent?.(data.choices[0].delta.content);
    }

    // 处理工具调用
    if (data.choices?.[0]?.delta?.tool_calls) {
      for (const toolCall of data.choices[0].delta.tool_calls) {
        callback.onToolCall?.(toolCall);
      }
    }

    // 完成时触发回调
    if (data.choices?.[0]?.finish_reason) {
      const response: AIResponse = {
        content: '',
        model: data.model || '',
        finishReason: data.choices[0].finish_reason
      };
      
      if (data.usage) {
        response.usage = {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        };
      }
      
      callback.onComplete?.(response);
    }
  }
}

