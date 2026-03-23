/**
 * Model cache service.
 * Stores AI model metadata in electron-store and rebuilds it from SQLite-backed configs when needed.
 */

import { electronStore } from './ElectronStoreService';
import { getProviderModels } from './ai';

const MODEL_CACHE_KEY = 'model-cache';

interface ModelCapabilities {
  thinking?: boolean;
  tool_calls?: string[];
}

interface RawChatModel {
  id?: string;
  name?: string;
  displayName?: string;
  capabilities?: ModelCapabilities;
}

interface RawAIConfig {
  id?: string;
  name: string;
  providerId: string;
  apiKey?: string;
  apiEndpoint?: string;
  temperature?: number;
  maxTokens?: number;
  chatModels?: RawChatModel[];
  model?: string;
  modelId?: string;
}

export interface CachedModelInfo {
  modelId: string;
  configId: string;
  configName: string;
  apiKey: string;
  apiEndpoint: string;
  providerId: string;
  actualModelId: string;
  temperature?: number;
  id?: string;
  name?: string;
  displayName?: string;
  maxTokens?: number;
  capabilities?: ModelCapabilities;
}

type StoredCachedModelInfo = Omit<CachedModelInfo, 'configId' | 'actualModelId'> & {
  configId?: string;
  actualModelId?: string;
};

export const extractActualModelIdFromCacheModelId = (cacheModelId: string): string => {
  const separatorIndex = cacheModelId.lastIndexOf(':');
  return separatorIndex >= 0 ? cacheModelId.slice(separatorIndex + 1) : cacheModelId;
};

const buildCacheModelId = (configId: string, actualModelId: string): string => `${configId}:${actualModelId}`;

const normalizeDisplayName = (actualModelId: string, displayName?: string): string | undefined => {
  if (displayName?.trim()) {
    return displayName.trim();
  }

  if (actualModelId.includes('/')) {
    return actualModelId.split('/').pop() || actualModelId;
  }

  return undefined;
};

const getConfigIdentity = (config: RawAIConfig): string => {
  const trimmedId = config.id?.trim();
  if (trimmedId) {
    return trimmedId;
  }

  return config.name.trim();
};

const normalizeCachedModel = (model: StoredCachedModelInfo): CachedModelInfo => ({
  ...model,
  configId: model.configId?.trim() || model.configName,
  actualModelId: model.actualModelId?.trim() || extractActualModelIdFromCacheModelId(model.modelId),
});

const needsCacheRefresh = (models: StoredCachedModelInfo[]): boolean => (
  models.some((model) => !model.configId?.trim() || !model.actualModelId?.trim())
);

const loadConfigsFromDatabase = async (): Promise<RawAIConfig[]> => {
  const configs = await window.electron?.ipcRenderer.invoke('ai-model:list') as RawAIConfig[] | undefined;
  return Array.isArray(configs) ? configs : [];
};

const enrichCapabilities = async (models: CachedModelInfo[]): Promise<CachedModelInfo[]> => {
  return Promise.all(
    models.map(async (model) => {
      if (model.capabilities || !model.providerId) {
        return model;
      }

      const providerModels = await getProviderModels(model.providerId);
      const providerModel = providerModels.find((item) => item.id === model.actualModelId);

      if (!providerModel?.capabilities) {
        return model;
      }

      return {
        ...model,
        capabilities: providerModel.capabilities,
      };
    }),
  );
};

const buildCacheEntry = (
  config: RawAIConfig,
  configId: string,
  actualModelId: string,
  options: {
    id?: string;
    name?: string;
    displayName?: string;
    capabilities?: ModelCapabilities;
  } = {},
): CachedModelInfo => ({
  modelId: buildCacheModelId(configId, actualModelId),
  configId,
  configName: config.name,
  apiKey: config.apiKey || '',
  apiEndpoint: config.apiEndpoint || '',
  providerId: config.providerId,
  actualModelId,
  temperature: config.temperature,
  id: options.id || actualModelId,
  name: options.name || actualModelId,
  displayName: normalizeDisplayName(actualModelId, options.displayName),
  maxTokens: config.maxTokens,
  capabilities: options.capabilities,
});

const buildModelsFromConfigs = async (configs: RawAIConfig[]): Promise<CachedModelInfo[]> => {
  const modelMap = new Map<string, CachedModelInfo>();

  for (const config of configs) {
    if (!config.apiKey || !config.apiEndpoint) {
      continue;
    }

    const configId = getConfigIdentity(config);
    let hasAddedModels = false;

    if (Array.isArray(config.chatModels) && config.chatModels.length > 0) {
      const providerModels = await getProviderModels(config.providerId);

      for (const chatModel of config.chatModels) {
        const actualModelId = (chatModel.id || chatModel.name || '').trim();
        if (!actualModelId) {
          continue;
        }

        const providerModel = providerModels.find((item) => item.id === actualModelId);
        const cacheEntry = buildCacheEntry(config, configId, actualModelId, {
          id: chatModel.id,
          name: chatModel.name || chatModel.id || actualModelId,
          displayName: chatModel.displayName,
          capabilities: chatModel.capabilities || providerModel?.capabilities,
        });

        if (!modelMap.has(cacheEntry.modelId)) {
          modelMap.set(cacheEntry.modelId, cacheEntry);
          hasAddedModels = true;
        }
      }
    } else if (config.model?.trim()) {
      const cacheEntry = buildCacheEntry(config, configId, config.model.trim());
      modelMap.set(cacheEntry.modelId, cacheEntry);
      hasAddedModels = true;
    } else if (config.modelId?.trim()) {
      const actualModelId = config.modelId.trim();
      const cacheEntry = buildCacheEntry(config, configId, actualModelId, {
        displayName: actualModelId,
      });
      modelMap.set(cacheEntry.modelId, cacheEntry);
      hasAddedModels = true;
    }

    if (!hasAddedModels) {
      console.warn(`[ModelCache] No available models found in config "${config.name}".`);
    }
  }

  return Array.from(modelMap.values());
};

/**
 * Save model list into local cache.
 */
export async function cacheModels(models: CachedModelInfo[]): Promise<void> {
  try {
    await electronStore.set(MODEL_CACHE_KEY, models);
    console.log('[ModelCache] Cached model count:', models.length);
  } catch (error) {
    console.error('[ModelCache] Failed to cache models:', error);
  }
}

/**
 * Load model list from electron-store first, then rebuild from SQLite-backed configs when needed.
 */
export async function getCachedModels(): Promise<CachedModelInfo[]> {
  try {
    const cached = await electronStore.get(MODEL_CACHE_KEY) as StoredCachedModelInfo[] | undefined;
    const cachedModels = Array.isArray(cached) ? cached : [];

    if (cachedModels.length > 0 && cachedModels.every((model) => typeof model.modelId === 'string')) {
      if (!needsCacheRefresh(cachedModels)) {
        return enrichCapabilities(cachedModels.map(normalizeCachedModel));
      }

      await clearModelCache();
    }

    const configs = await loadConfigsFromDatabase();
    if (configs.length === 0) {
      return [];
    }

    const models = await buildModelsFromConfigs(configs);
    if (models.length > 0) {
      await cacheModels(models);
    }

    return models;
  } catch (error) {
    console.error('[ModelCache] Failed to load models:', error);
    return [];
  }
}

/**
 * Return cached model ids only.
 */
export async function getCachedModelIds(): Promise<string[]> {
  const models = await getCachedModels();
  return models.map((model) => model.modelId);
}

/**
 * Return a cached model config by cache model id.
 */
export async function getModelConfig(modelId: string): Promise<CachedModelInfo | undefined> {
  const models = await getCachedModels();
  return models.find((model) => model.modelId === modelId);
}

/**
 * Clear model cache.
 */
export async function clearModelCache(): Promise<void> {
  try {
    await electronStore.delete(MODEL_CACHE_KEY);
    console.log('[ModelCache] Cleared model cache.');
  } catch (error) {
    console.error('[ModelCache] Failed to clear model cache:', error);
  }
}

/**
 * Rebuild model cache from AI configs.
 */
export async function updateModelCacheFromConfig(): Promise<void> {
  try {
    const configs = await loadConfigsFromDatabase();

    if (configs.length === 0) {
      await clearModelCache();
      return;
    }

    const models = await buildModelsFromConfigs(configs);
    await cacheModels(models);
    window.dispatchEvent(new CustomEvent('models-cache-updated'));
  } catch (error) {
    console.error('[ModelCache] Failed to refresh model cache:', error);
  }
}
