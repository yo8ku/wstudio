/**
 * Embedding 配置组件
 * 功能：配置云端 Embedding API（服务商选择、API Key 设置、模型选择）
 * 描述：支持多个服务商的 Embedding 模型配置和连接测试
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DropdownMenu } from '../common/DropdownMenu/DropdownMenu';
import { useTranslation } from 'react-i18next';
import { Switch } from '../common/Switch';
import { Icon } from '../Icons/Icon';
import { electronStore } from '../../services/ElectronStoreService';
import type {
  EmbeddingProviderConfig,
  EmbeddingModelConfig,
  CustomEmbeddingConfig,
} from '../../types/electron.d';
import './EmbeddingConfig.scss';

/** 组件状态接口 */
interface EmbeddingConfigState {
  providers: EmbeddingProviderConfig[];
  models: EmbeddingModelConfig[];
  currentModel: EmbeddingModelConfig | null;
  selectedProviderId: string;
  apiKey: string;
  isLoading: boolean;
  isIndexing: boolean;
  isGlobalIndexing: boolean; // 全局索引状态（从主进程获取）
  autoIndexEnabled: boolean;
  showApiKey: boolean;
  testResult: { success: boolean; message: string } | null;
  customConfig: CustomEmbeddingConfig;
}

export const EmbeddingConfig: React.FC = () => {
  const { t } = useTranslation();
  const translateText = (
    key: string,
    defaultValue: string,
    values?: Record<string, string | number>,
  ): string => String(t(key, values ? { defaultValue, ...values } : { defaultValue }));
  const [state, setState] = useState<EmbeddingConfigState>({
    providers: [],
    models: [],
    currentModel: null,
    selectedProviderId: '',
    apiKey: '',
    isLoading: true,
    isIndexing: false,
    isGlobalIndexing: false,
    autoIndexEnabled: true,
    showApiKey: false,
    testResult: null,
    customConfig: {
      apiEndpoint: '',
      modelName: '',
      dimensions: 1536,
      maxTokens: 8192,
    },
  });

  // 监听全局索引进度
  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) return;

    const unsubscribe = ipcRenderer.on('workspace-vector-index:progress', (_event: unknown, progress: {
      status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
      vectorization?: {
        status: 'idle' | 'running' | 'completed';
      };
    }) => {
      // 检查是否正在索引（扫描中、索引中、或向量化运行中）
      const isIndexingNow = progress.status === 'scanning' || 
                           progress.status === 'indexing' || 
                           progress.vectorization?.status === 'running';
      
      setState(prev => ({ ...prev, isGlobalIndexing: isIndexingNow }));
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 加载配置数据
  const loadData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const [providersRes, modelsRes, currentModelRes, customConfigRes] = await Promise.all([
        window.electron?.cloudEmbedding?.getProviders(),
        window.electron?.cloudEmbedding?.getModels(),
        window.electron?.cloudEmbedding?.getCurrentModel(),
        window.electron?.cloudEmbedding?.getCustomConfig(),
      ]);

      const providers = providersRes?.success ? providersRes.data || [] : [];
      const models = modelsRes?.success ? modelsRes.data || [] : [];
      const currentModel = currentModelRes?.success ? currentModelRes.data || null : null;
      const customConfig = customConfigRes?.success && customConfigRes.data ? customConfigRes.data : {
        apiEndpoint: '',
        modelName: '',
        dimensions: 1536,
        maxTokens: 8192,
      };

      // 确定当前选中的服务商
      const selectedProviderId = currentModel?.providerId || (providers[0]?.id || '');

      // 获取已保存的 API Key
      let savedApiKey = '';
      if (selectedProviderId) {
        const apiKeyRes = await window.electron?.cloudEmbedding?.getApiKey(selectedProviderId);
        if (apiKeyRes?.success && apiKeyRes.data) {
          savedApiKey = apiKeyRes.data;
        }
      }

      // 获取自动索引设置
      const autoIndexEnabled = await electronStore.get('embedding-auto-index') ?? true;

      setState(prev => ({
        ...prev,
        providers,
        models,
        currentModel,
        selectedProviderId,
        apiKey: savedApiKey,
        autoIndexEnabled: autoIndexEnabled as boolean,
        customConfig,
        isLoading: false,
      }));
    } catch (error) {
      console.error('[EmbeddingConfig] 加载配置失败:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 获取当前服务商的模型列表
  const getProviderModels = useCallback((): EmbeddingModelConfig[] => {
    return state.models.filter(m => m.providerId === state.selectedProviderId);
  }, [state.models, state.selectedProviderId]);

  // 处理服务商切换
  const handleProviderChange = useCallback(async (providerId: string) => {
    // 获取该服务商已保存的 API Key
    let savedApiKey = '';
    const apiKeyRes = await window.electron?.cloudEmbedding?.getApiKey(providerId);
    if (apiKeyRes?.success && apiKeyRes.data) {
      savedApiKey = apiKeyRes.data;
    }

    // 自定义服务商特殊处理
    if (providerId === 'custom') {
      await window.electron?.cloudEmbedding?.setModel('custom');
      setState(prev => ({
        ...prev,
        selectedProviderId: providerId,
        apiKey: savedApiKey,
        currentModel: null,
        testResult: null,
      }));
      return;
    }

    // 获取该服务商的第一个模型并自动选择
    const providerModels = state.models.filter(m => m.providerId === providerId);
    const firstModel = providerModels[0] || null;

    // 如果有模型，自动设置为当前模型
    if (firstModel) {
      await window.electron?.cloudEmbedding?.setModel(firstModel.id);
    }

    setState(prev => ({
      ...prev,
      selectedProviderId: providerId,
      apiKey: savedApiKey,
      currentModel: firstModel,
      testResult: null,
    }));
  }, [state.models]);

  // 处理模型切换
  const handleModelChange = useCallback(async (modelId: string) => {
    try {
      const result = await window.electron?.cloudEmbedding?.setModel(modelId);
      if (result?.success) {
        const model = state.models.find(m => m.id === modelId) || null;
        setState(prev => ({
          ...prev,
          currentModel: model,
          testResult: null,
        }));
      }
    } catch (error) {
      console.error('[EmbeddingConfig] 设置模型失败:', error);
    }
  }, [state.models]);

  // 防抖保存自定义配置的定时器
  const saveCustomConfigTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 标记是否已完成初始加载（避免加载时触发保存）
  const isInitialLoadRef = useRef(true);

  // 自动保存自定义配置（防抖 500ms）
  useEffect(() => {
    // 跳过初始加载
    if (isInitialLoadRef.current) {
      return;
    }

    // 只在选择自定义服务商时保存
    if (state.selectedProviderId !== 'custom') {
      return;
    }

    // 清除之前的定时器
    if (saveCustomConfigTimerRef.current) {
      clearTimeout(saveCustomConfigTimerRef.current);
    }

    // 防抖保存
    saveCustomConfigTimerRef.current = setTimeout(async () => {
      await window.electron?.cloudEmbedding?.setCustomConfig(state.customConfig);
      console.log('[EmbeddingConfig] 自定义配置已自动保存');
    }, 500);

    return () => {
      if (saveCustomConfigTimerRef.current) {
        clearTimeout(saveCustomConfigTimerRef.current);
      }
    };
  }, [state.customConfig, state.selectedProviderId]);

  // 初始加载完成后设置标记
  useEffect(() => {
    if (!state.isLoading) {
      // 延迟设置，确保初始状态已完全加载
      const timer = setTimeout(() => {
        isInitialLoadRef.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [state.isLoading]);

  // 防抖保存 API Key 的定时器
  const saveApiKeyTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 自动保存 API Key（防抖 500ms）
  useEffect(() => {
    // 跳过初始加载
    if (isInitialLoadRef.current) {
      return;
    }

    // 没有选择服务商时不保存
    if (!state.selectedProviderId) {
      return;
    }

    // 清除之前的定时器
    if (saveApiKeyTimerRef.current) {
      clearTimeout(saveApiKeyTimerRef.current);
    }

    // 防抖保存（Ollama 可以保存空值，其他服务商需要有值才保存）
    saveApiKeyTimerRef.current = setTimeout(async () => {
      if (state.selectedProviderId === 'ollama' || state.apiKey.trim()) {
        await window.electron?.cloudEmbedding?.setApiKey(
          state.selectedProviderId,
          state.apiKey.trim()
        );
        console.log('[EmbeddingConfig] API Key 已自动保存');
      }
    }, 500);

    return () => {
      if (saveApiKeyTimerRef.current) {
        clearTimeout(saveApiKeyTimerRef.current);
      }
    };
  }, [state.apiKey, state.selectedProviderId]);

  // 保存自定义配置（手动调用，用于立即索引前）
  const saveCustomConfig = useCallback(async () => {
    if (state.selectedProviderId === 'custom') {
      await window.electron?.cloudEmbedding?.setCustomConfig(state.customConfig);
    }
  }, [state.selectedProviderId, state.customConfig]);

  // 检查自定义配置是否有效
  const isCustomConfigValid = useCallback((): boolean => {
    if (state.selectedProviderId !== 'custom') return true;
    const { apiEndpoint, modelName, dimensions, maxTokens } = state.customConfig;
    return !!(apiEndpoint.trim() && modelName.trim() && dimensions > 0 && maxTokens > 0);
  }, [state.selectedProviderId, state.customConfig]);

  // 立即索引
  const handleStartIndexing = useCallback(async () => {
    // 检查是否选择了服务商
    if (!state.selectedProviderId) {
      setState(prev => ({
        ...prev,
        testResult: {
          success: false,
          message: translateText('embeddingConfigPanel.messages.selectProvider', 'Select a provider first'),
        },
      }));
      return;
    }

    // 自定义服务商检查
    if (state.selectedProviderId === 'custom') {
      if (!isCustomConfigValid()) {
        setState(prev => ({
          ...prev,
          testResult: {
            success: false,
            message: translateText('embeddingConfigPanel.messages.invalidCustomConfig', 'Complete the custom configuration first'),
          },
        }));
        return;
      }
      // 保存自定义配置
      await saveCustomConfig();
    } else {
      // 检查是否选择了模型
      if (!state.currentModel) {
        setState(prev => ({
          ...prev,
          testResult: {
            success: false,
            message: translateText('embeddingConfigPanel.messages.selectModel', 'Select a model first'),
          },
        }));
        return;
      }
    }

    // Ollama 不需要 API Key，其他服务商需要检查
    if (state.selectedProviderId !== 'ollama') {
      // 检查是否输入了 API Key
      if (!state.apiKey.trim()) {
        setState(prev => ({
          ...prev,
          testResult: {
            success: false,
            message: translateText('embeddingConfigPanel.messages.enterApiKey', 'Enter an API key first'),
          },
        }));
        return;
      }

      // 先保存 API Key
      await window.electron?.cloudEmbedding?.setApiKey(
        state.selectedProviderId,
        state.apiKey.trim()
      );
    }

    // 获取工作区路径
    const workspaceResult = await window.electron?.workspace?.getDir();
    if (!workspaceResult?.success || !workspaceResult.data) {
      setState(prev => ({
        ...prev,
        testResult: {
          success: false,
          message: translateText('embeddingConfigPanel.messages.openWorkspaceFirst', 'Open a workspace folder first'),
        },
      }));
      return;
    }

    setState(prev => ({ ...prev, isIndexing: true, testResult: null }));

    try {
      // 强制重新索引（用户手动点击"立即索引"时，总是重新索引所有文件）
      const result = await window.electron?.ipcRenderer?.invoke(
        'workspace-vector-index:start',
        workspaceResult.data,
        true // forceReindex: 强制重新索引
      );

      if (result?.success) {
        setState(prev => ({
          ...prev,
          isIndexing: false,
          testResult: {
            success: true,
            message: translateText(
              'embeddingConfigPanel.messages.indexStarted',
              'The indexing task has started. Check the status bar for progress and API errors.',
            ),
          },
        }));
      } else {
        setState(prev => ({
          ...prev,
          isIndexing: false,
          testResult: {
            success: false,
            message: result?.error || translateText(
              'embeddingConfigPanel.messages.indexStartFailed',
              'Failed to start indexing',
            ),
          },
        }));
      }
    } catch (error) {
      console.error('[EmbeddingConfig] 启动索引失败:', error);
      setState(prev => ({
        ...prev,
        isIndexing: false,
        testResult: {
          success: false,
          message: translateText('embeddingConfigPanel.messages.indexStartFailed', 'Failed to start indexing'),
        },
      }));
    }
  }, [isCustomConfigValid, saveCustomConfig, state.apiKey, state.currentModel, state.selectedProviderId, translateText]);

  // 切换自动索引
  const handleAutoIndexToggle = useCallback(async () => {
    const newValue = !state.autoIndexEnabled;
    setState(prev => ({ ...prev, autoIndexEnabled: newValue }));
    await electronStore.set('embedding-auto-index', newValue);
  }, [state.autoIndexEnabled]);

  // 获取当前服务商信息
  const currentProvider = state.providers.find(p => p.id === state.selectedProviderId);
  const providerModels = getProviderModels();

  if (state.isLoading) {
    return (
      <div className="embedding-config">
        <div className="embedding-config__loading">
          {translateText('embeddingConfigPanel.loading', 'Loading...')}
        </div>
      </div>
    );
  }

  return (
    <div className="embedding-config">
      <div className="embedding-config__header">
        <div className="embedding-config__header-left">
          <h3 className="embedding-config__title">
            {translateText(
              'workbenchSettings.categories.embeddingConfig.title',
              'Embedding Configuration',
            )}
          </h3>
          <p className="embedding-config__description">
            {translateText(
              'embeddingConfigPanel.description',
              'Configure the cloud embedding API used for fast file indexing. When automatic indexing is enabled, new files are indexed on startup.',
            )}
          </p>
        </div>
        <div className="embedding-config__header-right">
          <span className="embedding-config__auto-index-label">
            {translateText('embeddingConfigPanel.autoIndex.label', 'Enable Automatic Indexing')}
          </span>
          <Switch
            className="embedding-config__switch"
            checked={state.autoIndexEnabled}
            ariaLabel={translateText('embeddingConfigPanel.autoIndex.ariaLabel', 'Toggle automatic indexing')}
            onChange={() => {
              void handleAutoIndexToggle();
            }}
          />
        </div>
      </div>

      <div className="embedding-config__content">
        {/* 服务商和模型选择 - 横向排列 */}
        <div className="embedding-config__row">
          <div className="embedding-config__field embedding-config__field--inline">
            <label className="embedding-config__label">
              {translateText('embeddingConfigPanel.provider.label', 'Provider')}
            </label>
            <DropdownMenu
              value={state.selectedProviderId}
              onChange={handleProviderChange}
              items={state.providers.map(provider => ({
                value: provider.id,
                label: provider.name,
              }))}
              placeholder={translateText('embeddingConfigPanel.provider.placeholder', 'Select a provider')}
              className="embedding-config__dropdown"
            />
          </div>

          {state.selectedProviderId !== 'custom' && (
            <div className="embedding-config__field embedding-config__field--model">
              <label className="embedding-config__label">
                {translateText('embeddingConfigPanel.model.label', 'Model')}
              </label>
              <DropdownMenu
                value={state.currentModel?.id || ''}
                onChange={handleModelChange}
                groups={[{
                  groupName: currentProvider?.name || translateText('embeddingConfigPanel.model.groupFallback', 'Models'),
                  items: providerModels.map(model => ({
                    value: model.id,
                    label: model.pricePerMillion === 0
                      ? translateText('embeddingConfigPanel.model.freeSuffix', '{{name}} (Free)', {
                        name: model.displayName,
                      })
                      : model.displayName,
                  })),
                }]}
                placeholder={translateText('embeddingConfigPanel.model.placeholder', 'Select a model')}
                className="embedding-config__dropdown"
              />
            </div>
          )}
        </div>

        {/* 自定义配置 */}
        {state.selectedProviderId === 'custom' && (
          <div className="embedding-config__custom-section">
            <div className="embedding-config__field">
              <label className="embedding-config__label">
                {translateText(
                  'embeddingConfigPanel.custom.apiEndpointLabel',
                  'API Endpoint (include the full path, for example /v1/embeddings)',
                )}
              </label>
              <input
                type="text"
                value={state.customConfig.apiEndpoint}
                onChange={e => setState(prev => ({
                  ...prev,
                  customConfig: { ...prev.customConfig, apiEndpoint: e.target.value },
                  testResult: null,
                }))}
                placeholder="https://api.example.com/v1/embeddings"
                className="embedding-config__input"
              />
            </div>
            <div className="embedding-config__row">
              <div className="embedding-config__field embedding-config__field--inline">
                <label className="embedding-config__label">
                  {translateText('embeddingConfigPanel.custom.modelNameLabel', 'Model Name')}
                </label>
                <input
                  type="text"
                  value={state.customConfig.modelName}
                  onChange={e => setState(prev => ({
                    ...prev,
                    customConfig: { ...prev.customConfig, modelName: e.target.value },
                    testResult: null,
                  }))}
                  placeholder="text-embedding-3-small"
                  className="embedding-config__input"
                />
              </div>
            </div>
            <div className="embedding-config__row">
              <div className="embedding-config__field embedding-config__field--inline">
                <label className="embedding-config__label">
                  {translateText('embeddingConfigPanel.custom.dimensionsLabel', 'Vector Dimensions (keep the default if unsure)')}
                </label>
                <input
                  type="number"
                  value={state.customConfig.dimensions}
                  onChange={e => setState(prev => ({
                    ...prev,
                    customConfig: { ...prev.customConfig, dimensions: parseInt(e.target.value) || 1536 },
                    testResult: null,
                  }))}
                  placeholder="1536"
                  className="embedding-config__input"
                  min={1}
                />
              </div>
              <div className="embedding-config__field embedding-config__field--inline">
                <label className="embedding-config__label">
                  {translateText('embeddingConfigPanel.custom.maxTokensLabel', 'Max Tokens (keep the default if unsure)')}
                </label>
                <input
                  type="number"
                  value={state.customConfig.maxTokens}
                  onChange={e => setState(prev => ({
                    ...prev,
                    customConfig: { ...prev.customConfig, maxTokens: parseInt(e.target.value) || 8192 },
                    testResult: null,
                  }))}
                  placeholder="8192"
                  className="embedding-config__input"
                  min={1}
                />
              </div>
            </div>
          </div>
        )}

        {/* 模型信息 */}
        {state.currentModel && state.selectedProviderId !== 'custom' && (
          <div className="embedding-config__model-info">
            <span>
              {translateText('embeddingConfigPanel.modelInfo.dimensions', 'Dimensions: {{count}}', {
                count: state.currentModel.dimensions,
              })}
            </span>
            <span>
              {translateText('embeddingConfigPanel.modelInfo.maxTokens', 'Max Tokens: {{count}}', {
                count: state.currentModel.maxTokens,
              })}
            </span>
            {state.currentModel.description && (
              <span>{state.currentModel.description}</span>
            )}
          </div>
        )}

        {/* API Key 输入 - Ollama 可选，其他服务商必填 */}
        <div className="embedding-config__field">
          <label className="embedding-config__label">
            {translateText('embeddingConfigPanel.apiKey.label', 'API Key')}
            {state.selectedProviderId === 'ollama' && (
              <span className="embedding-config__label-hint">
                {translateText('embeddingConfigPanel.apiKey.ollamaHint', '(can be left empty for local runtime)')}
              </span>
            )}
          </label>
          <div className="embedding-config__api-key-row">
            <div className="embedding-config__input-wrapper">
              <input
                type={state.showApiKey ? 'text' : 'password'}
                value={state.apiKey}
                onChange={e => setState(prev => ({ ...prev, apiKey: e.target.value, testResult: null }))}
                placeholder={state.selectedProviderId === 'ollama'
                  ? translateText(
                    'embeddingConfigPanel.apiKey.placeholderLocal',
                    'Can be left empty for local runtime; cloud providers require a key',
                  )
                  : translateText(
                    'embeddingConfigPanel.apiKey.placeholderProvider',
                    'Enter the {{provider}} API key',
                    { provider: currentProvider?.name || '' },
                  )}
                className="embedding-config__input"
                autoComplete="off"
                spellCheck={false}
              />
              <span
                className="embedding-config__eye-icon"
                onClick={() => setState(prev => ({ ...prev, showApiKey: !prev.showApiKey }))}
                title={state.showApiKey
                  ? translateText('embeddingConfigPanel.apiKey.hide', 'Hide')
                  : translateText('embeddingConfigPanel.apiKey.show', 'Show')}
              >
                <Icon iconSet="ui" name={state.showApiKey ? 'eye' : 'eye-off'} size={16} />
              </span>
            </div>
            <div
              className={`embedding-config__action embedding-config__action--primary ${
                state.isIndexing || state.isGlobalIndexing || !state.selectedProviderId ||
                (state.selectedProviderId !== 'ollama' && !state.apiKey.trim()) ||
                (state.selectedProviderId === 'custom' ? !isCustomConfigValid() : !state.currentModel)
                  ? 'disabled' : ''
              }`}
              onClick={
                state.isIndexing || state.isGlobalIndexing || !state.selectedProviderId ||
                (state.selectedProviderId !== 'ollama' && !state.apiKey.trim()) ||
                (state.selectedProviderId === 'custom' ? !isCustomConfigValid() : !state.currentModel)
                  ? undefined : handleStartIndexing
              }
            >
              {state.isIndexing || state.isGlobalIndexing
                ? translateText('embeddingConfigPanel.actions.indexing', 'Indexing...')
                : translateText('embeddingConfigPanel.actions.indexNow', 'Index Now')}
            </div>
          </div>
          {currentProvider?.apiKeyUrl && state.selectedProviderId !== 'ollama' && (
            <span
              className="embedding-config__api-key-link"
              onClick={() => window.electron?.shell?.openExternal(currentProvider.apiKeyUrl)}
            >
              {translateText('embeddingConfigPanel.apiKey.getKey', 'Get {{provider}} Key', {
                provider: currentProvider.name,
              })}
            </span>
          )}
        </div>

        {/* 结果提示 */}
        {state.testResult && (
          <div
            className={`embedding-config__result ${
              state.testResult.success ? 'success' : 'error'
            }`}
          >
            {state.testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmbeddingConfig;
