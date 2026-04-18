/**
 * AI服务管理类
 * 功能：统一管理AI提供商的创建、配置和使用
 * 描述：作为AI功能的统一入口，提供简化的API调用接口
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
  ModelCapability
} from '../../types/aiProvider';
import { aiProviderFactory } from './AIProviderFactory';

interface RefreshableAIProvider extends AIProvider {
  forceRefreshModels(): Promise<AIModel[]>;
}

const isRefreshableAIProvider = (provider: AIProvider): provider is RefreshableAIProvider =>
  typeof (provider as RefreshableAIProvider).forceRefreshModels === 'function';

export class AIService {
  private static instance: AIService;
  private currentProvider: AIProvider | null = null;
  private currentConfig: AIProviderConfig | null = null;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  // 设置当前提供商
  public async setProvider(providerId: string, config: AIProviderConfig): Promise<void> {
    try {
      this.currentProvider = aiProviderFactory.createProvider(providerId, config);
      this.currentConfig = config;
      await this.currentProvider.configure(config);
    } catch (error) {
      console.error('Failed to set AI provider:', error);
      throw error;
    }
  }

  // 获取当前提供商
  public getCurrentProvider(): AIProvider | null {
    return this.currentProvider;
  }

  // 获取当前配置
  public getCurrentConfig(): AIProviderConfig | null {
    return this.currentConfig;
  }

  // 检查是否有可用的提供商
  public hasProvider(): boolean {
    return this.currentProvider !== null;
  }

  // 获取当前提供商信息
  public getCurrentProviderInfo(): { id: string; name: string; icon: string; capabilities: ModelCapability[] } | null {
    if (!this.currentProvider) {
      return null;
    }

    return {
      id: this.currentProvider.id,
      name: this.currentProvider.name,
      icon: this.currentProvider.icon,
      capabilities: this.currentProvider.supportedCapabilities
    };
  }

  // 获取可用模型列表
  public async getAvailableModels(): Promise<any[]> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.getAvailableModels();
  }

  public async refreshAvailableModels(): Promise<AIModel[]> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    if (isRefreshableAIProvider(this.currentProvider)) {
      return await this.currentProvider.forceRefreshModels();
    }

    return await this.currentProvider.getAvailableModels();
  }

  // 获取模型信息
  public async getModelInfo(modelId: string): Promise<any> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.getModelInfo(modelId);
  }

  // 检测模型能力
  public async detectModelCapabilities(modelId: string): Promise<ModelCapability[]> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.detectModelCapabilities(modelId);
  }

  // 生成文本
  public async generateText(params: AIRequestParams): Promise<AIResponse> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateText(params);
  }

  // 流式生成文本
  public async generateTextStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateTextStream(params, callback);
  }

  // 网络搜索
  public async searchWeb(query: string, config?: WebSearchConfig): Promise<WebSearchResult[]> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.searchWeb(query, config);
  }

  // 带网络搜索的生成
  public async generateWithWebSearch(params: AIRequestParams): Promise<AIResponse> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateWithWebSearch(params);
  }

  // 带网络搜索的流式生成
  public async generateWithWebSearchStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateWithWebSearchStream(params, callback);
  }

  // 工具调用
  public async generateWithTools(params: AIRequestParams): Promise<AIResponse> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateWithTools(params);
  }

  // 流式工具调用
  public async generateWithToolsStream(params: AIRequestParams, callback: StreamCallback): Promise<void> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.generateWithToolsStream(params, callback);
  }

  // 测试连接
  public async testConnection(): Promise<boolean> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.testConnection();
  }

  // 获取连接状态
  public getConnectionStatus(): 'connected' | 'disconnected' | 'error' {
    if (!this.currentProvider) {
      return 'disconnected';
    }

    return this.currentProvider.getConnectionStatus();
  }

  // 验证配置
  public async validateConfig(config: AIProviderConfig): Promise<boolean> {
    if (!this.currentProvider) {
      throw new Error('No AI provider configured');
    }

    return await this.currentProvider.validateConfig(config);
  }

  // 清除当前提供商
  public clearProvider(): void {
    this.currentProvider = null;
    this.currentConfig = null;
  }

  // 获取支持的提供商列表
  public getSupportedProviders(): string[] {
    return aiProviderFactory.getSupportedProviders();
  }

  // 获取提供商信息
  public getProviderInfo(providerId: string): { id: string; name: string; icon: string; capabilities: ModelCapability[] } | null {
    return aiProviderFactory.getProviderInfo(providerId);
  }

  // 获取所有提供商信息
  public getAllProviderInfo(): Array<{ id: string; name: string; icon: string; capabilities: ModelCapability[] }> {
    return aiProviderFactory.getAllProviderInfo();
  }

  // 清除提供商缓存
  public clearProviderCache(providerId?: string): void {
    aiProviderFactory.clearProviderCache(providerId);
  }

  // 获取缓存统计
  public getCacheStats(): { totalProviders: number; providerCounts: Record<string, number> } {
    return aiProviderFactory.getCacheStats();
  }
}

// 导出单例实例
export const aiService = AIService.getInstance();
