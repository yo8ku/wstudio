/**
 * 自定义AI提供商 - 支持所有兼容 OpenAI API 格式的服务
 * 功能：提供通用的 OpenAI 兼容 API 接口实现
 * 描述：支持 xAI、Kimi、GLM、OpenRouter、Ollama、Azure OpenAI 以及其他自定义服务商
 */

import { BaseAIProvider } from '../BaseAIProvider';
import {
  AIModel,
  AIRequestParams,
  AIResponse,
  AIProviderConfig,
  StreamCallback,
  ChatMessage,
  ModelCapability,
  AIProviderError
} from '../../../types/aiProvider';
import { modelCapabilityDetector } from '../../modelCapabilityDetector';

export class CustomProvider extends BaseAIProvider {
  constructor(providerId: string = 'custom', providerName: string = '自定义', providerIcon: string = '') {
    super(
      providerId,
      providerName,
      providerIcon,
      [
        ModelCapability.TEXT_GENERATION,
        ModelCapability.CODE_GENERATION,
        ModelCapability.STREAMING
      ]
    );
  }

  // 获取可用模型列表（带缓存）
  async getAvailableModels(): Promise<AIModel[]> {
    return this.getModelsWithCache(() => this.fetchModelsFromAPI());
  }

  // 从 API 获取模型列表
  private async fetchModelsFromAPI(): Promise<AIModel[]> {
    try {
      // 根据不同的提供商构建模型端点
      const modelsEndpoint = this.getModelsEndpoint();
      
      console.log(`[${this.name}] 正在从 API 获取模型列表...`);
      console.log(`[${this.name}] API 端点: ${modelsEndpoint}`);

      const response = await this.makeRequest(modelsEndpoint, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      const data = await response.json();
      const tempModels: AIModel[] = [];

      // 处理不同格式的响应
      let modelList: any[] = [];
      
      // Ollama 格式: { models: [...] }
      if (data.models && Array.isArray(data.models)) {
        modelList = data.models.map((m: any) => ({
          id: m.name || m.model || m.id,
          name: m.name || m.model || m.id
        }));
      }
      // 标准 OpenAI 格式: { data: [...] }
      else if (data.data && Array.isArray(data.data)) {
        modelList = data.data;
      }
      // 直接数组格式
      else if (Array.isArray(data)) {
        modelList = data;
      }

      for (const model of modelList) {
        const modelId = model.id || model.name || model.model;
        
        // 过滤：跳过包含 latest 的模型
        if (modelId.toLowerCase().includes('latest')) {
          continue;
        }
        
        const capabilities = await this.detectModelCapabilities(modelId);
        tempModels.push({
          id: modelId,
          name: modelId,
          displayName: this.getModelDisplayName(modelId),
          provider: this.id,
          capabilities,
          maxTokens: this.getModelMaxTokens(modelId),
          supportsStreaming: true,
          supportsTools: capabilities.includes(ModelCapability.TOOLS),
          supportsVision: capabilities.includes(ModelCapability.VISION),
          supportsFunctionCalling: capabilities.includes(ModelCapability.FUNCTION_CALLING),
          isDeprecated: this.isModelDeprecated(modelId)
        });
      }

      // 过滤废弃模型
      const nonDeprecatedModels = tempModels.filter(model => !model.isDeprecated);
      
      console.log(`[${this.name}] 从 API 获取到 ${nonDeprecatedModels.length} 个模型`);
      
      return this.filterPreviewModels(nonDeprecatedModels);
    } catch (error) {
      console.error(`[${this.name}] 获取模型失败:`, error);
      // 失败时返回空数组，不使用预定义模型
      return [];
    }
  }

  /**
   * 规范化端点URL，确保包含协议
   */
  private normalizeEndpoint(endpoint: string): string {
    const trimmed = endpoint.trim();
    
    // 如果已经包含协议，直接返回
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    
    // 如果是localhost，默认使用http://
    if (trimmed.includes('localhost') || trimmed.startsWith('127.0.0.1')) {
      return `http://${trimmed}`;
    }
    
    // 其他情况默认使用https://
    return `https://${trimmed}`;
  }

  /**
   * 获取模型端点
   * 根据不同的 API 端点格式构建模型列表端点
   */
  private getModelsEndpoint(): string {
    const endpoint = this.normalizeEndpoint(this.config.apiEndpoint);
    
    // Azure OpenAI 的特殊处理
    if (this.id === 'azure' || endpoint.includes('azure.com')) {
      // Azure OpenAI 的模型列表端点
      const baseUrl = endpoint.split('/openai/deployments')[0];
      return `${baseUrl}/openai/models?api-version=2024-02-15-preview`;
    }
    
    // OpenRouter 的特殊处理
    if (this.id === 'openrouter' || endpoint.includes('openrouter.ai')) {
      return 'https://openrouter.ai/api/v1/models';
    }
    
    // Ollama 的特殊处理
    if (this.id === 'ollama' || endpoint.includes('localhost:11434')) {
      let baseUrl = endpoint.replace('/v1/chat/completions', '').replace('/chat/completions', '');
      baseUrl = baseUrl.replace(/\/+$/, ''); // 移除末尾的斜杠
      return `${baseUrl}/api/tags`;
    }
    
    // Lm Studio 的特殊处理
    if (this.id === 'lmstudio' || endpoint.includes('localhost:1234')) {
      let baseUrl = endpoint.replace('/v1/chat/completions', '').replace('/chat/completions', '');
      baseUrl = baseUrl.replace(/\/+$/, ''); // 移除末尾的斜杠
      return `${baseUrl}/v1/models`;
    }
    
    // 标准 OpenAI 兼容端点处理
    // 如果端点包含 /chat/completions，替换为 /models
    if (endpoint.includes('/chat/completions')) {
      return endpoint.replace('/chat/completions', '/models');
    }
    
    // 如果端点包含 /v1/chat/completions，替换为 /v1/models
    if (endpoint.includes('/v1/chat/completions')) {
      return endpoint.replace('/v1/chat/completions', '/v1/models');
    }
    
    // 如果端点以 /v1 结尾，直接添加 /models
    if (endpoint.endsWith('/v1')) {
      return `${endpoint}/models`;
    }
    
    // 如果端点以 /v1/ 结尾，添加 models
    if (endpoint.endsWith('/v1/')) {
      return `${endpoint}models`;
    }
    
    // 如果端点不包含路径，尝试添加 /v1/models
    // 检查是否只包含域名（没有路径或只有根路径）
    try {
      const url = new URL(endpoint);
      if (url.pathname === '/' || url.pathname === '') {
        // 只有域名，添加 /v1/models
        return `${endpoint.replace(/\/+$/, '')}/v1/models`;
      }
    } catch {
      // 如果 URL 解析失败，继续使用原始逻辑
    }
    
    // 默认情况：移除末尾斜杠后添加 /v1/models
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    return `${cleanEndpoint}/v1/models`;
  }

  /**
   * 获取聊天端点
   * 规范化 API 端点，确保包含正确的路径
   */
  private getChatEndpoint(): string {
    const endpoint = this.normalizeEndpoint(this.config.apiEndpoint);
    
    // Azure OpenAI 的特殊处理
    if (this.id === 'azure' || endpoint.includes('azure.com')) {
      return endpoint; // Azure 端点已经包含完整路径
    }
    
    // 如果端点已经包含 /chat/completions 或 /messages，直接返回
    if (endpoint.includes('/chat/completions') || endpoint.includes('/messages')) {
      return endpoint;
    }
    
    // 如果端点以 /v1 结尾，添加 /chat/completions
    if (endpoint.endsWith('/v1')) {
      return `${endpoint}/chat/completions`;
    }
    
    // 如果端点以 /v1/ 结尾，添加 chat/completions
    if (endpoint.endsWith('/v1/')) {
      return `${endpoint}chat/completions`;
    }
    
    // 如果端点不包含路径，尝试添加 /v1/chat/completions
    try {
      const url = new URL(endpoint);
      if (url.pathname === '/' || url.pathname === '') {
        // 只有域名，添加 /v1/chat/completions
        return `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
      }
    } catch {
      // 如果 URL 解析失败，继续使用原始逻辑
    }
    
    // 默认情况：移除末尾斜杠后添加 /v1/chat/completions
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    return `${cleanEndpoint}/v1/chat/completions`;
  }

  /**
   * 获取认证头
   * 根据不同的提供商返回不同的认证头格式
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Azure OpenAI 使用 api-key 头
    if (this.id === 'azure' || this.config.apiEndpoint.includes('azure.com')) {
      headers['api-key'] = this.config.apiKey;
    }
    // Ollama 和 Lm Studio 通常不需要认证
    else if (
      this.id === 'ollama' || 
      this.id === 'lmstudio' || 
      this.config.apiEndpoint.includes('localhost:11434') ||
      this.config.apiEndpoint.includes('localhost:1234')
    ) {
      // 本地服务不需要 API key
    }
    // 标准 Bearer token 认证
    else {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    
    return headers;
  }

  /**
   * 过滤预览版本模型，只保留最新的预览版本
   */
  private filterPreviewModels(models: AIModel[]): AIModel[] {
    const previewModels: AIModel[] = [];
    const stableModels: AIModel[] = [];
    
    // 分离预览版本和稳定版本
    for (const model of models) {
      if (model.id.includes('-preview') || model.id.includes('-beta')) {
        previewModels.push(model);
      } else {
        stableModels.push(model);
      }
    }
    
    // 按模型系列分组预览版本
    const previewGroups = new Map<string, AIModel[]>();
    for (const model of previewModels) {
      const baseName = model.id.replace(/-preview.*|-beta.*/, '');
      if (!previewGroups.has(baseName)) {
        previewGroups.set(baseName, []);
      }
      previewGroups.get(baseName)!.push(model);
    }
    
    // 每个系列只保留最新的预览版本
    const latestPreviews: AIModel[] = [];
    for (const [, group] of previewGroups) {
      if (group.length > 0) {
        // 按日期排序，保留最新的
        const sorted = group.sort((a, b) => {
          const dateA = this.extractDateFromModelId(a.id);
          const dateB = this.extractDateFromModelId(b.id);
          return dateB - dateA;
        });
        latestPreviews.push(sorted[0]);
      }
    }
    
    return [...stableModels, ...latestPreviews];
  }

  /**
   * 从模型 ID 中提取日期
   */
  private extractDateFromModelId(modelId: string): number {
    const dateMatch = modelId.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      return new Date(dateMatch[0]).getTime();
    }
    return 0;
  }

  /**
   * 获取模型显示名称
   */
  private getModelDisplayName(modelId: string): string {
    // 根据不同的提供商定制显示名称
    const displayNames: Record<string, string> = {
      // xAI Grok 模型
      'grok-beta': 'Grok Beta',
      'grok-vision-beta': 'Grok Vision Beta',
      
      // Kimi 模型
      'moonshot-v1-8k': 'Moonshot v1 8K',
      'moonshot-v1-32k': 'Moonshot v1 32K',
      'moonshot-v1-128k': 'Moonshot v1 128K',
      
      // GLM 模型
      'glm-4': 'GLM-4',
      'glm-4v': 'GLM-4 Vision',
      'glm-3-turbo': 'GLM-3 Turbo'
    };
    
    return displayNames[modelId] || modelId;
  }

  /**
   * 获取模型最大 tokens
   */
  private getModelMaxTokens(modelId: string): number {
    // 从模型名称中提取 token 限制
    const tokenMatch = modelId.match(/(\d+)k/i);
    if (tokenMatch) {
      return parseInt(tokenMatch[1]) * 1000;
    }
    
    // 默认值
    const defaultTokens: Record<string, number> = {
      'grok-beta': 128000,
      'grok-vision-beta': 128000,
      'moonshot-v1-8k': 8000,
      'moonshot-v1-32k': 32000,
      'moonshot-v1-128k': 128000,
      'glm-4': 128000,
      'glm-4v': 128000,
      'glm-3-turbo': 128000
    };
    
    return defaultTokens[modelId] || 4096;
  }

  /**
   * 检测模型能力
   */
  async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    const result = await modelCapabilityDetector.detectCapabilities(
      modelId,
      this.config.apiEndpoint,
      this.config.apiKey
    );
    // 转换为aiProvider的ModelCapability类型
    // 过滤掉aiProvider中不存在的能力
    const validCapabilities = result.capabilities.filter(cap => {
      const validCaps = [
        'text_generation',
        'code_generation',
        'reasoning',
        'vision',
        'tools',
        'function_calling',
        'web_search',
        'streaming',
        'embedding',
        'moderation'
      ];
      return validCaps.includes(cap as string);
    }).map(cap => cap as unknown as ModelCapability);
    return validCapabilities;
  }

  /**
   * 检查模型是否已废弃
   */
  private isModelDeprecated(modelId: string): boolean {
    // 添加已知的废弃模型列表
    const deprecatedModels: string[] = [
      // 可以在这里添加已废弃的模型
    ];
    
    return deprecatedModels.includes(modelId);
  }

  private normalizeSmartQuotes(value: string): string {
    return value
      // Double quotes: curly/full-width/HTML entities
      .replace(/[\u201C\u201D\u201E\u2033\uFF02]/g, '"')
      .replace(/&quot;|&#34;|&#x22;/gi, '"')
      // Single quotes: curly/full-width/HTML entities
      .replace(/[\u2018\u2019\u201A\u2032\uFF07]/g, "'")
      .replace(/&apos;|&#39;|&#x27;/gi, "'");
  }

  private parseToolParamValue(value: string): unknown {
    const normalized = this.normalizeSmartQuotes(value).trim();
    if (!normalized) return '';
    if (
      (normalized.startsWith('{') && normalized.endsWith('}'))
      || (normalized.startsWith('[') && normalized.endsWith(']'))
      || (normalized.startsWith('"') && normalized.endsWith('"'))
    ) {
      try {
        return JSON.parse(normalized);
      } catch {
        return normalized;
      }
    }
    return normalized;
  }

  private parseMiniMaxToolCallBlock(block: string): { id: string; type: 'function'; function: { name: string; arguments: string } } | null {
    const normalized = this.normalizeSmartQuotes(block);
    const invokeMatch = normalized.match(/<invoke\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/i);
    if (!invokeMatch) return null;
    const invokeName = (invokeMatch[1] ?? invokeMatch[2] ?? invokeMatch[3] ?? '').trim();
    if (!invokeName) return null;

    const args: Record<string, unknown> = {};
    const paramRegex = /<parameter\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/parameter>/gi;
    let match: RegExpExecArray | null;
    while ((match = paramRegex.exec(normalized)) !== null) {
      const key = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (!key) continue;
      const rawValue = match[4] ?? '';
      args[key] = this.parseToolParamValue(rawValue);
    }

    return {
      id: `minimax-tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'function',
      function: {
        name: invokeName,
        arguments: JSON.stringify(args),
      }
    };
  }

  private extractMiniMaxToolCallsFromText(text: string): {
    content: string;
    toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  } {
    const normalizedText = this.normalizeSmartQuotes(text);
    const minimaxBlockRegex = /(?:<\s*minimax:tool_call[^>]*>|(?<![</])minimax:tool_call)\s*([\s\S]*?)<\/\s*minimax:tool_call\s*>/gi;
    let visible = '';
    let cursor = 0;
    const toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];

    let match: RegExpExecArray | null;
    while ((match = minimaxBlockRegex.exec(normalizedText)) !== null) {
      const startIndex = match.index;
      if (startIndex > cursor) {
        visible += normalizedText.slice(cursor, startIndex);
      }
      const block = match[0];
      const parsed = this.parseMiniMaxToolCallBlock(block);
      if (parsed) {
        toolCalls.push(parsed);
      } else {
        visible += block;
      }
      cursor = startIndex + block.length;
    }

    if (cursor < normalizedText.length) {
      visible += normalizedText.slice(cursor);
    }

    return { content: visible, toolCalls };
  }

  /**
   * 生成文本（非流式）
   */
  async generateText(params: AIRequestParams): Promise<AIResponse> {
    try {
      const chatEndpoint = this.getChatEndpoint();
      const response = await this.makeRequest(chatEndpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? this.config.temperature,
          max_tokens: params.maxTokens ?? this.config.maxTokens,
          tools: params.tools,
          tool_choice: params.toolChoice,
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
      const messageContent = choice?.message?.content || '';
      const nativeToolCalls = choice?.message?.tool_calls;
      let normalizedContent = messageContent;
      let normalizedToolCalls = nativeToolCalls;

      if (
        (!nativeToolCalls || nativeToolCalls.length === 0)
        && typeof messageContent === 'string'
        && messageContent.includes('minimax:tool_call')
      ) {
        const extracted = this.extractMiniMaxToolCallsFromText(messageContent);
        if (extracted.toolCalls.length > 0) {
          normalizedContent = extracted.content;
          normalizedToolCalls = extracted.toolCalls as any;
        }
      }

      return {
        content: normalizedContent,
        model: data.model,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens
        } : undefined,
        finishReason: choice?.finish_reason,
        toolCalls: normalizedToolCalls
      };
    } catch (error) {
      console.error(`[${this.name}] 生成文本失败:`, error);
      throw error;
    }
  }

  /**
   * 生成文本（流式）
   */
  async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    try {
      const chatEndpoint = this.getChatEndpoint();
      const response = await this.makeRequest(chatEndpoint, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? this.config.temperature,
          max_tokens: params.maxTokens ?? this.config.maxTokens,
          tools: params.tools,
          tool_choice: params.toolChoice,
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
      let usage: AIResponse['usage'] | undefined;
      let minimaxContentBuffer = '';

      const emitVisibleContent = (text: string): void => {
        if (!text) return;
        fullContent += text;
        callback.onContent?.(text);
      };

      const flushMiniMaxToolCallBuffer = (force: boolean = false): void => {
        const endTag = '</minimax:tool_call>';
        const findMiniMaxStart = (text: string): number => {
          const marker = 'minimax:tool_call';
          let idx = text.indexOf(marker);
          while (idx >= 0) {
            const prev = idx > 0 ? text[idx - 1] : '';
            if (prev !== '/') {
              return prev === '<' ? idx - 1 : idx;
            }
            idx = text.indexOf(marker, idx + marker.length);
          }
          return -1;
        };

        while (minimaxContentBuffer.length > 0) {
          const start = findMiniMaxStart(minimaxContentBuffer);
          if (start < 0) {
            if (force || minimaxContentBuffer.length > 2048) {
              emitVisibleContent(minimaxContentBuffer);
              minimaxContentBuffer = '';
            }
            return;
          }

          if (start > 0) {
            emitVisibleContent(minimaxContentBuffer.slice(0, start));
            minimaxContentBuffer = minimaxContentBuffer.slice(start);
          }

          const end = minimaxContentBuffer.indexOf(endTag);
          if (end < 0) {
            if (force) {
              emitVisibleContent(minimaxContentBuffer);
              minimaxContentBuffer = '';
            }
            return;
          }

          const block = minimaxContentBuffer.slice(0, end + endTag.length);
          minimaxContentBuffer = minimaxContentBuffer.slice(end + endTag.length);
          const parsedToolCall = this.parseMiniMaxToolCallBlock(block);
          if (parsedToolCall) {
            callback.onToolCall?.(parsedToolCall as any);
          } else {
            emitVisibleContent(block);
          }
        }
      };

      while (true) {
        // 检查是否已取消
        if (params.signal?.aborted) {
          console.log(`[${this.name}] 流式响应已被取消`);
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        // 再次检查是否已取消（在读取数据后）
        if (params.signal?.aborted) {
          console.log(`[${this.name}] 流式响应已被取消`);
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // 在处理每行数据前检查是否已取消
          if (params.signal?.aborted) {
            console.log(`[${this.name}] 流式响应已被取消`);
            reader.cancel();
            break;
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              
              if (delta?.content) {
                minimaxContentBuffer += String(delta.content);
                flushMiniMaxToolCallBuffer(false);
              }
              
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  callback.onToolCall?.(toolCall);
                }
              }

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

      flushMiniMaxToolCallBuffer(true);

      callback.onComplete?.({
        content: fullContent,
        model: params.model,
        usage
      });
    } catch (error) {
      // 如果是取消操作，直接返回，不抛出错误
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
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log(`[${this.name}] 测试连接...`);
      const modelsEndpoint = this.getModelsEndpoint();
      console.log(`[${this.name}] 测试端点: ${modelsEndpoint}`);
      
      // makeRequest 会在失败时自动抛出错误（包含详细的错误信息）
      const response = await this.makeRequest(modelsEndpoint, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      // 如果到达这里，说明请求成功
      this.connectionStatus = 'connected';
      console.log(`[${this.name}] 连接测试成功`);
      
      return true;
    } catch (error) {
      console.error(`[${this.name}] 连接测试失败:`, error);
      this.connectionStatus = 'error';
      this.cachedModels = null;
      
      // 抛出原始错误，让调用方获取服务商返回的具体错误信息
      // makeRequest 已经处理了错误信息的提取，直接抛出即可
      throw error;
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
   * 强制刷新模型列表
   */
  async forceRefreshModels(): Promise<AIModel[]> {
    return this.refreshModels(() => this.fetchModelsFromAPI());
  }

  /**
   * 网络搜索功能（大部分自定义提供商不支持）
   */
  async searchWeb(query: string, config?: any): Promise<any[]> {
    throw new Error(`Web search not supported by ${this.name}`);
  }

  /**
   * 带网络搜索的生成（使用工具调用实现）
   */
  async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    // 大部分提供商可以通过工具调用实现搜索
    return this.generateText(params);
  }

  /**
   * 带网络搜索的流式生成
   */
  async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  /**
   * 工具调用功能
   */
  async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    return this.generateText(params);
  }

  /**
   * 流式工具调用
   */
  async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    return this.generateTextStream(params, callback);
  }

  /**
   * 处理流式数据（SSE格式）
   */
  protected async processStreamData(data: any, callback: StreamCallback): Promise<void> {
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

    // 处理推理内容（如果支持）
    if (data.choices?.[0]?.delta?.reasoning_content) {
      callback.onReasoning?.(data.choices[0].delta.reasoning_content);
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

