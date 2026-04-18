import Store from 'electron-store';
import http from 'http';
import https from 'https';
import {
  EmbeddingModelConfig,
  EmbeddingProviderConfig,
  getAllEmbeddingProviders,
  getEmbeddingModelById,
  getEnabledEmbeddingModels,
} from './EmbeddingModelConfig';

interface EmbeddingRequest {
  input: string | string[];
  model: string;
  encoding_format?: 'float' | 'base64';
}

interface EmbeddingData {
  object: 'embedding';
  index: number;
  embedding: number[];
}

interface EmbeddingResponse {
  object: 'list';
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingResult {
  success: boolean;
  vectors?: number[][];
  error?: string;
  tokensUsed?: number;
  model?: string;
}

export interface CustomEmbeddingConfig {
  apiEndpoint: string;
  modelName: string;
  dimensions: number;
  maxTokens: number;
}

interface OllamaModelDetails {
  family?: string;
  families?: string[];
  format?: string;
  parameter_size?: string;
  quantization_level?: string;
}

interface OllamaModelTag {
  name: string;
  model?: string;
  details?: OllamaModelDetails;
}

interface OllamaTagsResponse {
  models?: OllamaModelTag[];
}

interface EmbeddingStoreSchema {
  currentModelId: string;
  currentProviderId?: string;
  apiKeys: Record<string, string>;
  providerEndpoints?: Record<string, string>;
  modelDimensions?: Record<string, number>;
  customConfig?: CustomEmbeddingConfig;
}

interface ServiceConfig {
  modelId: string;
  currentProviderId?: string;
  apiKeys: Record<string, string>;
  providerEndpoints: Record<string, string>;
  modelDimensions: Record<string, number>;
  customConfig?: CustomEmbeddingConfig;
}

interface HttpRequestOptions {
  method?: 'GET' | 'POST';
  body?: string;
  apiKey?: string;
}

class CloudEmbeddingServiceClass {
  private static readonly DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

  private config: ServiceConfig = {
    modelId: 'bge-m3',
    currentProviderId: 'ollama',
    apiKeys: {},
    providerEndpoints: {},
    modelDimensions: {},
  };

  private store: Store<EmbeddingStoreSchema>;

  constructor() {
    this.store = new Store<EmbeddingStoreSchema>({
      name: 'embedding-config',
      defaults: {
        currentModelId: 'bge-m3',
        currentProviderId: 'ollama',
        apiKeys: {},
        providerEndpoints: {},
        modelDimensions: {},
      },
    });

    this.loadConfig();
  }

  private loadConfig(): void {
    const storedModelId = this.store.get('currentModelId', 'bge-m3');
    this.config.modelId = this.normalizeStoredModelId(storedModelId);
    const resolvedProviderId = this.resolveStoredProviderId(this.config.modelId);
    const storedProviderId = resolvedProviderId
      ? this.store.get('currentProviderId', resolvedProviderId)
      : this.store.get('currentProviderId');
    this.config.currentProviderId = storedProviderId || resolvedProviderId;
    this.config.apiKeys = this.store.get('apiKeys', {});
    this.config.providerEndpoints = this.store.get('providerEndpoints', {});
    this.config.modelDimensions = this.store.get('modelDimensions', {});
    this.config.customConfig = this.store.get('customConfig');

    if (storedModelId !== this.config.modelId) {
      this.store.set('currentModelId', this.config.modelId);
    }
    if (this.config.currentProviderId) {
      this.store.set('currentProviderId', this.config.currentProviderId);
    }
  }

  private normalizeStoredModelId(modelId: string): string {
    return modelId === 'BAAI/bge-m3' ? 'bge-m3' : modelId;
  }

  private resolveStoredProviderId(modelId: string): string | undefined {
    if (modelId === 'custom') {
      return 'custom';
    }
    const model = getEmbeddingModelById(modelId);
    return model?.providerId;
  }

  private persistCurrentModel(): void {
    this.store.set('currentModelId', this.config.modelId);
    if (this.config.currentProviderId) {
      this.store.set('currentProviderId', this.config.currentProviderId);
    }
  }

  private getStoredModelDimensions(modelId: string): number {
    return this.config.modelDimensions[modelId] ?? 0;
  }

  private setStoredModelDimensions(modelId: string, dimensions: number): void {
    if (dimensions <= 0 || this.config.modelDimensions[modelId] === dimensions) {
      return;
    }
    this.config.modelDimensions[modelId] = dimensions;
    this.store.set('modelDimensions', this.config.modelDimensions);
  }

  private normalizeOllamaBaseUrl(endpoint: string): string {
    const trimmed = endpoint.trim();
    if (!trimmed) {
      return CloudEmbeddingServiceClass.DEFAULT_OLLAMA_BASE_URL;
    }

    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

    try {
      const url = new URL(withProtocol);
      const normalizedPath = url.pathname
        .replace(/\/(api\/embed|api\/tags|v1\/chat\/completions|v1\/models)\/?$/i, '')
        .replace(/\/+$/, '');
      url.pathname = normalizedPath || '/';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return CloudEmbeddingServiceClass.DEFAULT_OLLAMA_BASE_URL;
    }
  }

  private getOllamaBaseUrl(): string {
    return this.normalizeOllamaBaseUrl(
      this.config.providerEndpoints.ollama || CloudEmbeddingServiceClass.DEFAULT_OLLAMA_BASE_URL,
    );
  }

  private getOllamaEmbedEndpoint(): string {
    return `${this.getOllamaBaseUrl()}/api/embed`;
  }

  private getOllamaTagsEndpoint(): string {
    return `${this.getOllamaBaseUrl()}/api/tags`;
  }

  private buildOllamaModelConfig(
    modelName: string,
    displayName?: string,
    description?: string,
  ): EmbeddingModelConfig {
    const staticModel = getEmbeddingModelById(modelName);
    const ollamaStaticModel = staticModel?.providerId === 'ollama' ? staticModel : undefined;
    const storedDimensions = this.getStoredModelDimensions(modelName);

    return {
      id: modelName,
      name: modelName,
      displayName: displayName || ollamaStaticModel?.displayName || modelName,
      providerId: 'ollama',
      apiEndpoint: this.getOllamaEmbedEndpoint(),
      dimensions: storedDimensions > 0 ? storedDimensions : (ollamaStaticModel?.dimensions ?? 0),
      maxTokens: ollamaStaticModel?.maxTokens ?? 8192,
      supportsBatch: false,
      maxBatchSize: 1,
      pricePerMillion: 0,
      enabled: true,
      description: description || ollamaStaticModel?.description || '已安装在 Ollama 中的本地模型',
    };
  }

  private async fetchOllamaModels(): Promise<EmbeddingModelConfig[]> {
    const result = await this.httpRequest(this.getOllamaTagsEndpoint(), { method: 'GET' });
    if (!result.success || !result.data) {
      throw new Error(result.error || '无法读取 Ollama 模型列表');
    }

    const response = JSON.parse(result.data) as OllamaTagsResponse;
    const tags = response.models || [];
    const modelNames = new Set<string>();
    const models: EmbeddingModelConfig[] = [];

    for (const tag of tags) {
      const modelName = (tag.name || tag.model || '').trim();
      if (!modelName || modelNames.has(modelName)) {
        continue;
      }

      modelNames.add(modelName);
      const family = tag.details?.families?.[0] || tag.details?.family;
      const description = family
        ? `已安装在 Ollama 中，本地模型族：${family}`
        : '已安装在 Ollama 中的本地模型';
      models.push(this.buildOllamaModelConfig(modelName, modelName, description));
    }

    return models;
  }

  private ensureCurrentOllamaModelIncluded(models: EmbeddingModelConfig[]): EmbeddingModelConfig[] {
    const currentModel = this.getCurrentModel();
    if (!currentModel || currentModel.providerId !== 'ollama') {
      return models;
    }

    if (models.some(model => model.id === currentModel.id && model.providerId === 'ollama')) {
      return models;
    }

    return [...models, currentModel];
  }

  private async getModelsForProvider(providerId: string): Promise<EmbeddingModelConfig[]> {
    const allModels = await this.getAvailableModels();
    return allModels.filter(model => model.providerId === providerId);
  }

  setCustomConfig(config: CustomEmbeddingConfig): void {
    this.config.customConfig = config;
    this.store.set('customConfig', config);
  }

  getCustomConfig(): CustomEmbeddingConfig | undefined {
    return this.config.customConfig;
  }

  setApiKey(providerId: string, apiKey: string): void {
    this.config.apiKeys[providerId] = apiKey;
    this.store.set('apiKeys', this.config.apiKeys);
  }

  getApiKey(providerId: string): string | undefined {
    return this.config.apiKeys[providerId];
  }

  getProviderEndpoint(providerId: string): string {
    if (providerId === 'ollama') {
      return this.getOllamaBaseUrl();
    }

    const provider = getAllEmbeddingProviders().find(item => item.id === providerId);
    return provider?.defaultEndpoint || '';
  }

  setProviderEndpoint(providerId: string, endpoint: string): void {
    if (providerId === 'ollama') {
      this.config.providerEndpoints.ollama = this.normalizeOllamaBaseUrl(endpoint);
      this.store.set('providerEndpoints', this.config.providerEndpoints);
      return;
    }

    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
      delete this.config.providerEndpoints[providerId];
    } else {
      this.config.providerEndpoints[providerId] = trimmedEndpoint;
    }
    this.store.set('providerEndpoints', this.config.providerEndpoints);
  }

  setModel(modelId: string, providerId?: string): void {
    if (modelId === 'custom') {
      this.config.modelId = 'custom';
      this.config.currentProviderId = 'custom';
      this.persistCurrentModel();
      return;
    }

    const model = getEmbeddingModelById(modelId);
    if (model) {
      this.config.modelId = modelId;
      this.config.currentProviderId = model.providerId;
      this.persistCurrentModel();
      return;
    }

    if (providerId === 'ollama') {
      this.config.modelId = modelId;
      this.config.currentProviderId = 'ollama';
      this.persistCurrentModel();
      return;
    }

    throw new Error(`未找到模型配置: ${modelId}`);
  }

  getCurrentModel(): EmbeddingModelConfig | undefined {
    if (this.config.modelId === 'custom' && this.config.customConfig) {
      return {
        id: 'custom',
        name: this.config.customConfig.modelName,
        displayName: `自定义 ${this.config.customConfig.modelName}`,
        providerId: 'custom',
        apiEndpoint: this.config.customConfig.apiEndpoint,
        dimensions: this.config.customConfig.dimensions,
        maxTokens: this.config.customConfig.maxTokens,
        supportsBatch: true,
        maxBatchSize: 50,
        enabled: true,
      };
    }

    const staticModel = getEmbeddingModelById(this.config.modelId);
    if (staticModel?.providerId === 'ollama') {
      return {
        ...staticModel,
        apiEndpoint: this.getOllamaEmbedEndpoint(),
        dimensions: this.getStoredModelDimensions(staticModel.id) || staticModel.dimensions,
      };
    }
    if (staticModel) {
      return staticModel;
    }
    if (this.config.currentProviderId === 'ollama') {
      return this.buildOllamaModelConfig(this.config.modelId);
    }

    return undefined;
  }

  async getAvailableModels(): Promise<EmbeddingModelConfig[]> {
    const staticModels = getEnabledEmbeddingModels().filter(model => model.providerId !== 'ollama');
    const fallbackOllamaModels = getEnabledEmbeddingModels()
      .filter(model => model.providerId === 'ollama')
      .map(model => ({
        ...model,
        apiEndpoint: this.getOllamaEmbedEndpoint(),
        dimensions: this.getStoredModelDimensions(model.id) || model.dimensions,
      }));

    try {
      const ollamaModels = await this.fetchOllamaModels();
      const resolvedOllamaModels = ollamaModels.length > 0 ? ollamaModels : fallbackOllamaModels;
      return this.ensureCurrentOllamaModelIncluded([...staticModels, ...resolvedOllamaModels]);
    } catch (error) {
      console.warn('[CloudEmbedding] 读取 Ollama 动态模型失败，回退到内置模型列表:', error);
      return this.ensureCurrentOllamaModelIncluded([...staticModels, ...fallbackOllamaModels]);
    }
  }

  getProviders(): EmbeddingProviderConfig[] {
    return getAllEmbeddingProviders().map(provider => (
      provider.id === 'ollama'
        ? {
          ...provider,
          defaultEndpoint: this.getOllamaEmbedEndpoint(),
          models: provider.models.map(model => ({
            ...model,
            apiEndpoint: this.getOllamaEmbedEndpoint(),
          })),
        }
        : provider
    ));
  }

  hasValidApiKey(): boolean {
    const model = this.getCurrentModel();
    if (!model) {
      return false;
    }
    if (model.providerId === 'ollama') {
      return true;
    }

    const apiKey = this.config.apiKeys[model.providerId];
    return !!apiKey && apiKey.trim().length > 0;
  }

  async generateEmbedding(text: string): Promise<EmbeddingResult> {
    const result = await this.generateBatchEmbeddings([text]);
    if (result.success && result.vectors && result.vectors.length > 0) {
      return {
        success: true,
        vectors: [result.vectors[0]],
        tokensUsed: result.tokensUsed,
        model: result.model,
      };
    }
    return result;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<EmbeddingResult> {
    const model = this.getCurrentModel();
    if (!model) {
      return {
        success: false,
        error: `未找到模型配置: ${this.config.modelId}`,
      };
    }

    const apiKey = this.config.apiKeys[model.providerId];
    if (!apiKey && model.providerId !== 'ollama') {
      return {
        success: false,
        error: `未配置 ${model.providerId} 的 API Key`,
      };
    }

    const allVectors: number[][] = [];
    let totalTokens = 0;

    for (let index = 0; index < texts.length; index += model.maxBatchSize) {
      const batch = texts.slice(index, index + model.maxBatchSize);
      const result = await this.callEmbeddingAPI(model, apiKey || '', batch);

      if (!result.success) {
        return result;
      }
      if (result.vectors) {
        allVectors.push(...result.vectors);
      }
      if (result.tokensUsed) {
        totalTokens += result.tokensUsed;
      }
    }

    return {
      success: true,
      vectors: allVectors,
      tokensUsed: totalTokens,
      model: model.id,
    };
  }

  private truncateText(text: string, maxChars: number = 400): string {
    if (text.length <= maxChars) {
      return text;
    }
    return text.substring(0, maxChars);
  }

  private async callEmbeddingAPI(
    model: EmbeddingModelConfig,
    apiKey: string,
    texts: string[],
  ): Promise<EmbeddingResult> {
    const truncatedTexts = texts.map(text => this.truncateText(text));

    if (model.providerId === 'ollama') {
      return this.callOllamaEmbeddingAPI(model, truncatedTexts);
    }

    const requestBody: EmbeddingRequest = {
      input: truncatedTexts.length === 1 ? truncatedTexts[0] : truncatedTexts,
      model: model.name,
      encoding_format: 'float',
    };

    try {
      const response = await fetch(model.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `API 错误 (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as EmbeddingResponse;
      const sortedData = data.data.sort((left, right) => left.index - right.index);
      const vectors = sortedData.map(item => item.embedding);

      return {
        success: true,
        vectors,
        tokensUsed: data.usage?.total_tokens,
        model: data.model,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private async callOllamaEmbeddingAPI(
    model: EmbeddingModelConfig,
    texts: string[],
  ): Promise<EmbeddingResult> {
    try {
      const vectors: number[][] = [];
      const apiKey = this.config.apiKeys[model.providerId];

      for (const text of texts) {
        const requestBody = JSON.stringify({
          model: model.name,
          input: text,
        });

        const result = await this.httpRequest(model.apiEndpoint, {
          body: requestBody,
          apiKey,
        });

        if (!result.success || !result.data) {
          return {
            success: false,
            error: result.error || 'Ollama 请求失败',
          };
        }

        const data = JSON.parse(result.data) as {
          embeddings?: number[][];
          embedding?: number[];
        };

        if (data.embeddings && data.embeddings.length > 0) {
          vectors.push(data.embeddings[0]);
        } else if (data.embedding && data.embedding.length > 0) {
          vectors.push(data.embedding);
        } else {
          return {
            success: false,
            error: 'Ollama 返回的数据格式不正确',
          };
        }
      }

      this.setStoredModelDimensions(model.id, vectors[0]?.length || 0);

      return {
        success: true,
        vectors,
        model: model.name,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Ollama 连接失败: ${errorMessage}`,
      };
    }
  }

  private httpRequest(
    url: string,
    options: HttpRequestOptions,
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      let hostname = parsedUrl.hostname;
      if (hostname === 'localhost') {
        hostname = '127.0.0.1';
      }

      const headers: Record<string, string | number> = {};
      if (options.body) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(options.body);
      }
      if (options.apiKey && options.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${options.apiKey}`;
      }

      const requestOptions = {
        hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: options.method || 'POST',
        headers,
      };

      const request = httpModule.request(requestOptions, response => {
        let data = '';
        response.on('data', chunk => {
          data += chunk;
        });
        response.on('end', () => {
          if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
            resolve({ success: true, data });
            return;
          }

          resolve({
            success: false,
            error: `Ollama API 错误 (${response.statusCode}): ${data}`,
          });
        });
      });

      request.on('error', error => {
        resolve({
          success: false,
          error: `Ollama 连接失败: ${error.message}`,
        });
      });

      if (options.body) {
        request.write(options.body);
      }
      request.end();
    });
  }

  async testConnection(
    providerId: string,
    apiKey: string,
    modelId?: string,
  ): Promise<{ success: boolean; message: string; dimensions?: number }> {
    const models = await this.getModelsForProvider(providerId);
    const model = modelId
      ? models.find(item => item.id === modelId)
        || (providerId === 'ollama' ? this.buildOllamaModelConfig(modelId) : undefined)
      : models[0];

    if (!model) {
      return { success: false, message: `未找到 ${providerId} 的模型配置` };
    }

    const testText = '测试连接';

    if (providerId === 'ollama') {
      try {
        const requestBody = JSON.stringify({
          model: model.name,
          input: testText,
        });

        const result = await this.httpRequest(model.apiEndpoint, {
          body: requestBody,
          apiKey,
        });

        if (!result.success || !result.data) {
          return {
            success: false,
            message: result.error || 'Ollama 连接失败',
          };
        }

        const data = JSON.parse(result.data) as {
          embeddings?: number[][];
          embedding?: number[];
        };
        const dimensions = data.embeddings?.[0]?.length || data.embedding?.length || 0;
        this.setStoredModelDimensions(model.id, dimensions);

        return {
          success: true,
          message: `连接成功，模型: ${model.name}，维度: ${dimensions}`,
          dimensions,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          message: `Ollama 连接失败: ${errorMessage}（请确保 Ollama 正在运行）`,
        };
      }
    }

    const requestBody: EmbeddingRequest = {
      input: testText,
      model: model.name,
      encoding_format: 'float',
    };

    try {
      const response = await fetch(model.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `API 错误 (${response.status}): ${errorText}`,
        };
      }

      const data = await response.json() as EmbeddingResponse;
      const dimensions = data.data[0]?.embedding?.length || 0;

      return {
        success: true,
        message: `连接成功，模型: ${data.model}，维度: ${dimensions}`,
        dimensions,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `连接失败: ${errorMessage}`,
      };
    }
  }

  async validateCurrentConfig(): Promise<{ success: boolean; message: string }> {
    const model = this.getCurrentModel();
    if (!model) {
      return {
        success: false,
        message: '未配置 Embedding 模型，请先选择服务商和模型',
      };
    }

    if (model.providerId !== 'ollama') {
      const apiKey = this.getApiKey(model.providerId);
      if (!apiKey) {
        return {
          success: false,
          message: `未配置 ${model.providerId} 的 API Key`,
        };
      }
    }

    try {
      const result = await this.generateEmbedding('验证配置');
      if (!result.success) {
        return {
          success: false,
          message: result.error || 'API 调用失败',
        };
      }

      return {
        success: true,
        message: `配置有效，模型: ${model.displayName}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `API 验证失败: ${errorMessage}`,
      };
    }
  }
}

export const cloudEmbeddingService = new CloudEmbeddingServiceClass();
