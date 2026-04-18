/**
 * AI 模型配置视图组件
 * 功能：在标签页中显示和编辑 AI 模型配置
 * 描述：提供 AI 模型的详细配置界面，包括 API 密钥、端点、模型选择
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AIProviderIcon } from '../../Icons/AIProviderIcon';
import { Tooltip } from '../../Tooltip';
import { Icon } from '../../Icons';
import { SearchBox } from '../../common/SearchBox';
import { DropdownMenu } from '../../common/DropdownMenu';
import { Switch } from '../../common/Switch';
import { aiService, AI_PROVIDERS, setModelEnabled, isModelEnabled, getProviderModels } from '../../../services/ai';
import { AIProviderConfig } from '../../../types/aiProvider';
import { toastService } from '../../../services/ToastService';
import { clearModelCache } from '../../../services/ModelCacheService';
import './AIConfigView.scss';

interface AIConfigViewProps {
  configId?: string;
  configIndex?: number;
}

interface ChatModel {
  id: string;
  name: string;
  displayName?: string;
  enabled?: boolean; // 模型是否启用
  capabilities?: {
    thinking?: boolean;
    tool_calls?: string[];
  };
}

// 深度思考图标组件 (Lucide Brain Icon)
const ThinkingIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ marginLeft: 15, opacity: 0.8, verticalAlign: 'middle' }}
    aria-label="支持深度思考"
  >
    <title>支持深度思考</title>
    <path d="M12 18V5"/>
    <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/>
    <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/>
    <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/>
    <path d="M18 18a4 4 0 0 0 2-7.464"/>
    <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/>
    <path d="M6 18a4 4 0 0 1-2-7.464"/>
    <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>
  </svg>
);

interface AIModelConfig {
  name: string;
  apiKey: string;
  apiEndpoint: string;
  providerId: string;
  chatModels?: ChatModel[];
  modelId?: string; // 魔塔社区等服务商需要的模型ID（单个模型，向后兼容）
  models?: string[]; // 魔塔社区等服务商的多个模型ID列表
}

interface FetchModelsOptions {
  showToast?: boolean;
}

// 使用 AI_PROVIDERS 生成服务商列表（7种协议）
const DEFAULT_AI_PROVIDERS_LIST = Object.values(AI_PROVIDERS).map(provider => ({
  id: provider.id,
  name: provider.name,
  iconName: provider.icon,
  endpoint: provider.endpoint
}));

export const AIConfigView: React.FC<AIConfigViewProps> = ({ configId, configIndex }) => {
  const { t } = useTranslation();
  const translateText = useCallback(
    (key: string, defaultValue: string, values?: Record<string, string>): string =>
      String(t(key, values ? { defaultValue, ...values } : { defaultValue })),
    [t],
  );
  // 服务商列表（7种协议）
  const AI_PROVIDERS_LIST = DEFAULT_AI_PROVIDERS_LIST;
  const [config, setConfig] = useState<AIModelConfig>({
    name: '',
    apiKey: '',
    apiEndpoint: '',
    providerId: 'openai',
    chatModels: [],
    modelId: '',
    models: []
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [availableModels, setAvailableModels] = useState<ChatModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  // 模型启用状态 Map<modelId, isEnabled>
  const [modelEnabledStates, setModelEnabledStates] = useState<Map<string, boolean>>(new Map());
  const [hasTestedConnection, setHasTestedConnection] = useState(false); // 标记是否已经测试连接成功
  const [isSaving, setIsSaving] = useState(false); // 是否正在保存
  const [currentConfigId, setCurrentConfigId] = useState<string>(() => {
    // 优先使用传入的 configId
    if (configId) return configId;
    // 向后兼容：如果有 configIndex，从索引推导 ID
    if (configIndex !== undefined) return `config-${configIndex}`;
    // 新建配置：生成临时 ID
    return `temp-config-${Date.now()}`;
  }); // 当前配置的ID
  // 保存原始配置用于检测未保存更改
  const [savedConfig, setSavedConfig] = useState<AIModelConfig | null>(null);

  // 获取当前提供商的图标名称
  const currentProviderIconName = useMemo(() => {
    const provider = AI_PROVIDERS_LIST.find(p => p.id === config.providerId);
    return provider?.iconName || '';
  }, [config.providerId, AI_PROVIDERS_LIST]);

  // 检测未保存更改并通知 EditorArea
  useEffect(() => {
    // 比较当前配置与保存的配置
    const hasUnsavedChanges = savedConfig !== null && (
      config.name !== savedConfig.name ||
      config.apiKey !== savedConfig.apiKey ||
      config.apiEndpoint !== savedConfig.apiEndpoint ||
      config.providerId !== savedConfig.providerId ||
      config.modelId !== savedConfig.modelId
    );

    // 新建配置时，只要有内容就算有未保存更改
    const isNewConfig = currentConfigId.startsWith('temp-config-');
    const newConfigHasContent = isNewConfig && (
      config.name.trim() !== '' ||
      config.apiKey.trim() !== ''
    );

    const shouldMarkUnsaved = hasUnsavedChanges || newConfigHasContent;

    // 派发事件通知 EditorArea
    window.dispatchEvent(new CustomEvent('ai-config-unsaved-status', {
      detail: {
        configId: currentConfigId,
        hasUnsavedChanges: shouldMarkUnsaved
      }
    }));
  }, [config, savedConfig, currentConfigId]);

  // 判断是否为文本相关的工具模型（embedding、moderation等）
  const isToolModel = useCallback((modelName: string): boolean => {
    const lowerName = modelName.toLowerCase();
    
    // Embedding 模型
    if (lowerName.includes('embedding') || lowerName.includes('embed')) {
      return true;
    }
    
    // Moderation 模型
    if (lowerName.includes('moderation')) {
      return true;
    }
    
    return false;
  }, []);

  const filterChatModels = useCallback((models: ChatModel[]): ChatModel[] => (
    models.filter(model => !isToolModel(model.id))
  ), [isToolModel]);

  // 获取工具模型 tooltip 说明
  const getToolModelTooltip = useCallback((modelName: string): string => {
    const lowerName = modelName.toLowerCase();
    
    // Embedding 模型 tooltip
    if (lowerName.includes('text-embedding-3-large')) {
      return translateText(
        'aiConfigView.tooltips.embeddingLarge',
        'Best text embedding model for high-accuracy retrieval.',
      );
    }
    if (lowerName.includes('text-embedding-3-small')) {
      return translateText(
        'aiConfigView.tooltips.embeddingSmall',
        'Efficient text embedding model with a better cost-performance balance.',
      );
    }
    if (lowerName.includes('text-embedding-ada-002')) {
      return translateText(
        'aiConfigView.tooltips.embeddingLegacy',
        'Legacy text embedding model from the previous generation.',
      );
    }
    
    // 通用 embedding 模型说明
    if (lowerName.includes('embedding') || lowerName.includes('embed')) {
      return translateText(
        'aiConfigView.tooltips.embeddingGeneric',
        'Text embedding model used to convert text into numerical vectors.',
      );
    }
    
    // Moderation 模型说明
    if (lowerName.includes('moderation')) {
      return translateText(
        'aiConfigView.tooltips.moderation',
        'Moderation model used to detect unsafe or inappropriate content.',
      );
    }
    
    return '';
  }, [translateText]);

  // 从模型ID生成友好的显示名称
  // 例如: "ZhipuAI/GLM-4.6" -> "G L M 4.6"
  //       "deepseek-ai/DeepSeek-V3.1" -> "DeepSeek V3.1"
  const generateDisplayName = useCallback((modelId: string): string => {
    // 如果有斜杠，取后面的部分
    const parts = modelId.split('/');
    const modelName = parts.length > 1 ? parts[parts.length - 1] : modelId;
    
    // 处理常见的命名模式
    // 例如: "GLM-4.6" -> "G L M 4.6"
    //      "DeepSeek-V3.1" -> "DeepSeek V3.1"
    //      "Qwen2.5-72B-Instruct" -> "Qwen2.5 72B Instruct"
    
    // 在数字和字母之间添加空格，在连字符处也添加空格
    let displayName = modelName
      .replace(/([A-Z])([A-Z])/g, '$1 $2') // 大写字母之间添加空格
      .replace(/([a-z])([A-Z])/g, '$1 $2') // 小写字母和大写字母之间添加空格
      .replace(/([A-Za-z])(\d)/g, '$1 $2') // 字母和数字之间添加空格
      .replace(/(\d)([A-Za-z])/g, '$1 $2') // 数字和字母之间添加空格
      .replace(/[-_]/g, ' ') // 连字符和下划线替换为空格
      .replace(/\s+/g, ' ') // 多个空格合并为一个
      .trim();
    
    return displayName || modelId;
  }, []);

  // 判断是否为老旧模型（需要过滤）
  const isOutdatedModel = useCallback((modelName: string): boolean => {
    const lowerName = modelName.toLowerCase();
    
    // OpenAI 老旧模型的精确匹配列表
    const exactOutdatedModels = [
      'gpt-3.5-turbo-0301',
      'gpt-3.5-turbo-0613',
      'gpt-3.5-turbo-1106',
      'gpt-3.5-turbo-16k-0613',
      'gpt-3.5-turbo-16k',
      'gpt-4-0314',
      'gpt-4-0613',
      'gpt-4-32k-0314',
      'gpt-4-32k-0613',
      'gpt-4-32k',
      'text-davinci-003',
      'text-davinci-002',
      'text-davinci-001',
      'text-curie-001',
      'text-babbage-001',
      'text-ada-001',
      'davinci-002',
      'davinci',
      'curie',
      'babbage',
      'ada',
      'text-embedding-ada-001', // 老版本embedding
      'code-davinci-002',
      'code-davinci-001',
      'code-cushman-002',
      'code-cushman-001',
    ];
    
    // 模式匹配（包含这些关键词的都过滤）
    const outdatedPatterns = [
      'text-similarity',
      'text-search',
      'code-search',
      // Claude 老旧模型
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2',
      'claude-instant-1.1',
      'claude-instant-1',
      'claude-v1',
      // Gemini 老旧模型
      'gemini-1.0-pro',
      'gemini-pro-vision', // 已被 gemini-1.5-pro 替代
    ];
    
    // 检查精确匹配
    if (exactOutdatedModels.includes(lowerName)) {
      return true;
    }
    
    // 检查模式匹配
    if (outdatedPatterns.some(pattern => lowerName.includes(pattern.toLowerCase()))) {
      return true;
    }
    
    // 过滤特定的旧版本号标识（但保留最新的模型）
    const oldVersionPatterns = ['-0301', '-0314', '-0613'];
    const isOldVersion = oldVersionPatterns.some(pattern => lowerName.includes(pattern));
    if (isOldVersion) {
      // 排除一些需要保留的模型（如果有的话）
      return true;
    }
    
    return false;
  }, []);

  // 根据模型名称推断提供商
  const getProviderByModelName = useCallback((modelName: string): { id: string; name: string; icon: string } => {
    const lowerName = modelName.toLowerCase();
    const currentProvider = AI_PROVIDERS_LIST.find(p => p.id === config.providerId);
    
    // 首先检查是否为工具模型
    if (isToolModel(modelName)) {
      return {
        id: 'tool',
        name: translateText('aiConfigView.providers.toolModel', 'Tool Model'),
        icon: '',
      };
    }

    if (config.providerId === 'ollama') {
      return {
        id: 'ollama',
        name: currentProvider?.name || 'Ollama',
        icon: currentProviderIconName,
      };
    }
    
    // OpenAI 模型
    if (lowerName.includes('gpt') || lowerName.includes('o1') || lowerName.includes('o3')) {
      return { id: 'openai', name: 'OpenAI', icon: 'OpenAI' };
    }
    
    // Anthropic Claude 模型
    if (lowerName.includes('claude')) {
      return { id: 'anthropic', name: 'Anthropic', icon: 'Claude' };
    }
    
    // Google Gemini 模型
    if (lowerName.includes('gemini')) {
      return { id: 'gemini', name: 'Google Gemini', icon: 'Gemini' };
    }
    
    // DeepSeek 模型
    if (lowerName.includes('deepseek')) {
      return { id: 'deepseek', name: 'DeepSeek', icon: 'DeepSeek' };
    }
    
    // xAI Grok 模型
    if (lowerName.includes('grok')) {
      return { id: 'xai', name: 'xAI', icon: 'xAI' };
    }
    
    // Groq 模型
    if (lowerName.includes('llama') || lowerName.includes('mixtral') || lowerName.includes('gemma')) {
      return { id: 'groq', name: 'Groq', icon: 'Grok' };
    }
    
    // Kimi 模型
    if (lowerName.includes('moonshot') || lowerName.includes('kimi')) {
      return { id: 'kimi', name: 'Kimi', icon: 'Kimi' };
    }
    
    // GLM 智谱AI 模型
    if (lowerName.includes('glm') || lowerName.includes('chatglm')) {
      return {
        id: 'glm',
        name: translateText('aiConfigView.providers.glm', 'GLM (Zhipu AI)'),
        icon: 'GLM',
      };
    }
    
    // Qwen (通义千问) 模型
    if (lowerName.includes('qwen')) {
      return {
        id: 'qwen',
        name: translateText('aiConfigView.providers.qwen', 'Qwen'),
        icon: 'qwen',
      };
    }
    
    // 默认使用当前提供商
    return { 
      id: config.providerId, 
      name: currentProvider?.name || translateText('aiConfigView.providers.other', 'Other'), 
      icon: currentProviderIconName 
    };
  }, [AI_PROVIDERS_LIST, currentProviderIconName, config.providerId, isToolModel, translateText]);

  // 根据模型名称推断提供商图标（保持向后兼容）
  const getProviderIconByModelName = useCallback((modelName: string): string => {
    return getProviderByModelName(modelName).icon;
  }, [getProviderByModelName]);

  // 从模型ID中提取日期信息用于排序
  const extractModelDate = useCallback((modelId: string): Date => {
    // 特殊处理：某些模型没有标准日期格式但是是最新的
    const specialModels: Record<string, Date> = {
      'claude-sonnet-4-5': new Date(2025, 9, 1), // 2025-10 - Claude Sonnet 4.5 是最新的
      'gpt-4o': new Date(2024, 4, 13), // 2024-05
      'gpt-4-turbo': new Date(2024, 3, 9), // 2024-04
      'gpt-4': new Date(2023, 2, 14), // 2023-03
    };
    
    // 检查是否是特殊模型（精确匹配）
    if (specialModels[modelId]) {
      return specialModels[modelId];
    }
    
    // 尝试从模型ID中提取日期，格式如：claude-3-5-sonnet-20241022
    const dateMatch = modelId.match(/(\d{8})/);
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1;
      const day = parseInt(dateStr.substring(6, 8));
      return new Date(year, month, day);
    }
    
    // 尝试提取版本号作为排序依据（用于没有日期的模型）
    const versionMatch = modelId.match(/(\d+\.?\d*)/);
    if (versionMatch) {
      const version = parseFloat(versionMatch[1]);
      // 使用版本号作为年份偏移
      return new Date(2020 + version, 0, 1);
    }
    
    // 如果无法提取日期，返回一个默认日期（较旧的日期）
    return new Date(2020, 0, 1);
  }, []);

  // 按提供商分组并排序模型
  const groupedModels = useMemo(() => {
    const groups = new Map<string, { provider: { id: string; name: string; icon: string }; models: ChatModel[] }>();
    
    // 过滤老旧模型后按提供商分组
    availableModels.forEach(model => {
      // 跳过老旧模型
      if (isOutdatedModel(model.id)) {
        return;
      }
      
      // 搜索过滤：如果有搜索关键词，只显示匹配的模型
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.toLowerCase();
        const modelName = (model.displayName || model.name).toLowerCase();
        const modelId = model.id.toLowerCase();
        
        // 检查模型名称或 ID 是否包含搜索关键词
        if (!modelName.includes(keyword) && !modelId.includes(keyword)) {
          return;
        }
      }
      
      const provider = getProviderByModelName(model.id);
      
      // 跳过"自定义"提供商的模型
      if (provider.id === 'custom') {
        return;
      }
      
      if (!groups.has(provider.id)) {
        groups.set(provider.id, {
          provider,
          models: []
        });
      }
      
      groups.get(provider.id)!.models.push(model);
    });
    
    // 对每个组内的模型按日期排序（最新的在前）
    groups.forEach(group => {
      group.models.sort((a, b) => {
        const dateA = extractModelDate(a.id);
        const dateB = extractModelDate(b.id);
        return dateB.getTime() - dateA.getTime();
      });
    });
    
    // 转换为数组并按提供商名称排序
    return Array.from(groups.values()).sort((a, b) => 
      a.provider.name.localeCompare(b.provider.name)
    );
  }, [availableModels, getProviderByModelName, extractModelDate, isOutdatedModel, searchKeyword]);

  // 切换模型启用状态
  const toggleModelEnabled = useCallback((modelId: string, enabled: boolean) => {
    // 更新本地状态
    setModelEnabledStates(prev => {
      const newMap = new Map(prev);
      newMap.set(modelId, enabled);
      return newMap;
    });
    
    // 更新 availableModels 中的 enabled 状态
    setAvailableModels(prev => prev.map(model => 
      model.id === modelId ? { ...model, enabled } : model
    ));
    
    // 更新 config.chatModels 中的 enabled 状态
    setConfig(prev => ({
      ...prev,
      chatModels: prev.chatModels?.map(model =>
        model.id === modelId ? { ...model, enabled } : model
      )
    }));
    
    // 更新全局服务状态
    setModelEnabled(modelId, enabled);
    
    // 派发事件通知其他组件（AI Panel、编辑器内联聊天）
    window.dispatchEvent(new CustomEvent('model-enabled-changed', {
      detail: {
        modelId,
        enabled
      }
    }));
    
    console.log(`[AIConfigView] 模型 ${modelId} ${enabled ? '启用' : '禁用'}`);
  }, []);

  // 获取可用模型列表
  const fetchModels = useCallback(async (options?: FetchModelsOptions) => {
    const shouldShowToast = options?.showToast === true;
    const requiresApiKey = config.providerId !== 'ollama';

    console.log('[AIConfigView] fetchModels 调用，当前配置', {
      apiKey: config.apiKey ? '已设置' : '未设置',
      apiEndpoint: config.apiEndpoint,
      providerId: config.providerId,
      modelId: config.modelId,
      'modelId类型': typeof config.modelId,
      'modelId长度': config.modelId?.length,
      'modelId是否undefined': config.modelId === undefined,
      'modelId是否空字符串': config.modelId === '',
      currentConfigId: currentConfigId
    });

    if (requiresApiKey && !config.apiKey.trim()) {
      console.warn('[AIConfigView] API Key 未设置，跳过获取模型列表');
      if (shouldShowToast) {
        toastService.error(
          translateText(
            'aiConfigView.validation.requiredFields',
            'Please fill in the following required field(s): {{fields}}',
            {
              fields: translateText('aiConfigView.validation.fields.apiKey', 'API Key'),
            },
          ),
        );
      }
      return;
    }

    // 获取服务商的默认地址
    const fetchProvider = AI_PROVIDERS_LIST.find(p => p.id === config.providerId);
    const effectiveEndpoint = config.apiEndpoint || fetchProvider?.endpoint || '';
    
    if (!effectiveEndpoint) {
      console.warn('[AIConfigView] API 端点未设置且服务商无默认地址，跳过获取模型列表');
      return;
    }

    setLoadingModels(true);
    try {
      // 🔧 修复：使用正确的配置ID，而不是服务商ID
      // 如果是临时配置（新建），则不传ID（避免保存到数据库）
      // 如果是已保存的配置，使用配置ID（以便正确缓存）
      const isTemp = currentConfigId.startsWith('temp-config-');
      const aiConfig: AIProviderConfig = {
        ...(isTemp ? {} : { id: currentConfigId }),
        name: config.name,
        apiKey: config.apiKey,
        apiEndpoint: effectiveEndpoint,
        ...(config.modelId !== undefined && config.modelId !== '' ? { modelId: config.modelId } : {}), // 魔塔社区等需要的模型ID（向后兼容）
        ...(config.models && config.models.length > 0 ? { models: config.models } : {}) // 魔塔社区等的多个模型ID列表
      };

      console.log('[AIConfigView] 设置 AI Provider 的配置:', {
        configId: aiConfig.id,
        providerId: config.providerId,
        modelId: config.modelId,
        apiEndpoint: config.apiEndpoint,
        hasModelId: !!config.modelId,
        isTemp
      });

      // 设置AI服务提供商
      await aiService.setProvider(config.providerId, aiConfig);
      
      // 获取可用模型
      const models = await aiService.refreshAvailableModels();
      
      // 从配置文件获取模型的 capabilities
      const configModels = await getProviderModels(config.providerId);
      
      const mappedChatModels: ChatModel[] = models.map(model => {
        // 查找配置文件中对应模型的 capabilities 和 name
        const configModel = configModels.find(cm => cm.id === model.id);
        // 保留现有的启用状态，如果没有则默认为 false
        const existingEnabled = modelEnabledStates.get(model.id) ?? false;
        return {
          id: model.id,
          name: configModel?.name || model.name,
          displayName: configModel?.name || model.displayName || model.name,
          enabled: existingEnabled,
          capabilities: configModel?.capabilities
        };
      });
      const newChatModels = filterChatModels(mappedChatModels);
      
      console.log('[AIConfigView] 新获取的模型列表:', newChatModels);
      
      // 直接替换模型列表（每个配置只显示当前服务商的模型）
      // 不需要保留其他服务商的模型，因为每个配置是独立的
      setAvailableModels(newChatModels);
      console.log('[AIConfigView] 替换后的模型列表:', newChatModels);
      
      // 替换配置中当前服务商的模型列表
      setConfig(prev => {
        return {
          ...prev,
          chatModels: newChatModels // 直接使用新模型列表
        };
      });
      console.log('[AIConfigView] ✓ 模型已合并到配置列表');

      if (shouldShowToast) {
        if (newChatModels.length > 0) {
          toastService.success(
            translateText('aiConfigView.toasts.localModelsLoaded', 'Loaded {{count}} local model(s).', {
              count: String(newChatModels.length),
            }),
          );
        } else {
          toastService.info(
            translateText(
              'aiConfigView.toasts.localModelsEmpty',
              'No local models were found from the current service address.',
            ),
          );
        }
      }

      // 注意：这里不再自动保存配置，而是等待用户手动点击"保存配置"按钮
      // 这样可以避免：
      // 1. 使用临时ID保存配置导致重复
      // 2. 用户还没确认就已经保存到数据库
      console.log('[AIConfigView] 模型列表已获取，等待用户点击"保存配置"按钮')
    } catch (error) {
      console.error('[AIConfigView] 获取模型列表失败:', error);
      if (shouldShowToast) {
        toastService.error(
          error instanceof Error
            ? error.message
            : translateText(
                'aiConfigView.toasts.localModelsLoadFailed',
                'Failed to load local models.',
              ),
        );
      }
      // 发生错误时，不清空现有模型列表，只记录错误
      // 这样可以保留已加载的模型
    } finally {
      setLoadingModels(false);
    }
  }, [
    config.apiKey,
    config.apiEndpoint,
    config.providerId,
    config.name,
    config.modelId,
    config.models,
    currentConfigId,
    modelEnabledStates,
    translateText,
  ]);

  // 加载配置
  useEffect(() => {
    // 切换配置时，重置测试状态
    setHasTestedConnection(false);
    
    const loadConfig = async () => {
      // 检查是否为临时配置（新建模式）
      if (currentConfigId.startsWith('temp-config-')) {
        console.log('[AIConfigView] 检测到临时配置ID，进入新建模式:', currentConfigId);
        
        // 不自动填写配置名称，让用户自己填写
        setConfig(prev => ({
          ...prev,
          name: ''
        }));
        
        return;
      }

      // 从数据库加载已保存的配置
      try {
        console.log('[AIConfigView] 加载配置，ID:', currentConfigId);
        const loadedConfig = await window.electron?.ipcRenderer.invoke('ai-model:get', currentConfigId);
        
        if (loadedConfig) {
          console.log('[AIConfigView] 从数据库加载的配置:', loadedConfig);
          
          // 加载配置数据
          const persistedChatModels = filterChatModels(loadedConfig.chatModels || []);
          const configData: AIModelConfig = {
            name: loadedConfig.name || '',
            apiKey: loadedConfig.apiKey || '',
            apiEndpoint: loadedConfig.apiEndpoint || '',
            providerId: loadedConfig.providerId || 'openai',
            chatModels: persistedChatModels,
            modelId: loadedConfig.modelId || '',
            models: loadedConfig.models || []
          };
          setConfig(configData);
          // 保存原始配置用于检测未保存更改
          setSavedConfig(configData);

          // 加载已保存的 chatModels 到 availableModels
          if (persistedChatModels.length > 0) {
            console.log('[AIConfigView] 加载已保存的模型列表:', persistedChatModels);
            setAvailableModels(persistedChatModels);
            
            // 恢复模型启用状态
            const enabledStates = new Map<string, boolean>();
            persistedChatModels.forEach((model: ChatModel) => {
              if (model.enabled !== undefined) {
                enabledStates.set(model.id, model.enabled);
                // 同步到全局服务
                setModelEnabled(model.id, model.enabled);
              }
            });
            if (enabledStates.size > 0) {
              setModelEnabledStates(enabledStates);
              console.log('[AIConfigView] 已恢复模型启用状态:', enabledStates.size, '个模型');
            }
          } else {
            setAvailableModels([]);
          }
        } else {
          console.warn('[AIConfigView] 未找到配置，ID:', currentConfigId);
        }
      } catch (error) {
        console.error('[AIConfigView] 加载配置失败:', error);
      }
    };
    
    loadConfig();
  }, [currentConfigId]);

  // 处理提供商变更
  const handleProviderChange = (providerId: string) => {
    const provider = AI_PROVIDERS_LIST.find(p => p.id === providerId);
    if (provider) {
      setConfig(prev => ({
        ...prev,
        providerId,
        apiEndpoint: ''
      }));
      setAvailableModels([]);
      setHasTestedConnection(false); // 切换提供商，需要重新测试
    }
  };

  // 保存配置
  const saveConfig = async () => {
    // 验证配置名称
    if (!config.name.trim()) {
      toastService.error(
        translateText('aiConfigView.validation.configNameRequired', 'Please enter a configuration name.'),
      );
      return;
    }

    // 验证必填项
    const missingFields: string[] = [];
    
    // 所有提供商都需要的基础必填项
    if (config.providerId !== 'ollama' && (!config.apiKey || !config.apiKey.trim())) {
      missingFields.push(translateText('aiConfigView.validation.fields.apiKey', 'API Key'));
    }
    
    // 检查服务商是否有默认地址
    const currentProvider = AI_PROVIDERS_LIST.find(p => p.id === config.providerId);
    const hasDefaultEndpoint = currentProvider?.endpoint && currentProvider.endpoint.trim() !== '';
    
    // 只有没有默认地址的服务商（如自定义）才需要必填 API 地址
    if (!hasDefaultEndpoint && (!config.apiEndpoint || !config.apiEndpoint.trim())) {
      missingFields.push(translateText('aiConfigView.validation.fields.apiEndpoint', 'API Endpoint'));
    }
    
    // 如果有必填项未填写，显示错误并返回
    if (missingFields.length > 0) {
      toastService.error(
        translateText(
          'aiConfigView.validation.requiredFields',
          'Please fill in the following required field(s): {{fields}}',
          { fields: missingFields.join(', ') },
        ),
      );
      return;
    }
    
    // 如果用户没有填写 API 地址，使用服务商的默认地址
    if (!config.apiEndpoint || !config.apiEndpoint.trim()) {
      if (hasDefaultEndpoint) {
        config.apiEndpoint = currentProvider!.endpoint;
      }
    }

    setIsSaving(true);

    try {
      // 生成配置ID（如果是新建配置）
      const finalConfigId = currentConfigId.startsWith('temp-config-') 
        ? crypto.randomUUID() 
        : currentConfigId;
      
      // 检查配置名称是否已存在（编辑模式下排除当前配置ID）
      const excludeId = currentConfigId.startsWith('temp-config-') ? undefined : currentConfigId;
      const nameExists = await window.electron?.ipcRenderer.invoke('ai-model:check-name-exists', config.name.trim(), excludeId);
      if (nameExists) {
        toastService.error(
          translateText(
            'aiConfigView.toasts.duplicateName',
            'A configuration with this name already exists.',
          ),
        );
        setIsSaving(false);
        return;
      }

      // 获取现有配置的创建时间和chatModels（如果是更新操作）
      let existingCreatedAt = Date.now();
      let existingChatModels: Array<{ id: string; name: string; displayName?: string; enabled?: boolean; capabilities?: { thinking?: boolean; tool_calls?: string[] } }> = [];
      if (!currentConfigId.startsWith('temp-config-')) {
        try {
          const existingConfig = await window.electron?.ipcRenderer.invoke('ai-model:get', finalConfigId);
          if (existingConfig) {
            existingCreatedAt = existingConfig.createdAt;
            // 获取现有的chatModels
            if (existingConfig.chatModels && Array.isArray(existingConfig.chatModels)) {
              existingChatModels = filterChatModels(existingConfig.chatModels as ChatModel[]);
            }
          }
        } catch (error) {
          console.warn('[AIConfigView] 获取现有配置失败，使用当前时间:', error);
        }
      }

      // 合并chatModels：使用 availableModels（当前显示的模型列表）作为基础
      // 这样可以确保包含最新的启用状态
      const currentModels = filterChatModels(
        availableModels.length > 0 ? availableModels : (config.chatModels || [])
      );
      const mergedChatModels: Array<{ id: string; name: string; displayName?: string; enabled?: boolean; capabilities?: { thinking?: boolean; tool_calls?: string[] } }> = [];
      
      // 先添加现有配置中的模型（保留不在当前列表中的模型）
      existingChatModels.forEach(existingModel => {
        const inCurrentList = currentModels.some(m => m.id === existingModel.id);
        if (!inCurrentList) {
          // 保留不在当前列表中的模型，但更新其启用状态
          const isEnabled = modelEnabledStates.get(existingModel.id) ?? existingModel.enabled ?? false;
          mergedChatModels.push({
            ...existingModel,
            enabled: isEnabled
          });
        }
      });
      
      // 添加当前列表中的模型（使用最新的启用状态）
      currentModels.forEach((model: ChatModel) => {
        const isEnabled = modelEnabledStates.get(model.id) ?? model.enabled ?? false;
        mergedChatModels.push({
          id: model.id,
          name: model.name,
          displayName: model.displayName,
          enabled: isEnabled,
          capabilities: model.capabilities
        });
      });

      // 准备保存的配置数据
      const configToSave = {
        id: finalConfigId,
        name: config.name.trim(),
        providerId: config.providerId,
        apiKey: config.apiKey,
        apiEndpoint: config.apiEndpoint,
        modelId: config.modelId || undefined,
        models: config.models || undefined,
        chatModels: mergedChatModels,
        createdAt: currentConfigId.startsWith('temp-config-') ? Date.now() : existingCreatedAt,
        updatedAt: Date.now()
      };

      console.log('[AIConfigView] 准备保存配置:', {
        id: configToSave.id,
        name: configToSave.name,
        providerId: configToSave.providerId,
        hasApiKey: !!configToSave.apiKey,
        apiEndpoint: configToSave.apiEndpoint,
        hasModelId: !!configToSave.modelId,
        chatModelsCount: configToSave.chatModels?.length || 0,
        availableModelsCount: availableModels.length,
        chatModels: configToSave.chatModels // 打印完整的 chatModels 数据
      });

      // 准备保存的模型数据
      const modelsToSave = mergedChatModels.map(model => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        configId: finalConfigId,
        providerId: config.providerId,
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }));

      console.log('[AIConfigView] 准备保存的模型数量:', modelsToSave.length);

      // 保存配置到数据库
      console.log('[AIConfigView] 开始调用 IPC 保存配置');
      const savedConfigId = await window.electron?.ipcRenderer.invoke('ai-model:save', {
        config: configToSave,
        models: modelsToSave
      });
      console.log('[AIConfigView] IPC 保存配置返回:', savedConfigId);

      if (savedConfigId) {
        toastService.success(translateText('aiConfigView.toasts.saved', 'Configuration saved.'));
        // 更新当前配置ID
        setCurrentConfigId(savedConfigId);
        // 更新已保存配置状态（用于检测未保存更改）
        setSavedConfig({ ...config });
        // 清除模型缓存，强制 AI Panel 从数据库重新加载
        await clearModelCache();
        // 通知配置已更新（触发 AI Panel 重新加载模型）
        window.dispatchEvent(new CustomEvent('ai-config-updated'));
        window.dispatchEvent(new CustomEvent('models-cache-updated'));
      } else {
        toastService.error(translateText('aiConfigView.toasts.saveFailed', 'Failed to save configuration.'));
      }
    } catch (error) {
      console.error('[AIConfigView] 保存配置失败:', error);
      let errorMessage = error instanceof Error
        ? error.message
        : translateText('aiConfigView.toasts.unknownError', 'Unknown error');
      
      // 从 Electron IPC 错误消息中提取实际错误信息
      // Electron 错误格式可能是: "Error invoking remote method 'ai-model:save': Error: 实际错误消息"
      // 或者: "Error invoking remote method 'ai-model:save': 实际错误消息"
      const ipcErrorPatterns = [
        /Error invoking remote method '[^']+':\s*Error:\s*(.+)/,
        /Error invoking remote method '[^']+':\s*(.+)/,
      ];
      
      for (const pattern of ipcErrorPatterns) {
        const match = errorMessage.match(pattern);
        if (match) {
          errorMessage = match[1].trim();
          break;
        }
      }
      
      // 如果错误信息已经包含完整描述（如"无法开启配置"），直接显示，否则添加"保存失败："前缀
      const displayMessage = errorMessage.includes('无法开启配置') || errorMessage.includes('以下必填项未填写')
        ? errorMessage
        : translateText('aiConfigView.toasts.saveFailedWithReason', 'Failed to save configuration: {{message}}', {
            message: errorMessage,
          });
      toastService.error(displayMessage);
    } finally {
      setIsSaving(false);
    }
  };

  // 测试连接
  const testConnection = async () => {
    console.log('🚀 [AIConfigView] testConnection 函数被调用');
    console.log('[AIConfigView] 当前配置:', config);
    
    // 验证必填项
    const missingFields: string[] = [];
    
    if (config.providerId !== 'ollama' && (!config.apiKey || !config.apiKey.trim())) {
      missingFields.push(translateText('aiConfigView.validation.fields.apiKey', 'API Key'));
    }
    
    // 检查服务商是否有默认地址
    const testProvider = AI_PROVIDERS_LIST.find(p => p.id === config.providerId);
    const testHasDefaultEndpoint = testProvider?.endpoint && testProvider.endpoint.trim() !== '';
    
    // 只有没有默认地址的服务商才需要必填 API 地址
    if (!testHasDefaultEndpoint && (!config.apiEndpoint || !config.apiEndpoint.trim())) {
      missingFields.push(translateText('aiConfigView.validation.fields.apiEndpoint', 'API Endpoint'));
    }
    
    // 根据提供商类型检查额外的必填项
    // Azure OpenAI 需要填写 endpoint
    if (config.providerId === 'azure') {
      if (!config.apiEndpoint || !config.apiEndpoint.trim()) {
        missingFields.push(translateText('aiConfigView.validation.fields.apiEndpoint', 'API Endpoint'));
      }
    }
    
    // 如果有必填项未填写，显示错误并返回
    if (missingFields.length > 0) {
      console.log('[AIConfigView] ❌ 必填项未填写:', missingFields);
      toastService.error(
        translateText(
          'aiConfigView.validation.requiredFields',
          'Please fill in the following required field(s): {{fields}}',
          { fields: missingFields.join(', ') },
        ),
      );
      return;
    }
    
    // 如果用户没有填写 API 地址，使用服务商的默认地址
    const effectiveEndpoint = (config.apiEndpoint && config.apiEndpoint.trim())
      ? config.apiEndpoint
      : (testHasDefaultEndpoint ? testProvider!.endpoint : '');

    console.log('[AIConfigView] ✓ 基本验证通过，开始测试连接...');
    setTestStatus('testing');

    try {
      // 🔧 修复：使用正确的配置ID，而不是服务商ID
      // 如果是临时配置（新建），则不传ID（避免保存到数据库）
      // 如果是已保存的配置，使用配置ID（以便正确缓存）
      const isTemp = currentConfigId.startsWith('temp-config-');

      console.log('[AIConfigView] 测试连接 - 准备配置:', {
        'config.modelId': config.modelId,
        'config.modelId类型': typeof config.modelId,
        'config.modelId长度': config.modelId?.length,
        'modelId是否undefined': config.modelId === undefined,
        'modelId是否空字符串': config.modelId === '',
        '完整config对象': config
      });

      const aiConfig: AIProviderConfig = {
        ...(isTemp ? {} : { id: currentConfigId }),
        name: config.name,
        apiKey: config.apiKey,
        apiEndpoint: effectiveEndpoint,
        ...(config.modelId !== undefined && config.modelId !== '' ? { modelId: config.modelId } : {}), // 魔塔社区等需要的模型ID（向后兼容）
        ...(config.models && config.models.length > 0 ? { models: config.models } : {}) // 魔塔社区等的多个模型ID列表
      };

      console.log('[AIConfigView] 测试连接 - 最终 aiConfig:', {
        configId: aiConfig.id,
        providerId: config.providerId,
        'aiConfig.modelId': aiConfig.modelId,
        'config.modelId': config.modelId,
        apiEndpoint: config.apiEndpoint,
        hasModelId: !!config.modelId,
        'aiConfig完整对象': aiConfig,
        isTemp
      });

      // 设置AI服务提供商
      await aiService.setProvider(config.providerId, aiConfig);
      
      // 测试连接
      const isConnected = await aiService.testConnection();
      
      if (isConnected) {
        setTestStatus('success');
        toastService.success(translateText('aiConfigView.toasts.connectionSuccess', 'Connection successful.'));

        // 标记已测试连接成功
        setHasTestedConnection(true);

        // 连接成功后，将测试用的模型 ID 累加到列表（不重复）
        if (config.modelId) {
          const testModel: ChatModel = {
            id: config.modelId,
            name: config.modelId,
            displayName: config.modelId,
            enabled: false
          };
          setAvailableModels(prev => {
            const exists = prev.some(m => m.id === testModel.id);
            return exists ? prev : [...prev, testModel];
          });
          setConfig(prev => ({
            ...prev,
            chatModels: prev.chatModels?.some(m => m.id === testModel.id)
              ? prev.chatModels
              : [...(prev.chatModels || []), testModel],
            modelId: ''
          }));
        }

        // 清除测试状态
        setTimeout(() => {
          setTestStatus('idle');
        }, 3000);
      } else {
        setTestStatus('error');
        toastService.error(
          translateText(
            'aiConfigView.toasts.connectionFailed',
            'Connection failed: unable to reach the AI service.',
          ),
        );
      }
    } catch (error) {
      console.error('[AIConfigView] 测试连接失败:', error);
      setTestStatus('error');
      
      // 测试连接失败时保留当前模型列表，只重置测试状态
      setHasTestedConnection(false);
      
      // 使用 toast 显示提供商返回的原始错误消息
      toastService.error(
        error instanceof Error
          ? error.message
          : translateText('aiConfigView.toasts.unknownError', 'Unknown error'),
      );
    }
  };

  return (
    <div className="ai-config-view">
      <div className="ai-config-content">
        <div className="panel-header">
          <h1 className="panel-title-main">
            {configIndex !== undefined && config.name
              ? translateText('aiConfigView.header.editTitle', 'Configuration - {{name}}', {
                  name: config.name,
                })
              : translateText('aiConfigView.header.createTitle', 'AI Model Configuration')}
          </h1>
          <p className="panel-description">
            {translateText(
              'aiConfigView.header.description',
              'Configure connection parameters and behavior for AI models.',
            )}
          </p>
        </div>

        <div className="config-form">
          {/* 基本信息 */}
          <div className="form-section">
            <h3>{translateText('aiConfigView.sections.basicInfo', 'Basic Information')}</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>{translateText('aiConfigView.fields.configName', 'Configuration Name')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={config.name}
                  onChange={(e) => {
                    setConfig({ ...config, name: e.target.value });
                  }}
                  placeholder={translateText(
                    'aiConfigView.placeholders.configName',
                    'For example: My GPT-4 Configuration',
                  )}
                />
              </div>

              <div className="form-group">
                <label>{translateText('aiConfigView.fields.provider', 'AI Provider')}</label>
                <DropdownMenu
                  value={config.providerId}
                  onChange={(value) => handleProviderChange(value)}
                  items={AI_PROVIDERS_LIST.map(provider => ({
                    label: provider.name,
                    value: provider.id
                  }))}
                  placeholder={translateText('aiConfigView.placeholders.provider', 'Select an AI provider')}
                />
              </div>
            </div>
          </div>

          {/* API 配置 */}
          <div className="form-section">
            <h3>{translateText('aiConfigView.sections.apiConfig', 'API Configuration')}</h3>
            
            <div className="form-group">
              <label>API Key</label>
              <div className="api-key-input">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  className="form-control"
                  value={config.apiKey}
                  onChange={(e) => {
                    setConfig({ ...config, apiKey: e.target.value });
                    setHasTestedConnection(false); // API Key 变更，需要重新测试
                  }}
                  placeholder={translateText('aiConfigView.placeholders.apiKey', 'Enter your API key')}
                />
                <button
                  type="button"
                  className="btn-toggle-key"
                  onClick={() => setShowApiKey(!showApiKey)}
                  title={showApiKey
                    ? translateText('aiConfigView.actions.hideApiKey', 'Hide')
                    : translateText('aiConfigView.actions.showApiKey', 'Show')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    {showApiKey ? (
                      <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                    ) : (
                      <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                    )}
                  </svg>
                </button>
              </div>
              <p className="form-hint">
                {config.providerId === 'ollama'
                  ? translateText(
                      'aiConfigView.hints.apiKeyOptionalForLocal',
                      'Local Ollama does not require an API key. Leave it empty unless your service has enabled authentication.',
                    )
                  : translateText(
                      'aiConfigView.hints.keepApiKeySafe',
                      'Keep your API key secure and do not share it with others.',
                    )}
              </p>
            </div>

            {/* Azure OpenAI 的 endpoint 提示 */}
            {config.providerId === 'azure' && (
              <div className="form-group">
                <p className="form-hint">
                  {translateText(
                    'aiConfigView.hints.azureEndpoint',
                    'Azure OpenAI requires the full deployment endpoint, for example:',
                  )}
                  <br/>
                  <code>https://&#123;resource&#125;.openai.azure.com/openai/deployments/&#123;deployment&#125;/chat/completions?api-version=2024-02-15-preview</code>
                </p>
              </div>
            )}

            <div className="form-group">
              <label>{translateText('aiConfigView.fields.apiEndpoint', 'API Endpoint')}</label>
              <input
                type="text"
                className="form-control"
                value={config.apiEndpoint}
                onChange={(e) => {
                  setConfig({ ...config, apiEndpoint: e.target.value });
                  setHasTestedConnection(false);
                }}
                placeholder={
                  config.providerId === 'azure'
                    ? 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=...'
                    : config.providerId === 'ollama'
                    ? 'http://localhost:11434/v1/chat/completions'
                    : translateText(
                        'aiConfigView.placeholders.apiEndpointDefault',
                        'Leave empty to use the default endpoint',
                      )
                }
              />
              {config.providerId === 'azure' ? (
                <p className="form-hint">
                  {translateText(
                    'aiConfigView.hints.apiEndpointRequired',
                    'Required. Enter the full API endpoint address.',
                  )}
                </p>
              ) : config.providerId === 'custom' ? (
                <p className="form-hint">
                  {translateText(
                    'aiConfigView.hints.apiEndpointRequired',
                    'Required. Enter the full API endpoint address.',
                  )}
                </p>
              ) : (() => {
                if (!config.apiEndpoint) {
                  return (
                    <p className="form-hint">
                      {translateText(
                        'aiConfigView.hints.apiEndpointOptional',
                        'Optional. Leave empty to use the default endpoint automatically.',
                      )}
                    </p>
                  );
                }
                // 去掉末尾已有的 /v1/... 路径，只保留 base URL
                const trimmedEndpoint = config.apiEndpoint.replace(/\/+$/, '');
                const hasFullEndpoint = trimmedEndpoint.includes('/chat/completions')
                  || trimmedEndpoint.includes('/messages')
                  || trimmedEndpoint.endsWith('/responses');
                const base = trimmedEndpoint.replace(/\/v1(\/.*)?$/, '');
                const previewSuffix = config.providerId === 'anthropic'
                  ? '/v1/messages'
                  : config.providerId === 'openai-response'
                    ? '/v1/responses'
                    : '/v1/chat/completions';
                const previewUrl = hasFullEndpoint
                  ? trimmedEndpoint
                  : `${base}${previewSuffix}`;
                return (
                  <p className="form-hint api-endpoint-preview">
                    {translateText('aiConfigView.hints.apiEndpointPreview', 'Preview: {{url}}', {
                      url: previewUrl,
                    })}
                  </p>
                );
              })()}
            </div>

            <div className="form-group">
              <label>{translateText('aiConfigView.fields.modelId', 'Model ID (Optional)')}</label>
              <input
                type="text"
                className="form-control"
                value={config.modelId || ''}
                onChange={(e) => {
                  setConfig({ ...config, modelId: e.target.value });
                  setHasTestedConnection(false);
                }}
                placeholder={translateText(
                  'aiConfigView.placeholders.modelId',
                  'For example: gpt-5.1, deepseek, gemini-3-pro-preview',
                )}
              />
              <p className="form-hint">
                {translateText(
                  'aiConfigView.hints.modelIdOptional',
                  'Some providers require a model ID before a connection can be established.',
                )}
              </p>
            </div>

            <div className="form-group">
              <div className="model-accordion">
                <div className="accordion-header-static">
                  <span className="accordion-title">
                    {groupedModels.length > 0 ? (
                      translateText(
                        'aiConfigView.models.summary',
                        '{{count}} available model(s) ({{providerCount}} provider(s))',
                        {
                          count: String(groupedModels.reduce((sum, group) => sum + group.models.length, 0)),
                          providerCount: String(groupedModels.length),
                        },
                      )
                    ) : (
                      translateText('aiConfigView.models.listTitle', 'Model List')
                    )}
                  </span>

                  <div className="accordion-tools">
                    {config.providerId === 'ollama' && (
                      <button
                        type="button"
                        className="btn-fetch-local-models"
                        onClick={() => {
                          void fetchModels({ showToast: true });
                        }}
                        disabled={loadingModels}
                      >
                        {loadingModels
                          ? translateText('aiConfigView.actions.fetchingLocalModels', 'Getting Local Models...')
                          : translateText('aiConfigView.actions.fetchLocalModels', 'Get Local Models')}
                      </button>
                    )}

                    <SearchBox
                      value={searchKeyword}
                      onChange={setSearchKeyword}
                      placeholder={translateText('aiConfigView.models.searchPlaceholder', 'Search models...')}
                    />
                  </div>
                </div>
                <div className="accordion-content">
                  {availableModels.length > 0 ? (
                    <>
                      {groupedModels.map((group) => (
                        <div key={group.provider.id} className="provider-group">
                          <div className="provider-header expanded">
                            {group.provider.icon ? (
                              <AIProviderIcon provider={group.provider.icon} size={18} />
                            ) : group.provider.id === 'tool' ? (
                              <Icon name="wrench" size={18} />
                            ) : null}
                            <span className="provider-name">{group.provider.name}</span>
                            <span className="provider-count">({group.models.length})</span>
                          </div>
                          <div className="provider-models">
                            {group.models.map((model) => {
                              const tooltip = getToolModelTooltip(model.id);
                              const isEnabled = modelEnabledStates.get(model.id) === true; // 默认禁用
                              const modelItemContent = (
                                <div
                                  key={model.id}
                                  className={`model-item readonly ${!isEnabled ? 'disabled' : ''}`}
                                >
                                  <span className="model-name">
                                    {model.displayName || model.name}
                                    {model.capabilities?.thinking && <ThinkingIcon size={14} />}
                                  </span>
                                  <div className="model-item-actions">
                                    <Switch
                                      className="model-switch"
                                      checked={isEnabled}
                                      ariaLabel={translateText(
                                        'aiConfigView.modelItem.toggleModel',
                                        'Toggle model {{name}}',
                                        { name: model.displayName || model.name },
                                      )}
                                      onChange={(nextChecked) => toggleModelEnabled(model.id, nextChecked)}
                                    />
                                    <button
                                      type="button"
                                      className="btn-remove-model"
                                      title={translateText('aiConfigView.modelItem.removeModel', 'Remove model')}
                                      onClick={() => {
                                        setAvailableModels(prev => prev.filter(m => m.id !== model.id));
                                        setConfig(prev => ({
                                          ...prev,
                                          chatModels: prev.chatModels?.filter(m => m.id !== model.id)
                                        }));
                                      }}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              );

                              return tooltip ? (
                                <Tooltip key={model.id} content={tooltip}>
                                  {modelItemContent}
                                </Tooltip>
                              ) : (
                                modelItemContent
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="empty-models-hint no-models">
                      {translateText('aiConfigView.models.empty', 'No available models')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 测试状态显示已移至 toast */}

          {/* 操作按钮 */}
          <div className="action-buttons">
            <button
              className="btn-primary"
              onClick={saveConfig}
              disabled={isSaving}
            >
              {isSaving
                ? translateText('aiConfigView.actions.saving', 'Saving...')
                : translateText('aiConfigView.actions.saveConfig', 'Save Configuration')}
            </button>
            <button
              className="btn-secondary"
              onClick={testConnection}
              disabled={testStatus === 'testing'}
            >
              {testStatus === 'testing'
                ? translateText('aiConfigView.actions.testing', 'Testing...')
                : translateText('aiConfigView.actions.testConnection', 'Test Connection')}
            </button>
          </div>

          {/* 使用指南 */}
          <div className="usage-guide">
            <h3>{translateText('aiConfigView.sections.usageGuide', 'Usage Guide')}</h3>
            <ul>
              <li>
                {translateText(
                  'aiConfigView.guide.step1',
                  'Choose the protocol, then fill in the configuration name and API key.',
                )}
              </li>
              <li>
                {translateText(
                  'aiConfigView.guide.step2',
                  'Fill in the model ID and click "Test Connection" to validate the configuration.',
                )}
              </li>
              {config.providerId === 'azure' ? (
                <>
                  <li>{translateText('aiConfigView.guide.azureStep1', 'Azure OpenAI requires the full deployment endpoint address.')}</li>
                  <li>
                    {translateText('aiConfigView.guide.azureStep2Prefix', 'Authenticate with the')} <code>api-key</code>{' '}
                    {translateText('aiConfigView.guide.azureStep2Suffix', 'header. No Bearer prefix is required.')}
                  </li>
                </>
              ) : config.providerId === 'ollama' ? (
                <>
                  <li>
                    {translateText('aiConfigView.guide.ollamaStep1Prefix', 'Ollama runs locally. The default address is')}{' '}
                    <code>http://localhost:11434</code>
                  </li>
                  <li>{translateText('aiConfigView.guide.ollamaStep2', 'No API key is required. Click "Test Connection" to fetch local models.')}</li>
                </>
              ) : config.providerId === 'openai-response' ? (
                <>
                  <li>
                    {translateText('aiConfigView.guide.openaiResponseStep1Prefix', 'OpenAI Response uses the new')}{' '}
                    <code>/v1/responses</code>{' '}
                    {translateText('aiConfigView.guide.openaiResponseStep1Suffix', 'API.')}
                  </li>
                  <li>{translateText('aiConfigView.guide.openaiResponseStep2', 'Supports built-in tools and multi-turn state management.')}</li>
                </>
              ) : config.providerId === 'custom' ? (
                <>
                  <li>{translateText('aiConfigView.guide.customStep1', 'Custom providers require you to enter the API endpoint manually.')}</li>
                  <li>{translateText('aiConfigView.guide.customStep2', 'Supports all services compatible with the OpenAI format, including DeepSeek, Kimi, and Qwen.')}</li>
                </>
              ) : (
                <li>{translateText('aiConfigView.guide.defaultStep', 'After a successful connection test, remember to save the configuration before using it.')}</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
