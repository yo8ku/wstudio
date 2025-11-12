/**
 * 模型Token限制工具
 * 功能：获取不同模型的输入token限制（context window）
 * 描述：根据模型提供商和模型ID返回对应的输入token限制
 */

/**
 * 获取模型的输入token限制（context window）
 * @param providerId 提供商ID（如 'OpenAI', 'Anthropic' 等）
 * @param modelId 模型ID（如 'gpt-4o', 'claude-3-5-sonnet' 等）
 * @returns 模型的输入token限制
 */
export function getModelInputTokenLimit(providerId: string, modelId: string): number {
  const lowerProviderId = providerId.toLowerCase();
  const lowerModelId = modelId.toLowerCase();

  // OpenAI
  if (lowerProviderId === 'openai') {
    const limits: Record<string, number> = {
      'gpt-4o': 128000,
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16384,
      'gpt-4-vision': 128000,
      'o1-preview': 200000,
      'o1-mini': 128000,
      'o3-mini': 200000,
      'o3': 200000
    };
    return limits[lowerModelId] || 128000; // 默认使用较大的值
  }

  // Anthropic
  if (lowerProviderId === 'anthropic') {
    const limits: Record<string, number> = {
      'claude-3-5-sonnet-20241022': 200000,
      'claude-3-5-sonnet-20240620': 200000,
      'claude-3-5-sonnet': 200000,
      'claude-3-opus-20240229': 200000,
      'claude-3-opus': 200000,
      'claude-3-sonnet-20240229': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku-20240307': 200000,
      'claude-3-haiku': 200000
    };
    return limits[lowerModelId] || 200000;
  }

  // Google Gemini
  if (lowerProviderId === 'gemini') {
    const limits: Record<string, number> = {
      'gemini-2.0-flash-exp': 1000000,
      'gemini-1.5-pro': 2000000,
      'gemini-1.5-flash': 1000000,
      'gemini-pro': 32768,
      'gemini-pro-vision': 16384
    };
    return limits[lowerModelId] || 1000000;
  }

  // DeepSeek
  if (lowerProviderId === 'deepseek') {
    const limits: Record<string, number> = {
      'deepseek-chat': 32768,
      'deepseek-coder': 16384,
      'deepseek-reasoner': 64000
    };
    return limits[lowerModelId] || 32768;
  }

  // Groq
  if (lowerProviderId === 'groq') {
    const limits: Record<string, number> = {
      'llama-3.1-8b-instant': 8192,
      'llama-3.1-70b-versatile': 8192,
      'mixtral-8x7b-32768': 32768,
      'gemma-7b-it': 8192
    };
    return limits[lowerModelId] || 8192;
  }

  // Custom Provider (自定义提供商)
  if (lowerProviderId === 'custom') {
    // 从模型名称中提取 token 限制
    const tokenMatch = modelId.match(/(\d+)k/i);
    if (tokenMatch) {
      return parseInt(tokenMatch[1]) * 1000;
    }
    
    const limits: Record<string, number> = {
      'grok-beta': 128000,
      'grok-vision-beta': 128000,
      'moonshot-v1-8k': 8000,
      'moonshot-v1-32k': 32000,
      'moonshot-v1-128k': 128000,
      'glm-4': 128000,
      'glm-4v': 128000,
      'glm-3-turbo': 128000
    };
    return limits[lowerModelId] || 4096;
  }

  // ModelScope (魔塔社区)
  if (lowerProviderId === 'modelscope') {
    if (lowerModelId.includes('32k')) return 32000;
    if (lowerModelId.includes('64k')) return 64000;
    if (lowerModelId.includes('128k')) return 128000;
    return 8000;
  }

  // 默认值：如果无法确定，使用一个保守的值
  // 大多数现代模型至少支持 8K tokens
  return 8192;
}



