/**
 * AI服务统一导出
 * 功能：导出所有AI相关的服务和类型
 * 描述：作为AI模块的统一入口，提供所有AI功能的访问
 */

import * as jsonc from 'jsonc-parser';

// 导出类型定义
export * from '../../types/aiProvider';
// 导入 AIProviderConfig 用于内部使用
import type { AIProviderConfig } from '../../types/aiProvider';

// 模型配置类型
export interface ConfigModel {
  id: string;
  name: string;
  capabilities?: {
    thinking?: boolean;
    tool_calls?: string[];
  };
  limits?: {
    context_tokens?: string;
    stream?: boolean;
  };
}

// 从配置文件加载的服务商类型
export interface ConfigProvider {
  id: string;
  name: string;
  description?: string;
  protocol: string;
  config: {
    base_url: string;
    chat_endpoint?: string;
    auth_header?: string;
    auth_prefix?: string;
  };
  models: ConfigModel[];
}

// 导出基础类
export { BaseAIProvider } from './BaseAIProvider';

// 导出提供商实现
export { OpenAIProvider } from './providers/OpenAIProvider';
export { AnthropicProvider } from './providers/AnthropicProvider';
export { GeminiProvider } from './providers/GeminiProvider';
export { DeepSeekProvider } from './providers/DeepSeekProvider';
export { GroqProvider } from './providers/GroqProvider';
export { CustomProvider } from './providers/CustomProvider';

// 导出工厂和服务
export { AIProviderFactoryImpl, aiProviderFactory } from './AIProviderFactory';
export { AIService, aiService } from './AIService';

// 导出所有提供商信息
export const AI_PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    icon: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'Claude',
    endpoint: 'https://api.anthropic.com/v1/messages'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    icon: 'Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/'
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions'
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    icon: 'Grok',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions'
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    icon: 'xAI',
    endpoint: 'https://api.x.ai/v1/chat/completions'
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    icon: 'Kimi',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions'
  },
  glm: {
    id: 'glm',
    name: 'GLM (智谱AI)',
    icon: 'GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    icon: '',
    endpoint: 'http://localhost:11434/v1/chat/completions'
  },
  azure: {
    id: 'azure',
    name: 'Azure OpenAI',
    icon: 'Azure',
    endpoint: ''
  },
  modelscope: {
    id: 'modelscope',
    name: '魔塔社区',
    icon: '',
    endpoint: 'https://api-inference.modelscope.cn/v1/chat/completions'
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动',
    icon: '',
    endpoint: 'https://api.siliconflow.cn/v1/chat/completions'
  },
  ph8: {
    id: 'ph8',
    name: 'PH8',
    icon: '',
    endpoint: 'https://api.ph8.ai/v1/chat/completions'
  },
  ai302: {
    id: 'ai302',
    name: '302.AI',
    icon: '',
    endpoint: 'https://api.302.ai/v1/chat/completions'
  },
  lanyun: {
    id: 'lanyun',
    name: '蓝耘',
    icon: '',
    endpoint: 'https://api.lanyun.ai/v1/chat/completions'
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'Lm Studio',
    icon: '',
    endpoint: 'http://localhost:1234/v1/chat/completions'
  },
  volcengine: {
    id: 'volcengine',
    name: '火山方舟',
    icon: '',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
  },
  zenmux: {
    id: 'zenmux',
    name: 'Zenmux',
    icon: '',
    endpoint: 'https://api.zenmux.com/v1/chat/completions'
  },
  custom: {
    id: 'custom',
    name: '自定义',
    icon: '',
    endpoint: ''
  }
};

// 导出默认配置
export const DEFAULT_AI_CONFIG: Partial<AIProviderConfig> = {
  temperature: 0.7,
  maxTokens: 2000,
  timeout: 30000,
  retryCount: 3
};

// 缓存的配置提供商列表
let cachedConfigProviders: ConfigProvider[] | null = null;

/**
 * 清除服务商配置缓存，强制下次从文件重新加载
 */
export function clearProvidersConfigCache(): void {
  cachedConfigProviders = null;
  console.log('[AI Service] 已清除服务商配置缓存');
}

/**
 * 从配置文件加载服务商列表
 * 使用 fetch 获取配置文件并用 jsonc-parser 解析
 * @param forceRefresh 是否强制刷新（忽略缓存）
 */
export async function loadAIProvidersConfig(forceRefresh: boolean = false): Promise<ConfigProvider[]> {
  if (cachedConfigProviders && !forceRefresh) {
    return cachedConfigProviders;
  }
  
  try {
    // 在开发环境中使用 fetch 获取配置文件
    const response = await fetch('/src/services/ai/config.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.status}`);
    }
    const configText = await response.text();
    // 使用 jsonc-parser 解析带注释的 JSON
    const providers = jsonc.parse(configText) as ConfigProvider[];
    if (providers && Array.isArray(providers)) {
      cachedConfigProviders = providers;
      return providers;
    }
  } catch (error) {
    console.error('[AI Service] 加载服务商配置失败:', error);
  }
  
  return [];
}

/**
 * 获取指定服务商的配置
 * @param providerId 服务商ID (如 'deepseek', 'kimi' 等)
 */
export async function getProviderConfig(providerId: string): Promise<ConfigProvider | null> {
  const providers = await loadAIProvidersConfig();
  return providers.find(p => p.id === providerId) || null;
}

/**
 * 获取指定服务商的模型列表（包含完整配置）
 * @param providerId 服务商ID
 */
export async function getProviderModels(providerId: string): Promise<ConfigModel[]> {
  const provider = await getProviderConfig(providerId);
  return provider?.models || [];
}

/**
 * 获取指定模型的配置
 * @param providerId 服务商ID
 * @param modelId 模型ID
 */
export async function getModelConfig(providerId: string, modelId: string): Promise<ConfigModel | null> {
  const models = await getProviderModels(providerId);
  return models.find(m => m.id === modelId) || null;
}

// 模型启用状态缓存 Map<modelId, isEnabled>
const modelEnabledStatesCache = new Map<string, boolean>();

/**
 * 设置模型启用状态
 */
export function setModelEnabled(modelId: string, enabled: boolean): void {
  modelEnabledStatesCache.set(modelId, enabled);
}

/**
 * 获取模型是否启用
 * 默认禁用，只有明确设置为 true 的才启用
 */
export function isModelEnabled(modelId: string): boolean {
  return modelEnabledStatesCache.get(modelId) === true; // 默认禁用
}

/**
 * 获取所有启用的模型ID列表
 */
export function getEnabledModelIds(): string[] {
  const enabledIds: string[] = [];
  modelEnabledStatesCache.forEach((enabled, modelId) => {
    if (enabled) {
      enabledIds.push(modelId);
    }
  });
  return enabledIds;
}

/**
 * 批量设置模型启用状态
 */
export function setModelEnabledStates(states: Map<string, boolean>): void {
  states.forEach((enabled, modelId) => {
    modelEnabledStatesCache.set(modelId, enabled);
  });
}

/**
 * 从数据库加载所有配置的模型启用状态
 * 应在应用启动时调用
 */
export async function loadModelEnabledStatesFromDB(): Promise<void> {
  try {
    // 获取所有 AI 模型配置
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
    
    console.log('[AI Service] 从数据库获取的配置:', configs);
    
    if (configs && Array.isArray(configs)) {
      let loadedCount = 0;
      
      configs.forEach((config: any) => {
        console.log(`[AI Service] 处理配置: ${config.name}, chatModels:`, config.chatModels);
        
        if (config.chatModels && Array.isArray(config.chatModels)) {
          config.chatModels.forEach((model: any) => {
            console.log(`[AI Service] 模型: ${model.id}, enabled: ${model.enabled}`);
            if (model.id && model.enabled !== undefined) {
              modelEnabledStatesCache.set(model.id, model.enabled);
              if (model.enabled) {
                loadedCount++;
              }
            }
          });
        }
      });
      
      console.log(`[AI Service] 已从数据库加载模型启用状态，${loadedCount} 个模型已启用`);
      console.log('[AI Service] 当前缓存状态:', Array.from(modelEnabledStatesCache.entries()));
    }
  } catch (error) {
    console.error('[AI Service] 加载模型启用状态失败:', error);
  }
}
