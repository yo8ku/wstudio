/**
 * AI服务统一导出
 * 功能：导出所有AI相关的服务和类型
 * 描述：作为AI模块的统一入口，提供所有AI功能的访问
 */

// 导出类型定义
export * from '../../types/aiProvider';
// 导入 AIProviderConfig 用于内部使用
import type { AIProviderConfig } from '../../types/aiProvider';

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
