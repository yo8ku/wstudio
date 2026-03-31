/**
 * AI provider icon components.
 * Renders provider SVGs and resolves provider icons from model identifiers.
 */

import React from 'react';
import OpenAiIcon from '../../../svg/OpenAi.svg';
import ClaudeIcon from '../../../svg/Claude.svg';
import AzureIcon from '../../../svg/Azure.svg';
import DeepSeekIcon from '../../../svg/DeepSeek.svg';
import GeminiIcon from '../../../svg/Gemini.svg';
import GLMIcon from '../../../svg/GLM.svg';
import GrokIcon from '../../../svg/Grok.svg';
import KimiIcon from '../../../svg/kimi2.svg';
import MiniMaxIcon from '../../../svg/minimax.svg';
import xAIIcon from '../../../svg/xAI.svg';
import OpenRouterIcon from '../../../svg/OpenRouter.svg';
import QwenIcon from '../../../svg/Qwen.svg';

interface AIProviderIconProps {
  provider: string;
  size?: number;
  className?: string;
}

const DEFAULT_PROVIDER = 'openai';

const PROVIDER_ICON_MAP: Record<string, string> = {
  openai: OpenAiIcon,
  claude: ClaudeIcon,
  anthropic: ClaudeIcon,
  azure: AzureIcon,
  deepseek: DeepSeekIcon,
  gemini: GeminiIcon,
  glm: GLMIcon,
  grok: GrokIcon,
  groq: GrokIcon,
  kimi: KimiIcon,
  minimax: MiniMaxIcon,
  xai: xAIIcon,
  openrouter: OpenRouterIcon,
  qwen: QwenIcon,
};

const OPENAI_COMPATIBLE_PROVIDERS = new Set([
  'openai',
  'openai-response',
  'openai response',
  'openairesponse',
  'azure',
  'openrouter',
  'custom',
  'modelscope',
  'zenmux',
  'ollama',
  'siliconflow',
  'ph8',
  'ai302',
  'gptsapi',
]);

export const getProviderFromModel = (modelString: string): string => {
  const parts = modelString.split(':');
  return parts.length > 1 ? parts[0] : '';
};

const getProviderIconPath = (provider: string): string | null => {
  if (!provider) return null;
  return PROVIDER_ICON_MAP[provider.toLowerCase()] || null;
};

const normalizeProviderName = (provider: string): string => {
  const lowerProvider = provider.trim().toLowerCase();

  const aliasMap: Record<string, string> = {
    anthropic: 'claude',
    'openai-response': 'openai',
    'openai response': 'openai',
    openairesponse: 'openai',
    zhipu: 'glm',
    zhipuai: 'glm',
    chatglm: 'glm',
    grok: 'xai',
  };

  return aliasMap[lowerProvider] ?? lowerProvider;
};

const getModelNameFromModelString = (modelString: string): string => {
  const parts = modelString.split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : modelString;
};

const detectProviderFromKeywords = (value: string): string | null => {
  const lowerValue = value.trim().toLowerCase();
  if (!lowerValue) return null;

  if (lowerValue.includes('deepseek')) return 'deepseek';
  if (lowerValue.includes('gemini')) return 'gemini';
  if (lowerValue.includes('grok')) return 'xai';
  if (lowerValue.includes('glm') || lowerValue.includes('zhipu') || lowerValue.includes('chatglm')) return 'glm';
  if (lowerValue.includes('qwen')) return 'qwen';
  if (lowerValue.includes('kimi') || lowerValue.includes('moonshot')) return 'kimi';
  if (lowerValue.includes('claude') || lowerValue.includes('anthropic')) return 'claude';
  if (lowerValue.includes('minimax') || lowerValue.includes('abab')) return 'minimax';
  if (lowerValue.includes('gpt') || lowerValue.includes('chatgpt') || lowerValue.includes('o1') || lowerValue.includes('o3') || lowerValue.includes('o4')) return 'openai';
  if (lowerValue.includes('llama') || lowerValue.includes('mixtral') || lowerValue.includes('gemma') || lowerValue.includes('groq')) return 'groq';

  return null;
};

const resolveProviderFromModelString = (modelString: string): string => {
  const providerHint = normalizeProviderName(getProviderFromModel(modelString));
  const modelName = getModelNameFromModelString(modelString);
  const detectedProvider =
    detectProviderFromKeywords(modelName)
    ?? detectProviderFromKeywords(modelString);

  if (detectedProvider) {
    return detectedProvider;
  }

  if (
    providerHint
    && !OPENAI_COMPATIBLE_PROVIDERS.has(providerHint)
    && getProviderIconPath(providerHint)
  ) {
    return providerHint;
  }

  return DEFAULT_PROVIDER;
};

export const AIProviderIcon: React.FC<AIProviderIconProps> = ({
  provider,
  size = 16,
  className = '',
}) => {
  const iconPath = getProviderIconPath(provider);

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    padding: '2px',
  };

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
  };

  if (!iconPath) {
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
          justifyContent: 'center',
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

export const AIProviderIconFromModel: React.FC<{
  modelString: string;
  size?: number;
  className?: string;
}> = ({ modelString, size = 16, className = '' }) => {
  const provider = resolveProviderFromModelString(modelString);
  return <AIProviderIcon provider={provider} size={size} className={className} />;
};
