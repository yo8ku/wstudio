/**
 * AI提供商工厂类
 * 功能：统一管理所有AI提供商，提供创建和配置功能
 * 描述：基于7种协议类型创建对应的提供商实例
 */

import { AIProvider, AIProviderConfig, AIProviderFactory, ModelCapability } from '../../types/aiProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { OpenAIResponseProvider } from './providers/OpenAIResponseProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { CustomProvider } from './providers/CustomProvider';

// 支持的提供商信息（7种协议）
const PROVIDER_INFO = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'OpenAI',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
      ModelCapability.EMBEDDING,
      ModelCapability.MODERATION
    ]
  },
  'openai-response': {
    id: 'openai-response',
    name: 'OpenAI Response',
    icon: 'OpenAI',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
    ]
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'Gemini',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
      ModelCapability.WEB_SEARCH
    ]
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'Claude',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    icon: 'Azure',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.VISION,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING,
      ModelCapability.EMBEDDING
    ]
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  custom: {
    id: 'custom',
    name: '自定义',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.STREAMING
    ]
  }
};

export class AIProviderFactoryImpl implements AIProviderFactory {
  private static instance: AIProviderFactoryImpl;
  private providers: Map<string, AIProvider> = new Map();

  private constructor() {}

  public static getInstance(): AIProviderFactoryImpl {
    if (!AIProviderFactoryImpl.instance) {
      AIProviderFactoryImpl.instance = new AIProviderFactoryImpl();
    }
    return AIProviderFactoryImpl.instance;
  }

  public createProvider(providerId: string, config: AIProviderConfig): AIProvider {
    const cacheKey = `${providerId}-${config.apiKey}`;

    if (this.providers.has(cacheKey)) {
      const cachedProvider = this.providers.get(cacheKey)!;
      cachedProvider.configure(config).catch(error => {
        console.error(`Failed to reconfigure cached provider ${providerId}:`, error);
      });
      return cachedProvider;
    }

    let provider: AIProvider;

    switch (providerId) {
      case 'openai':
        provider = new OpenAIProvider();
        break;
      case 'openai-response':
        provider = new OpenAIResponseProvider();
        break;
      case 'gemini':
        provider = new GeminiProvider();
        break;
      case 'anthropic':
        provider = new AnthropicProvider();
        break;
      case 'azure':
      case 'ollama':
      case 'custom':
      default: {
        const providerInfo = PROVIDER_INFO[providerId as keyof typeof PROVIDER_INFO];
        provider = new CustomProvider(
          providerId,
          providerInfo?.name || '自定义',
          providerInfo?.icon || ''
        );
        break;
      }
    }

    provider.configure(config).catch(error => {
      console.error(`Failed to configure provider ${providerId}:`, error);
    });

    this.providers.set(cacheKey, provider);
    return provider;
  }

  public getSupportedProviders(): string[] {
    return Object.keys(PROVIDER_INFO);
  }

  public getProviderInfo(providerId: string): { id: string; name: string; icon: string; capabilities: ModelCapability[] } | null {
    return PROVIDER_INFO[providerId as keyof typeof PROVIDER_INFO] || null;
  }

  public getAllProviderInfo(): Array<{ id: string; name: string; icon: string; capabilities: ModelCapability[] }> {
    return Object.values(PROVIDER_INFO);
  }

  public clearProviderCache(providerId?: string): void {
    if (providerId) {
      const keysToDelete = Array.from(this.providers.keys()).filter(key => key.startsWith(providerId));
      keysToDelete.forEach(key => this.providers.delete(key));
    } else {
      this.providers.clear();
    }
  }

  public getProvider(providerId: string, config: AIProviderConfig): AIProvider | null {
    const cacheKey = `${providerId}-${config.apiKey}`;
    return this.providers.get(cacheKey) || null;
  }

  public hasProvider(providerId: string, config: AIProviderConfig): boolean {
    const cacheKey = `${providerId}-${config.apiKey}`;
    return this.providers.has(cacheKey);
  }

  public getCacheStats(): { totalProviders: number; providerCounts: Record<string, number> } {
    const providerCounts: Record<string, number> = {};
    for (const key of this.providers.keys()) {
      const id = key.split('-')[0];
      providerCounts[id] = (providerCounts[id] || 0) + 1;
    }
    return { totalProviders: this.providers.size, providerCounts };
  }
}

export const aiProviderFactory = AIProviderFactoryImpl.getInstance();
