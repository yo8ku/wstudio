/**
 * AI provider base class.
 * Keeps config, shared error handling, request proxying, and stream helpers.
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

interface AIProxyRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface AIProxyFetchResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

interface AIProxyStreamRequest {
  requestId: string;
  url: string;
  options?: AIProxyRequestOptions;
}

interface AIProxyStreamChunkPayload {
  requestId: string;
  chunk: string;
}

interface AIProxyStreamErrorPayload {
  requestId: string;
  error: string;
}

interface AIProxyStreamStatePayload {
  requestId: string;
}

export abstract class BaseAIProvider implements AIProvider {
  protected config: AIProviderConfig;
  protected connectionStatus: 'connected' | 'disconnected' | 'error' = 'disconnected';
  protected cachedModels: AIModel[] | null = null;

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

  protected async getModelsWithCache(fetchFromAPI: () => Promise<AIModel[]>): Promise<AIModel[]> {
    if (this.cachedModels && this.cachedModels.length > 0) {
      console.log(`[${this.name}] using cached models (${this.cachedModels.length})`);
      return this.cachedModels;
    }

    console.log(`[${this.name}] fetching models from API`);
    const models = await fetchFromAPI();
    this.cachedModels = models;
    return models;
  }

  protected async refreshModels(fetchFromAPI: () => Promise<AIModel[]>): Promise<AIModel[]> {
    console.log(`[${this.name}] force refresh models`);
    const models = await fetchFromAPI();
    this.cachedModels = models;
    return models;
  }

  async configure(config: AIProviderConfig): Promise<void> {
    this.setConfig(config);
    await this.validateConfig(config);
  }

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
    return true;
  }

  abstract getAvailableModels(): Promise<AIModel[]>;
  abstract getModelInfo(modelId: string): Promise<AIModel | null>;
  abstract detectModelCapabilities(modelId: string): Promise<ModelCapability[]>;

  abstract generateText(params: AIRequestParams): Promise<AIResponse>;
  abstract generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  abstract searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]>;
  abstract generateWithWebSearch(params: AIRequestParams): Promise<AIResponse>;
  abstract generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  abstract generateWithTools(params: AIRequestParams): Promise<AIResponse>;
  abstract generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void>;

  abstract testConnection(): Promise<boolean>;

  getConnectionStatus(): 'connected' | 'disconnected' | 'error' {
    return this.connectionStatus;
  }

  protected async makeRequest(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Note-WStudio/1.0'
    };

    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };

    if (options.signal) {
      requestOptions.signal = options.signal;
    }

    try {
      console.log(`[${this.name}] request`, {
        url,
        method: requestOptions.method,
        hasBody: !!requestOptions.body,
        hasSignal: !!requestOptions.signal,
        headers: Object.keys(requestOptions.headers || {})
      });

      const response = await this.executeRequest(url, requestOptions);

      console.log(`[${this.name}] response`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();

        let errorMessage = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error?.message && typeof errorJson.error.message === 'string') {
            errorMessage = errorJson.error.message;
          } else if (errorJson.message && typeof errorJson.message === 'string') {
            errorMessage = errorJson.message;
          } else if (typeof errorJson.error === 'string') {
            errorMessage = errorJson.error;
          }
        } catch {
          errorMessage = errorText;
        }

        if (response.status === 401) {
          throw new APIKeyError(this.id, errorMessage);
        }

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(
            this.id,
            errorMessage,
            retryAfter ? parseInt(retryAfter, 10) : undefined
          );
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
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      if (error instanceof AIProviderError) {
        throw error;
      }

      throw new AIProviderError(
        error instanceof Error ? error.message : 'Unknown error',
        this.id,
        'NETWORK_ERROR'
      );
    }
  }

  protected async streamSSERequest(
    url: string,
    options: RequestInit,
    callback: StreamCallback,
    signal?: AbortSignal
  ): Promise<void> {
    let buffer = '';

    const processLine = async (line: string): Promise<void> => {
      const trimmedLine = line.trim();
      if (trimmedLine === '') {
        return;
      }

      let jsonStr = trimmedLine;
      if (trimmedLine.startsWith('data:')) {
        jsonStr = trimmedLine.slice(5).trim();
      }

      if (!jsonStr || jsonStr === '[DONE]') {
        return;
      }

      try {
        const data = JSON.parse(jsonStr);
        await this.processStreamData(data, callback);
      } catch {
        if (!trimmedLine.startsWith('data: [DONE]')) {
          console.warn(`[${this.name}] failed to parse stream data`, line);
        }
      }
    };

    const processChunk = async (chunk: string): Promise<void> => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        await processLine(line);
      }
    };

    await this.streamRequest(url, options, processChunk, signal);

    if (buffer.trim() !== '') {
      await processLine(buffer);
    }
  }

  protected async streamRequest(
    url: string,
    options: RequestInit,
    onChunk: (chunk: string) => Promise<void> | void,
    signal?: AbortSignal
  ): Promise<void> {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      await this.streamRequestWithFetch(url, options, onChunk, signal);
      return;
    }

    const requestId = `${this.id}-${crypto.randomUUID()}`;
    const proxyOptions = this.toProxyRequestOptions(options);
    const abortError = this.createAbortError();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let chunkQueue = Promise.resolve();
      const cleanups: Array<() => void> = [];

      const normalizePromiseError = (error: Error | string): Error => {
        return error instanceof Error ? error : new Error(error);
      };

      const cleanup = (): void => {
        while (cleanups.length > 0) {
          const handler = cleanups.pop();
          handler?.();
        }
      };

      const finishResolve = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      };

      const finishReject = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        reject(error);
      };

      const enqueueChunk = (chunk: string): void => {
        chunkQueue = chunkQueue
          .then(async () => {
            if (settled) {
              return;
            }
            await onChunk(chunk);
          })
          .catch((error: Error | string) => {
            finishReject(normalizePromiseError(error));
          });
      };

      cleanups.push(ipcRenderer.on('ai:stream-chunk', (_event, payload: AIProxyStreamChunkPayload) => {
        if (payload.requestId !== requestId) {
          return;
        }
        enqueueChunk(payload.chunk);
      }));

      cleanups.push(ipcRenderer.on('ai:stream-complete', (_event, payload: AIProxyStreamStatePayload) => {
        if (payload.requestId !== requestId) {
          return;
        }
        void chunkQueue
          .then(() => {
            finishResolve();
          })
          .catch((error: Error | string) => {
            finishReject(normalizePromiseError(error));
          });
      }));

      cleanups.push(ipcRenderer.on('ai:stream-aborted', (_event, payload: AIProxyStreamStatePayload) => {
        if (payload.requestId !== requestId) {
          return;
        }
        finishReject(abortError);
      }));

      cleanups.push(ipcRenderer.on('ai:stream-error', (_event, payload: AIProxyStreamErrorPayload) => {
        if (payload.requestId !== requestId) {
          return;
        }
        finishReject(new AIProviderError(payload.error, this.id, 'NETWORK_ERROR'));
      }));

      if (signal) {
        const abortHandler = (): void => {
          void ipcRenderer.invoke('ai:stream-abort', requestId).catch(() => undefined);
          finishReject(abortError);
        };

        signal.addEventListener('abort', abortHandler, { once: true });
        cleanups.push(() => {
          signal.removeEventListener('abort', abortHandler);
        });

        if (signal.aborted) {
          abortHandler();
          return;
        }
      }

      void ipcRenderer.invoke('ai:stream-start', {
        requestId,
        url,
        options: proxyOptions,
      } as AIProxyStreamRequest).catch((error: Error) => {
        finishReject(error);
      });
    });
  }

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

        if (
          error instanceof APIKeyError ||
          (error instanceof AIProviderError && error.statusCode && error.statusCode < 500)
        ) {
          throw error;
        }

        if (attempt === maxRetries) {
          throw error;
        }

        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }

    throw lastError!;
  }

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
        if (signal?.aborted) {
          console.log(`[${this.name}] stream aborted`);
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (signal?.aborted) {
          console.log(`[${this.name}] stream aborted`);
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '') {
            continue;
          }

          if (signal?.aborted) {
            console.log(`[${this.name}] stream aborted`);
            reader.cancel();
            break;
          }

          try {
            let jsonStr = trimmedLine;
            if (trimmedLine.startsWith('data:')) {
              jsonStr = trimmedLine.slice(5).trim();
            }

            if (!jsonStr || jsonStr === '[DONE]') {
              continue;
            }

            const data = JSON.parse(jsonStr);
            await this.processStreamData(data, callback);
          } catch {
            if (!trimmedLine.startsWith('data: [DONE]')) {
              console.warn(`[${this.name}] failed to parse stream data`, line);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[${this.name}] stream processing aborted`);
        return;
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  protected abstract processStreamData(data: any, callback: StreamCallback): Promise<void>;

  protected async executeToolCall(toolCall: ToolCall): Promise<any> {
    throw new AIProviderError(
      `Tool calling not implemented for ${this.name}`,
      this.id,
      'NOT_IMPLEMENTED'
    );
  }

  protected async performWebSearch(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    throw new AIProviderError(
      `Web search not implemented for ${this.name}`,
      this.id,
      'NOT_IMPLEMENTED'
    );
  }

  private async executeRequest(url: string, options: RequestInit): Promise<Response> {
    if (window.electronAPI?.ai?.fetch) {
      const proxyResponse = await window.electronAPI.ai.fetch(
        url,
        this.toProxyRequestOptions(options),
      );
      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: proxyResponse.headers,
      });
    }

    if (window.electron?.ipcRenderer) {
      const proxyResponse = await window.electron.ipcRenderer.invoke(
        'ai:fetch',
        url,
        this.toProxyRequestOptions(options),
      ) as AIProxyFetchResponse;

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: proxyResponse.headers,
      });
    }

    return fetch(url, options);
  }

  private async streamRequestWithFetch(
    url: string,
    options: RequestInit,
    onChunk: (chunk: string) => Promise<void> | void,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(url, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new AIProviderError(
        errorText || `HTTP ${response.status}: ${response.statusText}`,
        this.id,
        'HTTP_ERROR',
        response.status,
      );
    }

    if (!response.body) {
      throw new AIProviderError('No response body for streaming', this.id);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          throw this.createAbortError();
        }

        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          await onChunk(chunk);
        }
      }

      const tail = decoder.decode();
      if (tail) {
        await onChunk(tail);
      }
    } finally {
      reader.releaseLock();
    }
  }

  private toProxyRequestOptions(options: RequestInit): AIProxyRequestOptions {
    const proxyOptions: AIProxyRequestOptions = {
      method: options.method,
      headers: this.normalizeHeaders(options.headers),
    };

    if (typeof options.body === 'string') {
      proxyOptions.body = options.body;
    } else if (options.body instanceof URLSearchParams) {
      proxyOptions.body = options.body.toString();
    } else if (options.body === undefined || options.body === null) {
      proxyOptions.body = undefined;
    } else {
      throw new AIProviderError(
        'Unsupported request body type for AI proxy',
        this.id,
        'UNSUPPORTED_REQUEST_BODY'
      );
    }

    return proxyOptions;
  }

  private normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
    const normalized: Record<string, string> = {};
    if (!headers) {
      return normalized;
    }

    if (headers instanceof Headers) {
      headers.forEach((value: string, key: string) => {
        normalized[key] = value;
      });
      return normalized;
    }

    if (Array.isArray(headers)) {
      for (const [key, value] of headers) {
        normalized[key] = value;
      }
      return normalized;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalized[key] = value;
      }
    }

    return normalized;
  }

  private createAbortError(): Error {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
  }
}
