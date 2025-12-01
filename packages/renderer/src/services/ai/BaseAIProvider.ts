/**
 * AI提供商基础抽象类
 * 功能：为所有AI提供商提供通用的基础实现
 * 描述：包含通用的配置管理、错误处理、网络请求、模型缓存等功能
 */

import { 
  AIProvider, 
  AIProviderConfig, 
  AIModel, 
  AIRequestParams, 
  AIResponse, 
  StreamCallback,
  WebSearchResult,
  WebSearchConfig,
  ModelCapability,
  ToolCall,
  AIProviderError,
  APIKeyError,
  RateLimitError
} from '../../types/aiProvider';

export abstract class BaseAIProvider implements AIProvider {
  protected config: AIProviderConfig;
  protected connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  protected cachedModels: AIModel[] | null = null; // 内存缓存的模型列表
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly icon: string,
    public readonly supportedCapabilities: ModelCapability[]
  ) {
    this.config = {
      id: '',
      name: '',
      apiKey: '',
      apiEndpoint: ''
    };
  }

  /**
   * 获取可用模型列表（带缓存）
   * 优先从内存缓存获取，然后从API获取
   */
  protected async getModelsWithCache(fetchFromAPI: () => Promise<AIModel[]>): Promise<AIModel[]> {
    // 1. 检查内存缓存
    if (this.cachedModels && this.cachedModels.length > 0) {
      console.log(`[${this.name}]  使用内存缓存模型 (${this.cachedModels.length})`);
      return this.cachedModels;
    }

    // 2. 从API获取
    console.log(`[${this.name}] 从API获取模型列表`);
    const models = await fetchFromAPI();
    
    // 保存到内存缓存
    this.cachedModels = models;
    
    return models;
  }

  /**
   * 强制刷新模型列表（从API重新获取并更新缓存）
   */
  protected async refreshModels(fetchFromAPI: () => Promise<AIModel[]>): Promise<AIModel[]> {
    console.log(`[${this.name}] 强制刷新模型列表`);
    const models = await fetchFromAPI();
    
    // 更新缓存
    this.cachedModels = models;
    
    return models;
  }

  // 配置管理
  async configure(config: AIProviderConfig): Promise<void> {
    // 调用 setConfig（如果子类有重写）
    this.setConfig(config);
    await this.validateConfig(config);
  }

  // 设置配置（子类可以重写以处理特殊配置）
  setConfig(config: AIProviderConfig): void {
    this.config = { ...config };
  }

  getConfig(): AIProviderConfig {
    return { ...this.config };
  }

  async validateConfig(config: AIProviderConfig): Promise<boolean> {
    if (!config.apiKey) {
      throw new APIKeyError(this.id);
    }
    if (!config.apiEndpoint) {
      throw new AIProviderError('API endpoint is required', this.id, 'MISSING_ENDPOINT');
    }
    return true;
  }

  // 模型管理 - 子类需要实现
  abstract getAvailableModels(): Promise<AIModel[]>;
  abstract getModelInfo(modelId: string): Promise<AIModel | null>;
  abstract detectModelCapabilities(modelId: string): Promise<ModelCapability[]>;

  // 推理功能 - 子类需要实现
  abstract generateText(params: AIRequestParams): Promise<AIResponse>;
  abstract generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 网络搜索功能 - 子类需要实现
  abstract searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]>;
  abstract generateWithWebSearch(params: AIRequestParams): Promise<AIResponse>;
  abstract generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 工具调用功能 - 子类需要实现
  abstract generateWithTools(params: AIRequestParams): Promise<AIResponse>;
  abstract generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  // 测试连接 - 子类需要实现
  abstract testConnection(): Promise<boolean>;

  getConnectionStatus(): 'connected' | 'disconnected' | 'error' {
    return this.connectionStatus;
  }

  // 通用网络请求方法
  protected async makeRequest(
    url: string, 
    options: RequestInit = {}
  ): Promise<Response> {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'WiseAI-Note-Studio/1.0'
    };

    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    // 如果 options 中有 signal，确保传递给 fetch
    if (options.signal) {
      requestOptions.signal = options.signal;
    }

    try {
      console.log(`[${this.name}] 🌐 Fetch 请求:`, {
        url,
        method: requestOptions.method,
        hasBody: !!requestOptions.body,
        hasSignal: !!requestOptions.signal,
        headers: Object.keys(requestOptions.headers || {})
      });
      
      const response = await fetch(url, requestOptions);
      
      console.log(`[${this.name}] 📡 响应状态:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        
        // 尝试解析JSON错误信息，提取message字段
        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          // 只提取message字段，确保是字符串
          if (errorJson.error?.message && typeof errorJson.error.message === 'string') {
            errorMessage = errorJson.error.message;
          } else if (errorJson.message && typeof errorJson.message === 'string') {
            errorMessage = errorJson.message;
          } else if (typeof errorJson.error === 'string') {
            errorMessage = errorJson.error;
          } else {
            errorMessage = errorText;
          }
        } catch {
          // 如果不是JSON，使用原始文本
          errorMessage = errorText;
        }
        
        // 根据状态码抛出不同类型的错误，但都使用API返回的原始message
        if (response.status === 401) {
          throw new APIKeyError(this.id, errorMessage);
        }
        
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(this.id, errorMessage, retryAfter ? parseInt(retryAfter) : undefined);
        }
        
        throw new AIProviderError(
          errorMessage,
          this.id,
          'HTTP_ERROR',
          response.status
        );
      }
      
      return response;
    } catch (error) {
      // 如果是 AbortError，直接抛出，不包装
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof AIProviderError) {
        throw error;
      }
      
      // 只使用原始错误消息，不添加前缀
      throw new AIProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        this.id,
        'NETWORK_ERROR'
      );
    }
  }

  // 通用错误处理
  // context参数用于传递已提取的错误消息，如果调用方已经提取了更详细的错误信息，则优先使用
  protected handleError(error: any, extractedMessage?: string): never {
    const errorMsg = extractedMessage || (error instanceof Error ? error.message : 'Unknown error occurred');
    console.error(`[${this.name}] Error:`, errorMsg, error);
    
    if (error instanceof AIProviderError) {
      throw error;
    }
    
    throw new AIProviderError(
      errorMsg,
      this.id,
      'UNKNOWN_ERROR'
    );
  }

  // 通用重试机制
  protected async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // 如果是认证错误或客户端错误，不重试
        if (error instanceof APIKeyError || 
            (error instanceof AIProviderError && error.statusCode && error.statusCode < 500)) {
          throw error;
        }
        
        // 如果是最后一次尝试，抛出错误
        if (attempt === maxRetries) {
          throw error;
        }
        
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
    
    throw lastError!;
  }

  // 通用流式响应处理
  protected async handleStreamResponse(
    response: Response,
    callback: StreamCallback,
    signal?: AbortSignal
  ): Promise<void> {
    if (!response.body) {
      throw new AIProviderError('No response body for streaming', this.id);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        // 检查是否已取消
        if (signal?.aborted) {
          console.log(`[${this.name}] 流式响应已被取消`);
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        
        if (done) break;
        
        // 再次检查是否已取消（在读取数据后）
        if (signal?.aborted) {
          console.log(`[${this.name}] 流式响应已被取消`);
          reader.cancel();
          break;
        }
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          
          // 在处理每行数据前检查是否已取消
          if (signal?.aborted) {
            console.log(`[${this.name}] 流式响应已被取消`);
            reader.cancel();
            break;
          }
          
          try {
            const data = JSON.parse(line);
            await this.processStreamData(data, callback);
          } catch (parseError) {
            console.warn(`[${this.name}] Failed to parse stream data:`, line);
          }
        }
      }
    } catch (error) {
      // 如果是取消操作，不抛出错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[${this.name}] 流式响应处理被取消`);
        return;
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  // 处理流式数据 - 子类需要实现
  protected abstract processStreamData(data: any, callback: StreamCallback): Promise<void>;

  // 通用工具调用处理
  protected async executeToolCall(toolCall: ToolCall): Promise<any> {
    // 这里可以实现通用的工具调用逻辑
    // 子类可以重写此方法来实现特定的工具调用
    throw new AIProviderError(
      `Tool calling not implemented for ${this.name}`,
      this.id,
      'NOT_IMPLEMENTED'
    );
  }

  // 通用网络搜索处理
  protected async performWebSearch(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    // 这里可以实现通用的网络搜索逻辑
    // 子类可以重写此方法来实现特定的搜索功能
    throw new AIProviderError(
      `Web search not implemented for ${this.name}`,
      this.id,
      'NOT_IMPLEMENTED'
    );
  }
}
