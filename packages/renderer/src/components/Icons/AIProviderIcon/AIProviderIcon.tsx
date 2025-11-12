/**
 * AI 提供商图标组件
 * 根据提供商名称显示对应的 SVG 图标
 */

import React from 'react';
import './AIProviderIcon.scss';
import OpenAiIcon from '../../../svg/OpenAi.svg';
import ClaudeIcon from '../../../svg/Claude.svg';
import AzureIcon from '../../../svg/Azure.svg';
import DeepSeekIcon from '../../../svg/DeepSeek.svg';
import GeminiIcon from '../../../svg/Gemini.svg';
import GLMIcon from '../../../svg/GLM.svg';
import GrokIcon from '../../../svg/Grok.svg';
import KimiIcon from '../../../svg/kimi2.svg';
import xAIIcon from '../../../svg/xAI.svg';
import OpenRouterIcon from '../../../svg/OpenRouter.svg';
import QwenIcon from '../../../svg/Qwen.svg';

interface AIProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

/**
 * 从模型字符串中提取提供商名称
 * 例如: "OpenAI:gpt-4" => "OpenAI"
 */
export const getProviderFromModel = (modelString: string): string => {
  const parts = modelString.split(':');
  return parts.length > 1 ? parts[0] : '';
};

/**
 * 根据提供商名称获取对应的 SVG 图标路径
 * 支持不区分大小写的匹配
 */
const getProviderIconPath = (provider: string): string | null => {
  const providerMap: Record<string, string> = {
    'openai': OpenAiIcon,
    'claude': ClaudeIcon,
    'anthropic': ClaudeIcon, // Anthropic 使用 Claude 图标
    'azure': AzureIcon,
    'deepseek': DeepSeekIcon,
    'gemini': GeminiIcon,
    'glm': GLMIcon,
    'grok': GrokIcon,
    'groq': GrokIcon, // Groq 使用 Grok 图标
    'kimi': KimiIcon,
    'xai': xAIIcon,
    'openrouter': OpenRouterIcon,
    'qwen': QwenIcon,
  };

  // 转换为小写进行匹配
  return providerMap[provider.toLowerCase()] || null;
};

/**
 * AI 提供商图标组件
 */
export const AIProviderIcon: React.FC<AIProviderIconProps> = ({ 
  provider, 
  size = 16,
  className = '' 
}) => {
  const iconPath = getProviderIconPath(provider);

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    padding: '2px'
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%'
  };

  if (!iconPath) {
    // 如果没有对应的图标，返回默认的占位符
    return (
      <div 
        className={`ai-provider-icon-placeholder ${className}`}
        style={{ 
          ...containerStyle,
          opacity: 0.3,
          padding: 0,
          backgroundColor: 'var(--ws-border-color)',
          borderRadius: '2px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />
    );
  }

  return (
    <div
      className={`ai-provider-icon-wrapper ${className}`}
      style={containerStyle}
    >
      <img
        src={iconPath}
        alt={`${provider} icon`}
        style={imgStyle}
      />
    </div>
  );
};

/**
 * 从完整模型字符串中获取提供商图标
 * 例如: modelString = "OpenAI:gpt-4"
 * 支持智能识别模型类型，例如：
 * - "modelscope:GLM-4.6" 会显示 GLM 图标
 * - "modelscope:Qwen2.5" 会显示 Qwen 图标
 */
export const AIProviderIconFromModel: React.FC<{
  modelString: string;
  size?: number;
  className?: string;
}> = ({ modelString, size = 16, className = '' }) => {
  let provider = getProviderFromModel(modelString);
  
  // 如果无法从模型字符串中提取提供商，尝试从整个字符串中识别
  if (!provider && modelString) {
    // 如果没有冒号分隔符，尝试从整个字符串识别
    const fullStringLower = modelString.toLowerCase();
    if (fullStringLower.includes('claude') || fullStringLower.includes('anthropic')) {
      provider = 'claude';
    } else if (fullStringLower.includes('gpt') || fullStringLower.includes('o1') || fullStringLower.includes('o3')) {
      provider = 'openai';
    } else if (fullStringLower.includes('gemini')) {
      provider = 'gemini';
    } else if (fullStringLower.includes('deepseek')) {
      provider = 'deepseek';
    } else if (fullStringLower.includes('glm') || fullStringLower.includes('zhipu') || fullStringLower.includes('chatglm')) {
      provider = 'glm';
    } else if (fullStringLower.includes('qwen')) {
      provider = 'qwen';
    } else if (fullStringLower.includes('kimi') || fullStringLower.includes('moonshot')) {
      provider = 'kimi';
    } else if (fullStringLower.includes('grok')) {
      provider = 'xai';
    } else if (fullStringLower.includes('llama') || fullStringLower.includes('mixtral') || 
               fullStringLower.includes('gemma') || fullStringLower.includes('groq')) {
      provider = 'groq';
    }
  }

  // 从模型字符串中提取模型名称部分
  const modelName = modelString.split(':')[1] || modelString;
  const modelNameLower = modelName.toLowerCase();
  const providerLower = provider ? provider.toLowerCase() : '';

  // 智能识别：对于所有提供商（包括未知的），都尝试根据模型名称匹配实际的AI服务商
  // 这样可以处理像 GPTSAPI、自定义提供商等未知提供商名称
  if (provider) {
    // 如果提供商是已知的聚合平台，或者提供商不在映射中（未知提供商），都进行模型名称匹配
    const isAggregator = providerLower === 'modelscope' || providerLower === 'zenmux' || 
                         providerLower === 'ollama' || providerLower === 'siliconflow' ||
                         providerLower === 'ph8' || providerLower === 'ai302' || providerLower === 'openrouter' ||
                         providerLower === 'gptsapi' || providerLower === 'custom';
    
    // 如果提供商不在图标映射中，或者已知是聚合平台，尝试根据模型名称匹配
    const hasIcon = getProviderIconPath(provider) !== null;
    if (isAggregator || !hasIcon) {
      // GLM 系列模型 (智谱AI)
      if (modelNameLower.includes('glm') || modelNameLower.includes('zhipu') || modelNameLower.includes('chatglm')) {
        provider = 'glm';
      }
      // DeepSeek 系列
      else if (modelNameLower.includes('deepseek')) {
        provider = 'deepseek';
      }
      // Qwen 系列 (通义千问)
      else if (modelNameLower.includes('qwen')) {
        provider = 'qwen';
      }
      // Kimi 系列 (月之暗面)
      else if (modelNameLower.includes('kimi') || modelNameLower.includes('moonshot')) {
        provider = 'kimi';
      }
      // Claude 系列
      else if (modelNameLower.includes('claude') || modelNameLower.includes('anthropic')) {
        provider = 'claude';
      }
      // Gemini 系列
      else if (modelNameLower.includes('gemini')) {
        provider = 'gemini';
      }
      // GPT 系列 (OpenAI)
      else if (modelNameLower.includes('gpt') || modelNameLower.includes('o1') || modelNameLower.includes('o3')) {
        provider = 'openai';
      }
      // Grok 系列 (xAI)
      else if (modelNameLower.includes('grok')) {
        provider = 'xai';
      }
      // Groq 系列
      else if (modelNameLower.includes('llama') || modelNameLower.includes('mixtral') || 
               modelNameLower.includes('gemma') || modelNameLower.includes('groq')) {
        provider = 'groq';
      }
      // 如果还是没有匹配到，保持原 provider（会显示占位符）
    }
    
    // 额外处理：如果提供商名称直接是 anthropic，映射到 claude
    if (providerLower === 'anthropic') {
      provider = 'claude';
    }
    
    // 额外处理：如果提供商名称直接是 groq，映射到 grok
    if (providerLower === 'groq') {
      provider = 'grok';
    }
  }

  // 如果仍然没有 provider，返回占位符而不是 null
  if (!provider) {
    provider = 'unknown';
  }

  return <AIProviderIcon provider={provider} size={size} className={className} />;
};
