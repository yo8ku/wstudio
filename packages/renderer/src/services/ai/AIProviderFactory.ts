/**
 * AI提供商工厂类
 * 功能：统一管理所有AI提供商，提供创建和配置功能
 * 描述：作为AI提供商的统一入口，支持动态创建和配置不同的AI提供商
 */

import { AIProvider, AIProviderConfig, AIProviderFactory, ModelCapability } from '../../types/aiProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { DeepSeekProvider } from './providers/DeepSeekProvider';
import { GroqProvider } from './providers/GroqProvider';
// import { ZenmuxProvider } from './providers/ZenmuxProvider'; // 暂时禁用
import { CustomProvider } from './providers/CustomProvider';
import { ModelScopeProvider } from './providers/ModelScopeProvider';

// 支持的提供商信息
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
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'DeepSeek',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: 'Grok',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    icon: 'xAI',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    icon: 'Kimi',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  glm: {
    id: 'glm',
    name: 'GLM (智谱AI)',
    icon: 'GLM',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.TOOLS,
      ModelCapability.FUNCTION_CALLING,
      ModelCapability.STREAMING
    ]
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'OpenRouter',
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
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
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
      ModelCapability.EMBEDDING,
      ModelCapability.MODERATION
    ]
  },
  modelscope: {
    id: 'modelscope',
    name: '魔塔社区',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.REASONING,
      ModelCapability.STREAMING
    ]
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  ph8: {
    id: 'ph8',
    name: 'PH8',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  ai302: {
    id: 'ai302',
    name: '302.AI',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  lanyun: {
    id: 'lanyun',
    name: '蓝耘',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'Lm Studio',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  volcengine: {
    id: 'volcengine',
    name: '火山方舟',
    icon: '',
    capabilities: [
      ModelCapability.TEXT_GENERATION,
      ModelCapability.CODE_GENERATION,
      ModelCapability.STREAMING
    ]
  },
  zenmux: {
    id: 'zenmux',
    name: 'Zenmux',
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

  // 创建提供商实例
  public createProvider(providerId: string, config: AIProviderConfig): AIProvider {
    // 对于魔塔社区等需要 modelId 的提供商，缓存键需要包含 modelId
    const cacheKey = config.modelId 
      ? `${providerId}-${config.apiKey}-${config.modelId}`
      : `${providerId}-${config.apiKey}`;
    
    console.log(`[AIProviderFactory] createProvider 被调用:`, {
      providerId,
      'config.modelId': config.modelId,
      cacheKey,
      'hasCached': this.providers.has(cacheKey)
    });
    
    // 检查缓存
    if (this.providers.has(cacheKey)) {
      console.log(`[AIProviderFactory] ✓ 使用缓存的提供商实例`);
      const cachedProvider = this.providers.get(cacheKey)!;
      // 即使有缓存，也要更新配置（以防配置有变化）
      cachedProvider.configure(config).catch(error => {
        console.error(`Failed to reconfigure cached provider ${providerId}:`, error);
      });
      return cachedProvider;
    }

    console.log(`[AIProviderFactory] 创建新的提供商实例`);

    let provider: AIProvider;

    switch (providerId) {
      case 'openai':
        provider = new OpenAIProvider();
        break;
      case 'anthropic':
        provider = new AnthropicProvider();
        break;
      case 'gemini':
        provider = new GeminiProvider();
        break;
      case 'deepseek':
        provider = new DeepSeekProvider();
        break;
      case 'groq':
        provider = new GroqProvider();
        break;
      case 'zenmux':
        // provider = new ZenmuxProvider(); // 暂时禁用
        throw new Error('Zenmux provider is temporarily disabled');
        break;
      case 'xai':
      case 'kimi':
      case 'modelscope':
        // 魔塔社区需要特殊处理（需要模型ID）
        provider = new ModelScopeProvider();
        break;

      case 'glm':
      case 'openrouter':
      case 'ollama':
      case 'azure':
      case 'siliconflow':
      case 'ph8':
      case 'ai302':
      case 'lanyun':
      case 'lmstudio':
      case 'volcengine':
      case 'custom':
        // 使用通用的 CustomProvider，支持所有兼容 OpenAI API 格式的服务
        const providerInfo = PROVIDER_INFO[providerId as keyof typeof PROVIDER_INFO];
        provider = new CustomProvider(
          providerId,
          providerInfo?.name || '自定义',
          providerInfo?.icon || ''
        );
        break;
      default:
        throw new Error(`Unsupported provider: ${providerId}`);
    }

    // 配置提供商
    provider.configure(config).catch(error => {
      console.error(`Failed to configure provider ${providerId}:`, error);
    });

    // 缓存提供商实例
    this.providers.set(cacheKey, provider);

    return provider;
  }

  // 获取支持的提供商列表
  public getSupportedProviders(): string[] {
    return Object.keys(PROVIDER_INFO);
  }

  // 获取提供商信息
  public getProviderInfo(providerId: string): { id: string; name: string; icon: string; capabilities: ModelCapability[] } | null {
    return PROVIDER_INFO[providerId as keyof typeof PROVIDER_INFO] || null;
  }

  // 获取所有提供商信息
  public getAllProviderInfo(): Array<{ id: string; name: string; icon: string; capabilities: ModelCapability[] }> {
    return Object.values(PROVIDER_INFO);
  }

  // 清除提供商缓存
  public clearProviderCache(providerId?: string): void {
    if (providerId) {
      // 清除特定提供商的缓存
      const keysToDelete = Array.from(this.providers.keys()).filter(key => key.startsWith(providerId));
      keysToDelete.forEach(key => this.providers.delete(key));
    } else {
      // 清除所有缓存
      this.providers.clear();
    }
  }

  // 获取提供商实例
  public getProvider(providerId: string, config: AIProviderConfig): AIProvider | null {
    const cacheKey = config.modelId 
      ? `${providerId}-${config.apiKey}-${config.modelId}`
      : `${providerId}-${config.apiKey}`;
    return this.providers.get(cacheKey) || null;
  }

  // 检查提供商是否已缓存
  public hasProvider(providerId: string, config: AIProviderConfig): boolean {
    const cacheKey = config.modelId 
      ? `${providerId}-${config.apiKey}-${config.modelId}`
      : `${providerId}-${config.apiKey}`;
    return this.providers.has(cacheKey);
  }

  // 获取缓存统计
  public getCacheStats(): { totalProviders: number; providerCounts: Record<string, number> } {
    const providerCounts: Record<string, number> = {};
    
    for (const key of this.providers.keys()) {
      const providerId = key.split('-')[0];
      providerCounts[providerId] = (providerCounts[providerId] || 0) + 1;
    }

    return {
      totalProviders: this.providers.size,
      providerCounts
    };
  }
}

// 导出单例实例
export const aiProviderFactory = AIProviderFactoryImpl.getInstance();
