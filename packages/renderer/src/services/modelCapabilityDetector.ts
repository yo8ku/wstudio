/**
 * 模型能力检测服务
 * 通过 API 调用检测模型支持的功能能力
 */

import { ModelCapability, CapabilityDetectionResult } from '../types/modelCapabilities';

/**
 * 模型能力检测器类
 */
export class ModelCapabilityDetector {
  private cache: Map<string, ModelCapability[]> = new Map();
  private detecting: Set<string> = new Set();

  /**
   * 检测模型能力
   * @param modelId 模型 ID
   * @param apiEndpoint API 端点
   * @param apiKey API 密钥
   * @param skipAPIDetection 是否跳过API检测（某些服务商不支持模型详情API）
   * @returns 检测结果
   */
  async detectCapabilities(
    modelId: string,
    apiEndpoint: string,
    apiKey: string,
    skipAPIDetection: boolean = false
  ): Promise<CapabilityDetectionResult> {
    // 检查缓存
    if (this.cache.has(modelId)) {
      return {
        modelId,
        capabilities: this.cache.get(modelId)!,
        success: true
      };
    }

    // 检查是否正在检测
    if (this.detecting.has(modelId)) {
      return {
        modelId,
        capabilities: [],
        success: false,
        error: '正在检测中...'
      };
    }

    this.detecting.add(modelId);

    try {
      const capabilities: ModelCapability[] = [];

      // 1. 基于模型名称的启发式检测
      const heuristicCapabilities = this.detectByModelName(modelId);
      capabilities.push(...heuristicCapabilities);

      // 2. 尝试通过 API 调用检测（如果支持且未跳过）
      if (!skipAPIDetection) {
        try {
          const apiCapabilities = await this.detectByAPI(modelId, apiEndpoint, apiKey);
          // 合并能力，去重
          apiCapabilities.forEach(cap => {
            if (!capabilities.includes(cap)) {
              capabilities.push(cap);
            }
          });
        } catch (error) {
          console.warn('[ModelCapabilityDetector] API 检测失败，使用启发式结果', error);
        }
      } else {
        console.log('[ModelCapabilityDetector] 跳过API检测，仅使用启发式检测');
      }

      // 缓存结果
      this.cache.set(modelId, capabilities);

      return {
        modelId,
        capabilities,
        success: true
      };
    } catch (error) {
      console.error('[ModelCapabilityDetector] 检测失败', error);
      return {
        modelId,
        capabilities: [],
        success: false,
        error: error instanceof Error ? error.message : '未知错误'
      };
    } finally {
      this.detecting.delete(modelId);
    }
  }

  /**
   * 基于模型名称的启发式检测
   * @param modelId 模型 ID
   * @returns 检测到的能力列表
   */
  private detectByModelName(modelId: string): ModelCapability[] {
    const capabilities: ModelCapability[] = [];
    const modelLower = modelId.toLowerCase();

    // 所有模型默认支持流式输出
    capabilities.push(ModelCapability.STREAMING);

    // ========== OpenAI 系列 ==========
    
    // O 系列 (o1, o3) - 推理专用模型
    if (modelLower.includes('o1-') || modelLower.includes('o3-')) {
      capabilities.push(ModelCapability.REASONING);
      capabilities.push(ModelCapability.TOOLS);
    }

    // GPT-4 系列
    if (modelLower.includes('gpt-4')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // GPT-4o 系列
      if (modelLower.includes('gpt-4o')) {
        capabilities.push(ModelCapability.VISION);
        capabilities.push(ModelCapability.REASONING);
        capabilities.push(ModelCapability.FILE_UPLOAD);
      }
      // GPT-4 Turbo
      else if (modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4-1106') || modelLower.includes('gpt-4-0125')) {
        capabilities.push(ModelCapability.VISION);
        capabilities.push(ModelCapability.REASONING);
        capabilities.push(ModelCapability.FILE_UPLOAD);
      }
      // GPT-4 Vision
      else if (modelLower.includes('vision')) {
        capabilities.push(ModelCapability.VISION);
        capabilities.push(ModelCapability.FILE_UPLOAD);
      }
      // 其他 GPT-4
      else {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // GPT-3.5 系列
    if (modelLower.includes('gpt-3.5')) {
      capabilities.push(ModelCapability.TOOLS);
    }

    // ========== Anthropic Claude 系列 ==========
    if (modelLower.includes('claude')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // Claude 3 系列（Opus, Sonnet, Haiku）
      if (modelLower.includes('claude-3')) {
        capabilities.push(ModelCapability.VISION);
        capabilities.push(ModelCapability.FILE_UPLOAD);
        
        // Opus 和 Sonnet 有更强的推理能力
        if (modelLower.includes('opus') || modelLower.includes('sonnet')) {
          capabilities.push(ModelCapability.REASONING);
        }
      }
      // Claude 2 系列
      else if (modelLower.includes('claude-2')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== Google Gemini 系列 ==========
    if (modelLower.includes('gemini')) {
      capabilities.push(ModelCapability.TOOLS);
      capabilities.push(ModelCapability.VISION);
      capabilities.push(ModelCapability.FILE_UPLOAD);
      
      // Pro 和 Ultra 有推理能力
      if (modelLower.includes('pro') || modelLower.includes('ultra')) {
        capabilities.push(ModelCapability.REASONING);
      }
      
      // Gemini 2.0 实验版支持更多功能
      if (modelLower.includes('2.0') || modelLower.includes('exp')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== DeepSeek 系列 ==========
    if (modelLower.includes('deepseek')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // R1 和 Reasoner 是推理模型
      if (modelLower.includes('r1') || modelLower.includes('reasoner')) {
        capabilities.push(ModelCapability.REASONING);
      }
      
      // DeepSeek Coder 系列
      if (modelLower.includes('coder')) {
        capabilities.push(ModelCapability.CODE_EXECUTION);
      }
      
      // DeepSeek Chat 系列
      if (modelLower.includes('chat')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== Meta Llama 系列 ==========
    if (modelLower.includes('llama')) {
      // Llama 3+ 支持工具调用
      if (modelLower.includes('llama-3') || modelLower.includes('llama3')) {
        capabilities.push(ModelCapability.TOOLS);
        capabilities.push(ModelCapability.REASONING);
      }
      
      // Llama Vision 模型
      if (modelLower.includes('vision')) {
        capabilities.push(ModelCapability.VISION);
      }
    }

    // ========== xAI Grok 系列 ==========
    if (modelLower.includes('grok')) {
      capabilities.push(ModelCapability.TOOLS);
      capabilities.push(ModelCapability.REASONING);
      
      // Grok Vision
      if (modelLower.includes('vision') || modelLower.includes('2')) {
        capabilities.push(ModelCapability.VISION);
      }
    }

    // ========== Mistral AI 系列 ==========
    if (modelLower.includes('mistral') || modelLower.includes('mixtral')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // Large 和 Medium 有推理能力
      if (modelLower.includes('large') || modelLower.includes('medium')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== Kimi (Moonshot) 系列 ==========
    if (modelLower.includes('moonshot') || modelLower.includes('kimi')) {
      capabilities.push(ModelCapability.TOOLS);
      capabilities.push(ModelCapability.REASONING);
      capabilities.push(ModelCapability.FILE_UPLOAD);
    }

    // ========== GLM (智谱) 系列 ==========
    if (modelLower.includes('glm') || modelLower.includes('chatglm')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // GLM-4 系列
      if (modelLower.includes('glm-4')) {
        capabilities.push(ModelCapability.REASONING);
        
        // GLM-4V 支持视觉
        if (modelLower.includes('v')) {
          capabilities.push(ModelCapability.VISION);
        }
      }
    }

    // ========== Qwen (通义千问) 系列 ==========
    if (modelLower.includes('qwen')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // Qwen-VL 系列
      if (modelLower.includes('vl')) {
        capabilities.push(ModelCapability.VISION);
      }
      
      // Qwen2 及以上
      if (modelLower.includes('qwen2') || modelLower.includes('qwen-2')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== Cohere 系列 ==========
    if (modelLower.includes('command')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // Command R+ 有推理能力
      if (modelLower.includes('r+') || modelLower.includes('r-plus')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== Yi (零一万物) 系列 ==========
    if (modelLower.includes('yi-')) {
      capabilities.push(ModelCapability.TOOLS);
      
      // Yi Vision
      if (modelLower.includes('vision') || modelLower.includes('vl')) {
        capabilities.push(ModelCapability.VISION);
      }
      
      // Yi Large
      if (modelLower.includes('large')) {
        capabilities.push(ModelCapability.REASONING);
      }
    }

    // ========== 特定能力关键词检测 ==========
    
    // Vision 能力
    if ((modelLower.includes('vision') || modelLower.includes('visual') || modelLower.includes('-vl')) 
        && !capabilities.includes(ModelCapability.VISION)) {
      capabilities.push(ModelCapability.VISION);
      capabilities.push(ModelCapability.FILE_UPLOAD);
    }

    // Web Search 能力
    if (modelLower.includes('search') || modelLower.includes('web')) {
      if (!capabilities.includes(ModelCapability.WEB_SEARCH)) {
        capabilities.push(ModelCapability.WEB_SEARCH);
      }
    }

    // Code Execution 能力
    if ((modelLower.includes('code') || modelLower.includes('coder')) 
        && !capabilities.includes(ModelCapability.CODE_EXECUTION)) {
      capabilities.push(ModelCapability.CODE_EXECUTION);
    }

    return capabilities;
  }

  /**
   * 通过 API 调用检测能力
   * @param modelId 模型 ID
   * @param apiEndpoint API 端点
   * @param apiKey API 密钥
   * @returns 检测到的能力列表
   */
  private async detectByAPI(
    modelId: string,
    apiEndpoint: string,
    apiKey: string
  ): Promise<ModelCapability[]> {
    const capabilities: ModelCapability[] = [];

    try {
      // 构建模型详情端点
      let modelsEndpoint = apiEndpoint;
      if (modelsEndpoint.endsWith('/chat/completions')) {
        modelsEndpoint = modelsEndpoint.replace(/\/chat\/completions$/, '/models');
      } else if (modelsEndpoint.endsWith('/v1') || modelsEndpoint.endsWith('/v1/')) {
        modelsEndpoint = modelsEndpoint.replace(/\/$/, '') + '/models';
      } else if (!modelsEndpoint.includes('/models')) {
        modelsEndpoint = modelsEndpoint.replace(/\/$/, '') + '/v1/models';
      }

      // 添加模型 ID
      const modelDetailEndpoint = `${modelsEndpoint}/${modelId}`;

      console.log('[ModelCapabilityDetector] 请求模型详情:', modelDetailEndpoint);

      const response = await window.electron?.ipcRenderer.invoke('ai:fetch', modelDetailEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status >= 200 && response.status < 300) {
        const data = JSON.parse(response.body);
        console.log('[ModelCapabilityDetector] 模型详情:', data);

        // 解析能力信息
        if (data.capabilities) {
          // 如果 API 直接返回能力信息
          if (Array.isArray(data.capabilities)) {
            data.capabilities.forEach((cap: string) => {
              const capability = this.mapCapabilityString(cap);
              if (capability && !capabilities.includes(capability)) {
                capabilities.push(capability);
              }
            });
          }
        }

        // 检查是否支持 function calling
        if (data.function_calling || data.tools || data.supports_tools) {
          capabilities.push(ModelCapability.TOOLS);
        }

        // 检查是否支持视觉
        if (data.vision || data.supports_vision || data.modalities?.includes('vision')) {
          capabilities.push(ModelCapability.VISION);
        }

        // 检查是否支持联网
        if (data.web_search || data.supports_web_search) {
          capabilities.push(ModelCapability.WEB_SEARCH);
        }
      }
    } catch (error) {
      console.warn('[ModelCapabilityDetector] API 检测失败', error);
      // 不抛出错误，返回空数组
    }

    return capabilities;
  }

  /**
   * 映射能力字符串到枚举
   * @param capString 能力字符串
   * @returns 能力枚举
   */
  private mapCapabilityString(capString: string): ModelCapability | null {
    const lower = capString.toLowerCase();
    
    if (lower.includes('web') || lower.includes('search')) {
      return ModelCapability.WEB_SEARCH;
    }
    if (lower.includes('tool') || lower.includes('function')) {
      return ModelCapability.TOOLS;
    }
    if (lower.includes('vision') || lower.includes('image')) {
      return ModelCapability.VISION;
    }
    if (lower.includes('reason')) {
      return ModelCapability.REASONING;
    }
    if (lower.includes('code')) {
      return ModelCapability.CODE_EXECUTION;
    }
    if (lower.includes('stream')) {
      return ModelCapability.STREAMING;
    }
    
    return null;
  }

  /**
   * 清除缓存
   * @param modelId 可选，指定清除某个模型的缓存，不指定则清除全部
   */
  clearCache(modelId?: string): void {
    if (modelId) {
      this.cache.delete(modelId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 获取缓存的能力
   * @param modelId 模型 ID
   * @returns 能力列表，如果没有缓存则返回 null
   */
  getCachedCapabilities(modelId: string): ModelCapability[] | null {
    return this.cache.get(modelId) || null;
  }
}

// 导出单例
export const modelCapabilityDetector = new ModelCapabilityDetector();

