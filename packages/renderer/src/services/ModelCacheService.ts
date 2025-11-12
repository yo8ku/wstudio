/**
 * 模型缓存服务
 * 用于在本地缓存AI模型列表，避免重复的IPC通信
 * 使用 electron-store 进行持久化存储
 */

import { electronStore } from './ElectronStoreService';

const MODEL_CACHE_KEY = 'model-cache';

export interface CachedModelInfo {
  modelId: string;          // 格式：配置名:模型名
  configName: string;       // AI配置名称
  apiKey: string;           // API密钥
  apiEndpoint: string;      // API端点
  providerId: string;       // 提供商ID
  temperature?: number;     // 温度参数
  id?: string;              // 模型ID（可选）
  name?: string;            // 模型名称（可选）
  displayName?: string;     // 模型显示名称（可选）
  maxTokens?: number;       // 最大令牌数（可选）
}

/**
 * 保存模型列表到本地缓存
 */
export async function cacheModels(models: CachedModelInfo[]): Promise<void> {
  try {
    // 直接保存完整的模型信息（保持 CachedModelInfo 格式）
    await electronStore.set(MODEL_CACHE_KEY, models);
    console.log('[ModelCache]  缓存模型列表，数量:', models.length);
  } catch (error) {
    console.error('[ModelCache]  缓存模型失败:', error);
  }
}

/**
 * 从本地缓存加载模型列表
 * 优先从 electron-store 缓存获取，如果缓存不存在则从 SQLite 数据库获取
 */
export async function getCachedModels(): Promise<CachedModelInfo[]> {
  try {
    // 1. 尝试从 electron-store 缓存获取
    const cached = await electronStore.get(MODEL_CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) {
      // 检查缓存格式是否正确
      if (cached[0] && typeof cached[0] === 'object' && 'modelId' in cached[0]) {
        console.log('[ModelCache]  从 electron-store 加载缓存的模型，数量:', cached.length);
        return cached as CachedModelInfo[];
      }
    }
    
    // 2. 缓存不存在或格式不正确，从 SQLite 数据库获取
    console.log('[ModelCache] 缓存不存在，从 SQLite 数据库加载模型...');
    
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
    
    console.log('[ModelCache] 🔍 getCachedModels - 从数据库获取的配置:', JSON.stringify(configs, null, 2));
    
    if (!configs || configs.length === 0) {
      console.log('[ModelCache] 数据库中没有找到AI配置');
      return [];
    }

    console.log('[ModelCache] 📊 getCachedModels - 配置数量:', configs.length);
    configs.forEach((cfg: any, index: number) => {
      console.log(`[ModelCache] getCachedModels - 配置 ${index + 1}:`, {
        id: cfg.id,
        name: cfg.name,
        providerId: cfg.providerId,
        hasChatModels: !!cfg.chatModels,
        chatModelsCount: cfg.chatModels?.length || 0,
        chatModelsData: cfg.chatModels,
        hasModel: !!cfg.model,
        hasModelId: !!cfg.modelId,
        hasApiKey: !!cfg.apiKey,
        hasApiEndpoint: !!cfg.apiEndpoint
      });
    });

    const models: CachedModelInfo[] = [];

    // 提供商名称映射
    const getProviderName = (providerId: string) => {
      const providerMap: Record<string, string> = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'deepseek': 'DeepSeek',
        'modelscope': 'ModelScope',
        'custom': 'Custom'
      };
      return providerMap[providerId] || providerId;
    };

    // 遍历配置，提取模型
    const modelMap = new Map<string, CachedModelInfo>(); // 使用Map去重
    
    configs.forEach((config: any) => {
      // 只处理有API Key的配置（已配置的）
      if (!config.apiKey || !config.apiEndpoint) {
        console.log(`[ModelCache] 跳过未配置的配置: ${config.name}`);
        return;
      }

      const providerName = getProviderName(config.providerId);
      let hasAddedModels = false;

      // 如果配置有chatModels列表，使用列表中的模型
      if (config.chatModels && config.chatModels.length > 0) {
        config.chatModels.forEach((chatModel: any) => {
          const modelId = chatModel.id || chatModel.name;
          if (!modelId) {
            console.warn(`[ModelCache] 配置 ${config.name} 中的模型没有有效的 ID:`, chatModel);
            return;
          }
          
          const modelString = `${providerName}:${modelId}`;
          
          // 如果没有 displayName，尝试从 modelId 中提取
          let displayName = chatModel.displayName;
          if (!displayName && modelId.includes('/')) {
            // 对于 "ZhipuAI/GLM-4.6" 格式，提取 "/" 后面的部分
            displayName = modelId.split('/').pop() || modelId;
          }
          
          // 使用modelString作为key，避免重复
          if (!modelMap.has(modelString)) {
            modelMap.set(modelString, {
              modelId: modelString,
              configName: config.name,
              apiKey: config.apiKey,
              apiEndpoint: config.apiEndpoint,
              providerId: config.providerId,
              temperature: config.temperature,
              id: chatModel.id,
              name: chatModel.name || chatModel.id,
              displayName: displayName,
              maxTokens: config.maxTokens
            });
            hasAddedModels = true;
          }
        });
      } 
      // 否则，如果有单个model字段，使用它
      else if (config.model) {
        const modelString = `${providerName}:${config.model}`;
        
        // 使用modelString作为key，避免重复
        if (!modelMap.has(modelString)) {
          modelMap.set(modelString, {
            modelId: modelString,
            configName: config.name,
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            providerId: config.providerId,
            temperature: config.temperature,
            maxTokens: config.maxTokens
          });
          hasAddedModels = true;
        }
      }
      // 🔥 如果配置既没有 chatModels 也没有 model，尝试从 modelId 字段获取
      else if (config.modelId) {
        const modelString = `${providerName}:${config.modelId}`;
        
        if (!modelMap.has(modelString)) {
          modelMap.set(modelString, {
            modelId: modelString,
            configName: config.name,
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            providerId: config.providerId,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            displayName: config.modelId
          });
          hasAddedModels = true;
        }
      }
      
      // 🔥 日志：如果配置没有任何模型，记录警告
      if (!hasAddedModels) {
        console.warn(`[ModelCache] ⚠️ 配置 "${config.name}" 没有找到任何可用的模型数据！`, {
          providerId: config.providerId,
          hasChatModels: !!config.chatModels,
          chatModelsLength: config.chatModels?.length || 0,
          hasModel: !!config.model,
          hasModelId: !!config.modelId
        });
      }
    });
    
    // 将Map转换为数组
    models.push(...Array.from(modelMap.values()));
    
    console.log('[ModelCache] 去重后的模型数量:', models.length);
    console.log('[ModelCache] 模型列表:', models.map(m => m.modelId).join(', '));

    // 保存到缓存
    if (models.length > 0) {
      await cacheModels(models);
      console.log('[ModelCache]  已将模型缓存到 electron-store，数量:', models.length);
    }

    return models;
  } catch (error) {
    console.error('[ModelCache]  加载缓存模型失败:', error);
    return [];
  }
}

/**
 * 获取模型ID列表（仅ID）
 */
export async function getCachedModelIds(): Promise<string[]> {
  const models = await getCachedModels();
  return models.map(m => m.modelId);
}

/**
 * 根据模型ID获取模型配置信息
 */
export async function getModelConfig(modelId: string): Promise<CachedModelInfo | undefined> {
  const models = await getCachedModels();
  return models.find(m => m.modelId === modelId);
}

/**
 * 清除模型缓存
 */
export async function clearModelCache(): Promise<void> {
  try {
    await electronStore.delete(MODEL_CACHE_KEY);
    console.log('[ModelCache]  已清除模型缓存');
  } catch (error) {
    console.error('[ModelCache]  清除模型缓存失败:', error);
  }
}

/**
 * 从AI配置生成并缓存模型列表
 * 注意：AI 配置现在存储在 SQLite 中，通过 IPC 获取
 */
export async function updateModelCacheFromConfig(): Promise<void> {
  try {
    // AI 配置存储在 SQLite 中，需要通过 IPC 获取
    const configs = await window.electron?.ipcRenderer.invoke('ai-model:list');
    
    console.log('[ModelCache] 🔍 从数据库获取的配置:', JSON.stringify(configs, null, 2));
    
    if (!configs || configs.length === 0) {
      console.log('[ModelCache] 没有找到AI配置');
      await clearModelCache();
      return;
    }
    
    console.log('[ModelCache] 📊 配置数量:', configs.length);
    configs.forEach((cfg: any, index: number) => {
      console.log(`[ModelCache] 配置 ${index + 1}:`, {
        id: cfg.id,
        name: cfg.name,
        providerId: cfg.providerId,
        hasChatModels: !!cfg.chatModels,
        chatModelsCount: cfg.chatModels?.length || 0,
        hasModel: !!cfg.model,
        hasModelId: !!cfg.modelId,
        hasApiKey: !!cfg.apiKey,
        hasApiEndpoint: !!cfg.apiEndpoint
      });
    });

    const modelMap = new Map<string, CachedModelInfo>(); // 使用Map去重

    const getProviderName = (providerId: string) => {
      const providerMap: Record<string, string> = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'deepseek': 'DeepSeek',
        'modelscope': 'ModelScope',
        'custom': 'Custom'
      };
      return providerMap[providerId] || providerId;
    };

    configs.forEach((config: any) => {
      // 只处理有API Key的配置（已配置的）
      if (!config.apiKey || !config.apiEndpoint) {
        console.log(`[ModelCache] 跳过未配置的配置: ${config.name}`);
        return;
      }

      const providerName = getProviderName(config.providerId);
      let hasAddedModels = false;

      // 如果配置有chatModels列表，使用列表中的模型
      if (config.chatModels && config.chatModels.length > 0) {
        config.chatModels.forEach((chatModel: any) => {
          const modelId = chatModel.id || chatModel.name;
          if (!modelId) {
            console.warn(`[ModelCache] 配置 ${config.name} 中的模型没有有效的 ID:`, chatModel);
            return;
          }
          
          const modelString = `${providerName}:${modelId}`;
          
          // 如果没有 displayName，尝试从 modelId 中提取
          let displayName = chatModel.displayName;
          if (!displayName && modelId.includes('/')) {
            // 对于 "ZhipuAI/GLM-4.6" 格式，提取 "/" 后面的部分
            displayName = modelId.split('/').pop() || modelId;
          }
          
          // 使用modelString作为key，避免重复
          if (!modelMap.has(modelString)) {
            modelMap.set(modelString, {
              modelId: modelString,
              configName: config.name,
              apiKey: config.apiKey,
              apiEndpoint: config.apiEndpoint,
              providerId: config.providerId,
              temperature: config.temperature,
              displayName: displayName,
              maxTokens: config.maxTokens
            });
            hasAddedModels = true;
          }
        });
      } 
      // 否则，如果有单个model字段，使用它
      else if (config.model) {
        const modelString = `${providerName}:${config.model}`;
        
        // 使用modelString作为key，避免重复
        if (!modelMap.has(modelString)) {
          modelMap.set(modelString, {
            modelId: modelString,
            configName: config.name,
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            providerId: config.providerId,
            temperature: config.temperature,
            maxTokens: config.maxTokens
          });
          hasAddedModels = true;
        }
      }
      // 🔥 如果配置既没有 chatModels 也没有 model，尝试从 modelId 字段获取
      else if (config.modelId) {
        const modelString = `${providerName}:${config.modelId}`;
        
        if (!modelMap.has(modelString)) {
          modelMap.set(modelString, {
            modelId: modelString,
            configName: config.name,
            apiKey: config.apiKey,
            apiEndpoint: config.apiEndpoint,
            providerId: config.providerId,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            displayName: config.modelId
          });
          hasAddedModels = true;
        }
      }
      
      // 🔥 日志：如果配置没有任何模型，记录警告
      if (!hasAddedModels) {
        console.warn(`[ModelCache] ⚠️ 配置 "${config.name}" 没有找到任何可用的模型数据！`, {
          providerId: config.providerId,
          hasChatModels: !!config.chatModels,
          chatModelsLength: config.chatModels?.length || 0,
          hasModel: !!config.model,
          hasModelId: !!config.modelId
        });
      }
    });

    const models = Array.from(modelMap.values());
    
    console.log('[ModelCache] 更新缓存 - 去重后的模型数量:', models.length);
    console.log('[ModelCache] 更新缓存 - 模型列表:', models.map(m => m.modelId).join(', '));

    await cacheModels(models);
    
    // 触发模型更新事件
    window.dispatchEvent(new CustomEvent('models-cache-updated'));
  } catch (error) {
    console.error('[ModelCache]  更新模型缓存失败:', error);
  }
}


