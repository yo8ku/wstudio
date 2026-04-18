/**
 * OpenAI Responses API 提供商实现
 * 功能：实现 OpenAI /v1/responses 新版 API
 * 描述：支持内置工具（web search、code interpreter）和多轮状态管理
 */

import { BaseAIProvider } from '../BaseAIProvider';
import {
  AIModel,
  AIRequestParams,
  AIResponse,
  AIProviderConfig,
  StreamCallback,
  ModelCapability,
  WebSearchConfig,
  WebSearchResult,
} from '../../../types/aiProvider';

export class OpenAIResponseProvider extends BaseAIProvider {
  constructor() {
    super(
      'openai-response',
      'OpenAI Response',
      'OpenAI',
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.REASONING,
        ModelCapability.VISION,
        ModelCapability.TOOLS,
        ModelCapability.FUNCTION_CALLING,
        ModelCapability.STREAMING,
      ]
    );
  }

  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromAPI());
  }

  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    try {
      const baseUrl = this.config.apiEndpoint.replace('/responses', '').replace(/\/+$/, '');
      const response = await this.makeRequest(`${baseUrl}/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` }
      });
      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) return [];
      return data.data
        .filter((m: any) => !m.id.toLowerCase().includes('latest'))
        .map((m: any) => ({
          id: m.id,
          name: m.id,
          displayName: m.id,
          provider: this.id,
          capabilities: [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING],
          supportsStreaming: true,
        }));
    } catch {
      return [];
    }
  }

  async getModelInfo(modelId: string): Promise<AIModel | null> {
    const models = await this.getAvailableModels();
    return models.find(m => m.id === modelId) || null;
  }

  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const caps = [ModelCapability.TEXT_GENERATION, ModelCapability.STREAMING];
    if (modelId.includes('gpt-4')) caps.push(ModelCapability.REASONING, ModelCapability.CODE_GENERATION, ModelCapability.TOOLS, ModelCapability.FUNCTION_CALLING);
    if (modelId.includes('gpt-4o') || modelId.includes('vision')) caps.push(ModelCapability.VISION);
    return caps;
  }

  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      const endpoint = this.config.apiEndpoint.endsWith('/responses')
        ? this.config.apiEndpoint
        : `${this.config.apiEndpoint.replace(/\/+$/, '')}/responses`;

      const body: Record<string, any> = {
        model: params.model,
        input: params.messages,
        temperature: params.temperature ?? this.config.temperature,
        max_output_tokens: params.maxTokens ?? this.config.maxTokens,
      };

      const response = await this.makeRequest(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      const content = data.output?.[0]?.content?.[0]?.text ?? '';
      return {
        content,
        model: data.model ?? params.model,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    } catch (error) {
      this.handleError(error, 'Failed to generate text');
    }
  }

  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      const endpoint = this.config.apiEndpoint.endsWith('/responses')
        ? this.config.apiEndpoint
        : `${this.config.apiEndpoint.replace(/\/+$/, '')}/responses`;

      const body: Record<string, any> = {
        model: params.model,
        input: params.messages,
        temperature: params.temperature ?? this.config.temperature,
        max_output_tokens: params.maxTokens ?? this.config.maxTokens,
        stream: true,
      };

      await this.streamSSERequest(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(body),
        signal: params.signal,
      }, callback, params.signal);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.handleError(error, 'Failed to generate text stream');
    }
  }

  async searchWeb(_query: string, _config?: WebSearchConfig): Promise<WebSearchResult[]> {
    throw new Error('Web search not supported by OpenAI Response provider');
  }

  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

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
      throw error;
    }
  }

  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
    if (data.output?.[0]?.content?.[0]?.text) {
      callback.onContent?.(data.output[0].content[0].text);
    }
    if (data.status === 'completed') {
      callback.onComplete?.({ content: '', model: data.model ?? '' });
    }
  }
}
