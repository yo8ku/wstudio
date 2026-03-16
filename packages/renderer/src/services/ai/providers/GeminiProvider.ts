/**
 * Google Gemini AI提供商实现
 * 使用 OpenAI 兼容模式调用 Gemini API
 * 官方文档: https://ai.google.dev/gemini-api/docs/openai
 * 
 * Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
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
  ChatMessage
} from '../../../types/aiProvider';
import { getProviderModels } from '../index';

// Gemini OpenAI 兼容模式的 Base URL
const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export class GeminiProvider extends BaseAIProvider {
  // 重试配置
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000;
  private readonly RETRY_BACKOFF_MULTIPLIER = 1.5;

  constructor() {
    super(
      'gemini',
      'Google Gemini',
      'Gemini',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.VISION,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
        ModelCapability.WEB_SEARCH
      ]
    );
  }

  /**
   * 延迟函数
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查错误是否可以重试
   */
  private isRetryableError(error: any): boolean {
    if (error?.code === 503 || error?.status === 503) return true;
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('overloaded') || msg.includes('unavailable')) return true;
    return false;
  }

  /**
   * 提取错误消息
   */
  private extractErrorMessage(error: any): string {
    const code = error?.code || error?.status || error?.error?.code;
    if (code === 429) {
      return '您已超出配额限制，请检查您的计划与计费详情。';
    }

    let msg = error?.message || error?.toString() || 'Unknown error';
    
    // 尝试解析 JSON 错误
    try {
      if (typeof msg === 'string' && msg.trim().startsWith('{')) {
        const parsed = JSON.parse(msg);
        if (parsed.error?.code === 429) {
          return '您已超出配额限制，请检查您的计划与计费详情。';
        }
        msg = parsed.error?.message || parsed.message || msg;
      }
    } catch {}

    const lower = msg.toLowerCase();
    if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('too many requests')) {
      return '您已超出配额限制，请检查您的计划与计费详情。';
    }

    return msg;
  }

  /**
   * 带重试的请求包装器（Gemini 专用）
   */
  private async withRetryGemini<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.RETRY_DELAY_MS * Math.pow(this.RETRY_BACKOFF_MULTIPLIER, attempt - 1);
          console.log(`[Gemini] ${context} - 重试 ${attempt}/${this.MAX_RETRIES}，等待 ${Math.round(delay)}ms...`);
          await this.sleep(delay);
        }
        return await fn();
      } catch (error) {
        lastError = error;
        if (!this.isRetryableError(error) || attempt === this.MAX_RETRIES) {
          throw error;
        }
        console.log(`[Gemini] ${context} - 遇到可重试错误:`, this.extractErrorMessage(error));
      }
    }

    throw lastError;
  }

  /**
   * 转换消息格式为 OpenAI 格式
   */
  private convertMessages(messages: ChatMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
      content: msg.content
    }));
  }

  // ==================== 模型管理 ====================

  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromConfig());
  }

  private async fetchModelsFromConfig(): Promise<AIModel[]> {
    try {
      const configModels = await getProviderModels('gemini');

      if (configModels && configModels.length > 0) {
        console.log('[Gemini] 从配置文件加载模型列表:', configModels.length, '个模型');

        return configModels.map(model => ({
          id: model.id,
          name: model.name,
          displayName: model.name,
          provider: this.id,
          capabilities: this.getCapabilitiesFromConfig(model),
          maxTokens: this.parseTokenLimit(model.limits?.context_tokens),
          supportsStreaming: model.limits?.stream ?? true,
          supportsTools: true,
          supportsVision: true,
          supportsFunctionCalling: true,
          supportsWebSearch: true
        }));
      }

      return [];
    } catch (error) {
      console.error('[Gemini] 从配置文件加载模型失败:', error);
      return [];
    }
  }

  private getCapabilitiesFromConfig(model: any): ModelCapability[] {
    const capabilities: ModelCapability[] = [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.WEB_SEARCH
    ];

    if (model.capabilities?.thinking) {
      capabilities.push(ModelCapability.REASONING);
    }

    return capabilities;
  }

  private parseTokenLimit(tokenStr?: string): number {
    if (!tokenStr) return 1000000;
    const match = tokenStr.match(/^(\d+)([KMB])?$/i);
    if (!match) return 1000000;

    const num = parseInt(match[1]);
    const unit = (match[2] || '').toUpperCase();

    switch (unit) {
      case 'K': return num * 1000;
      case 'M': return num * 1000000;
      case 'B': return num * 1000000000;
      default: return num;
    }
  }

  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(model => model.id === modelId) || null;
  }

  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const model = await this.getModelInfo(modelId);
    return model?.capabilities || [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING];
  }

  // ==================== 文本生成 ====================

  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      return await this.withRetryGemini(async () => {
        const messages = this.convertMessages(params.messages);
        const maxTokens = params.maxTokens ?? this.config.maxTokens ?? 8192;

        const requestBody: any = {
          model: params.model,
          messages,
          temperature: params.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: maxTokens
        };

        console.log('[Gemini] 📝 请求配置:', {
          model: params.model,
          temperature: requestBody.temperature,
          max_tokens: requestBody.max_tokens
        });

        const response = await this.makeRequest(
          `${GEMINI_OPENAI_BASE_URL}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }
        );

        const data = await response.json();

        return {
          content: data.choices?.[0]?.message?.content || '',
          model: params.model,
          finishReason: data.choices?.[0]?.finish_reason || 'stop',
          usage: data.usage ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0
          } : undefined
        };
      }, 'generateText');
    } catch (error) {
      const errorMessage = this.extractErrorMessage(error);
      this.handleError(error, errorMessage);
    }
  }


  // ==================== 流式生成 ====================

  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      if (params.signal?.aborted) {
        console.log('[Gemini] 请求已被中断，直接返回');
        return;
      }

      await this.withRetryGemini(async () => {
        const messages = this.convertMessages(params.messages);
        const maxTokens = params.maxTokens ?? this.config.maxTokens ?? 8192;

        const requestBody: any = {
          model: params.model,
          messages,
          temperature: params.temperature ?? this.config.temperature ?? 0.7,
          max_tokens: maxTokens,
          stream: true
        };

        console.log('[Gemini Stream] 📝 请求配置:', {
          model: params.model,
          temperature: requestBody.temperature,
          max_tokens: requestBody.max_tokens
        });

        const response = await fetch(`${GEMINI_OPENAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: params.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
          throw new Error('No response body for streaming');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let finishReason = 'stop';

        try {
          while (true) {
            if (params.signal?.aborted) {
              console.log('[Gemini] 检测到中断信号，停止处理流式响应');
              reader.cancel();
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;

              const jsonStr = trimmed.slice(5).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const data = JSON.parse(jsonStr);
                const delta = data.choices?.[0]?.delta;
                const content = delta?.content;

                if (content) {
                  fullText += content;
                  callback.onContent?.(content);
                }

                if (data.choices?.[0]?.finish_reason) {
                  finishReason = data.choices[0].finish_reason;
                }
              } catch (parseError) {
                // 忽略解析错误
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        console.log(`[Gemini] 📊 流式响应统计 - 内容长度: ${fullText.length} 字符, 完成原因: ${finishReason}`);

        callback.onComplete?.({
          content: fullText,
          model: params.model,
          finishReason
        });
      }, 'generateTextStream');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[Gemini] 流式请求已被用户中断');
        return;
      }
      const errorMessage = this.extractErrorMessage(error);
      this.handleError(error, errorMessage);
    }
  }

  // ==================== 网络搜索 ====================

  async searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    // Gemini OpenAI 兼容模式暂不支持独立的网络搜索
    throw new Error('Web search not implemented for Gemini OpenAI compatible mode');
  }

  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    // 直接调用普通生成，Gemini 会自动处理
    return this.generateText(params);
  }

  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  // ==================== 工具调用 ====================

  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  // ==================== 测试连接 ====================

  async testConnection(): Promise<boolean> {
    try {
      // 使用 OpenAI 兼容模式测试连接
      const response = await this.makeRequest(
        `${GEMINI_OPENAI_BASE_URL}/models`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      this.connectionStatus = 'connected';
      return true;
    } catch (error) {
      this.connectionStatus = 'error';
      this.cachedModels = null;
      throw error;
    }
  }

  // ==================== 流式数据处理（抽象方法实现） ====================

  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    // OpenAI 兼容模式使用 handleStreamResponse 处理，此方法不会被调用
    const content = data.choices?.[0]?.delta?.content;
    if (content) {
      callback.onContent?.(content);
    }
  }
}
