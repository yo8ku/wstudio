import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenu } from '../common/DropdownMenu/DropdownMenu';
import { Switch } from '../common/Switch';
import { Icon } from '../Icons/Icon';
import { electronStore } from '../../services/ElectronStoreService';
import type {
  CustomEmbeddingConfig,
  EmbeddingModelConfig,
  EmbeddingProviderConfig,
} from '../../types/electron.d';
import './EmbeddingConfig.scss';

interface WorkspaceVectorProgress {
  status: 'idle' | 'scanning' | 'indexing' | 'paused' | 'completed' | 'error';
  vectorization?: {
    status: 'idle' | 'running' | 'completed';
  };
}

interface EmbeddingConfigState {
  providers: EmbeddingProviderConfig[];
  models: EmbeddingModelConfig[];
  currentModel: EmbeddingModelConfig | null;
  selectedProviderId: string;
  providerEndpoint: string;
  apiKey: string;
  isLoading: boolean;
  isIndexing: boolean;
  isRefreshingModels: boolean;
  isGlobalIndexing: boolean;
  autoIndexEnabled: boolean;
  showApiKey: boolean;
  testResult: { success: boolean; message: string } | null;
  customConfig: CustomEmbeddingConfig;
}

const DEFAULT_CUSTOM_CONFIG: CustomEmbeddingConfig = {
  apiEndpoint: '',
  modelName: '',
  dimensions: 1536,
  maxTokens: 8192,
};

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';

export const EmbeddingConfig: React.FC = () => {
  const { t } = useTranslation();
  const translateText = useCallback((
    key: string,
    defaultValue: string,
    values?: Record<string, string | number>,
  ): string => String(t(key, values ? { defaultValue, ...values } : { defaultValue })), [t]);

  const [state, setState] = useState<EmbeddingConfigState>({
    providers: [],
    models: [],
    currentModel: null,
    selectedProviderId: '',
    providerEndpoint: DEFAULT_OLLAMA_ENDPOINT,
    apiKey: '',
    isLoading: true,
    isIndexing: false,
    isRefreshingModels: false,
    isGlobalIndexing: false,
    autoIndexEnabled: true,
    showApiKey: false,
    testResult: null,
    customConfig: DEFAULT_CUSTOM_CONFIG,
  });

  const saveCustomConfigTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveApiKeyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    const ipcRenderer = window.electron?.ipcRenderer;
    if (!ipcRenderer) {
      return undefined;
    }

    const unsubscribe = ipcRenderer.on(
      'workspace-vector-index:progress',
      (_event: object, progress: WorkspaceVectorProgress) => {
        const isIndexingNow = progress.status === 'scanning'
          || progress.status === 'indexing'
          || progress.vectorization?.status === 'running';

        setState(prev => ({ ...prev, isGlobalIndexing: isIndexingNow }));
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const loadData = useCallback(async (): Promise<void> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      const [
        providersRes,
        modelsRes,
        currentModelRes,
        customConfigRes,
        providerEndpointRes,
        autoIndexEnabledValue,
      ] = await Promise.all([
        embeddingApi.getProviders(),
        embeddingApi.getModels(),
        embeddingApi.getCurrentModel(),
        embeddingApi.getCustomConfig(),
        embeddingApi.getProviderEndpoint('ollama'),
        electronStore.get('embedding-auto-index'),
      ]);

      const providers = providersRes?.success ? providersRes.data || [] : [];
      const models = modelsRes?.success ? modelsRes.data || [] : [];
      const currentModel = currentModelRes?.success ? currentModelRes.data || null : null;
      const selectedProviderId = currentModel?.providerId || (providers[0]?.id || '');
      const customConfig = customConfigRes?.success && customConfigRes.data
        ? customConfigRes.data
        : DEFAULT_CUSTOM_CONFIG;
      const providerEndpoint = providerEndpointRes?.success && providerEndpointRes.data
        ? providerEndpointRes.data
        : DEFAULT_OLLAMA_ENDPOINT;

      let savedApiKey = '';
      if (selectedProviderId) {
        const apiKeyRes = await embeddingApi.getApiKey(selectedProviderId);
        if (apiKeyRes?.success && apiKeyRes.data) {
          savedApiKey = apiKeyRes.data;
        }
      }

      setState(prev => ({
        ...prev,
        providers,
        models,
        currentModel,
        selectedProviderId,
        providerEndpoint,
        apiKey: savedApiKey,
        autoIndexEnabled: (autoIndexEnabledValue ?? true) as boolean,
        customConfig,
        isLoading: false,
      }));
    } catch (error) {
      console.error('[EmbeddingConfig] 加载配置失败:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const getProviderModels = useCallback((providerId: string): EmbeddingModelConfig[] => (
    state.models.filter(model => model.providerId === providerId)
  ), [state.models]);

  const loadOllamaModelsFromEndpoint = useCallback(async (
    endpoint: string,
  ): Promise<{ endpoint: string; models: EmbeddingModelConfig[] }> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      return {
        endpoint: endpoint.trim() || DEFAULT_OLLAMA_ENDPOINT,
        models: state.models,
      };
    }

    await embeddingApi.setProviderEndpoint('ollama', endpoint);

    const [endpointRes, modelsRes] = await Promise.all([
      embeddingApi.getProviderEndpoint('ollama'),
      embeddingApi.getModels(),
    ]);

    return {
      endpoint: endpointRes?.success && endpointRes.data
        ? endpointRes.data
        : (endpoint.trim() || DEFAULT_OLLAMA_ENDPOINT),
      models: modelsRes?.success ? modelsRes.data || [] : state.models,
    };
  }, [state.models]);

  const refreshOllamaModels = useCallback(async (): Promise<void> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      return;
    }

    setState(prev => ({
      ...prev,
      isRefreshingModels: true,
      testResult: null,
    }));

    try {
      const { endpoint, models } = await loadOllamaModelsFromEndpoint(state.providerEndpoint);
      const ollamaModels = models.filter(model => model.providerId === 'ollama');
      const currentOllamaModel = state.currentModel?.providerId === 'ollama'
        ? state.currentModel
        : null;
      const nextCurrentModel = currentOllamaModel
        ? ollamaModels.find(model => model.id === currentOllamaModel.id) || currentOllamaModel
        : (ollamaModels[0] || null);

      if (nextCurrentModel && (!currentOllamaModel || nextCurrentModel.id !== currentOllamaModel.id)) {
        await embeddingApi.setModel(nextCurrentModel.id, 'ollama');
      }

      setState(prev => ({
        ...prev,
        models,
        providerEndpoint: endpoint,
        currentModel: prev.selectedProviderId === 'ollama' ? nextCurrentModel : prev.currentModel,
        isRefreshingModels: false,
        testResult: ollamaModels.length > 0
          ? {
            success: true,
            message: translateText(
              'embeddingConfigPanel.messages.ollamaModelsLoaded',
              'Loaded {{count}} Ollama model(s).',
              { count: ollamaModels.length },
            ),
          }
          : {
            success: false,
            message: translateText(
              'embeddingConfigPanel.messages.ollamaModelsEmpty',
              'No Ollama models were found at the current service address.',
            ),
          },
      }));
    } catch (error) {
      console.error('[EmbeddingConfig] 刷新 Ollama 模型失败:', error);
      setState(prev => ({
        ...prev,
        isRefreshingModels: false,
        testResult: {
          success: false,
          message: translateText(
            'embeddingConfigPanel.messages.ollamaModelsLoadFailed',
            'Failed to load Ollama models from the current service address.',
          ),
        },
      }));
    }
  }, [loadOllamaModelsFromEndpoint, state.currentModel, state.providerEndpoint, translateText]);

  const handleProviderChange = useCallback(async (providerId: string): Promise<void> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      return;
    }

    let savedApiKey = '';
    const apiKeyRes = await embeddingApi.getApiKey(providerId);
    if (apiKeyRes?.success && apiKeyRes.data) {
      savedApiKey = apiKeyRes.data;
    }

    if (providerId === 'custom') {
      await embeddingApi.setModel('custom');
      setState(prev => ({
        ...prev,
        selectedProviderId: providerId,
        apiKey: savedApiKey,
        currentModel: null,
        testResult: null,
      }));
      return;
    }

    let nextModels = state.models;
    let nextProviderEndpoint = state.providerEndpoint;
    if (providerId === 'ollama') {
      const ollamaData = await loadOllamaModelsFromEndpoint(state.providerEndpoint);
      nextModels = ollamaData.models;
      nextProviderEndpoint = ollamaData.endpoint;
    }

    const providerModels = nextModels.filter(model => model.providerId === providerId);
    const nextCurrentModel = providerModels.find(model => model.id === state.currentModel?.id) || providerModels[0] || null;

    if (nextCurrentModel) {
      await embeddingApi.setModel(nextCurrentModel.id, providerId === 'ollama' ? 'ollama' : undefined);
    }

    setState(prev => ({
      ...prev,
      models: nextModels,
      selectedProviderId: providerId,
      providerEndpoint: nextProviderEndpoint,
      apiKey: savedApiKey,
      currentModel: nextCurrentModel,
      testResult: providerId === 'ollama' && providerModels.length === 0
        ? {
          success: false,
          message: translateText(
            'embeddingConfigPanel.messages.ollamaModelsEmpty',
            'No Ollama models were found at the current service address.',
          ),
        }
        : null,
    }));
  }, [loadOllamaModelsFromEndpoint, state.currentModel, state.models, state.providerEndpoint, translateText]);

  const handleModelChange = useCallback(async (modelId: string): Promise<void> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      return;
    }

    try {
      const result = await embeddingApi.setModel(
        modelId,
        state.selectedProviderId === 'ollama' ? 'ollama' : undefined,
      );

      if (result?.success) {
        const model = state.models.find(item => item.id === modelId) || null;
        setState(prev => ({
          ...prev,
          currentModel: model,
          testResult: null,
        }));
      }
    } catch (error) {
      console.error('[EmbeddingConfig] 设置模型失败:', error);
    }
  }, [state.models, state.selectedProviderId]);

  useEffect(() => {
    if (isInitialLoadRef.current || state.selectedProviderId !== 'custom') {
      return undefined;
    }

    if (saveCustomConfigTimerRef.current) {
      clearTimeout(saveCustomConfigTimerRef.current);
    }

    saveCustomConfigTimerRef.current = setTimeout(async () => {
      await window.electron?.cloudEmbedding?.setCustomConfig(state.customConfig);
    }, 500);

    return () => {
      if (saveCustomConfigTimerRef.current) {
        clearTimeout(saveCustomConfigTimerRef.current);
      }
    };
  }, [state.customConfig, state.selectedProviderId]);

  useEffect(() => {
    if (state.isLoading) {
      return undefined;
    }

    const timer = setTimeout(() => {
      isInitialLoadRef.current = false;
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [state.isLoading]);

  useEffect(() => {
    if (isInitialLoadRef.current || !state.selectedProviderId) {
      return undefined;
    }

    if (saveApiKeyTimerRef.current) {
      clearTimeout(saveApiKeyTimerRef.current);
    }

    saveApiKeyTimerRef.current = setTimeout(async () => {
      if (state.selectedProviderId === 'ollama' || state.apiKey.trim()) {
        await window.electron?.cloudEmbedding?.setApiKey(
          state.selectedProviderId,
          state.apiKey.trim(),
        );
      }
    }, 500);

    return () => {
      if (saveApiKeyTimerRef.current) {
        clearTimeout(saveApiKeyTimerRef.current);
      }
    };
  }, [state.apiKey, state.selectedProviderId]);

  const saveCustomConfig = useCallback(async (): Promise<void> => {
    if (state.selectedProviderId === 'custom') {
      await window.electron?.cloudEmbedding?.setCustomConfig(state.customConfig);
    }
  }, [state.customConfig, state.selectedProviderId]);

  const isCustomConfigValid = useCallback((): boolean => {
    if (state.selectedProviderId !== 'custom') {
      return true;
    }
    const { apiEndpoint, modelName, dimensions, maxTokens } = state.customConfig;
    return !!(apiEndpoint.trim() && modelName.trim() && dimensions > 0 && maxTokens > 0);
  }, [state.customConfig, state.selectedProviderId]);

  const handleStartIndexing = useCallback(async (): Promise<void> => {
    const embeddingApi = window.electron?.cloudEmbedding;
    if (!embeddingApi) {
      return;
    }

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

    if (state.selectedProviderId === 'custom') {
      if (!isCustomConfigValid()) {
        setState(prev => ({
          ...prev,
          testResult: {
            success: false,
            message: translateText(
              'embeddingConfigPanel.messages.invalidCustomConfig',
              'Complete the custom configuration first',
            ),
          },
        }));
        return;
      }
      await saveCustomConfig();
    } else {
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

      if (state.selectedProviderId === 'ollama') {
        await embeddingApi.setProviderEndpoint('ollama', state.providerEndpoint);
        await embeddingApi.setModel(state.currentModel.id, 'ollama');
      }
    }

    if (state.selectedProviderId !== 'ollama' && !state.apiKey.trim()) {
      setState(prev => ({
        ...prev,
        testResult: {
          success: false,
          message: translateText('embeddingConfigPanel.messages.enterApiKey', 'Enter an API key first'),
        },
      }));
      return;
    }

    if (state.selectedProviderId !== 'ollama') {
      await embeddingApi.setApiKey(state.selectedProviderId, state.apiKey.trim());
    }

    const workspaceResult = await window.electron?.workspace?.getDir();
    if (!workspaceResult?.success || !workspaceResult.data) {
      setState(prev => ({
        ...prev,
        testResult: {
          success: false,
          message: translateText(
            'embeddingConfigPanel.messages.openWorkspaceFirst',
            'Open a workspace folder first',
          ),
        },
      }));
      return;
    }

    setState(prev => ({ ...prev, isIndexing: true, testResult: null }));

    try {
      const result = await window.electron?.ipcRenderer?.invoke(
        'workspace-vector-index:start',
        workspaceResult.data,
        true,
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
        return;
      }

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
    } catch (error) {
      console.error('[EmbeddingConfig] 启动索引失败:', error);
      setState(prev => ({
        ...prev,
        isIndexing: false,
        testResult: {
          success: false,
          message: translateText(
            'embeddingConfigPanel.messages.indexStartFailed',
            'Failed to start indexing',
          ),
        },
      }));
    }
  }, [
    isCustomConfigValid,
    saveCustomConfig,
    state.apiKey,
    state.currentModel,
    state.providerEndpoint,
    state.selectedProviderId,
    translateText,
  ]);

  const handleAutoIndexToggle = useCallback(async (): Promise<void> => {
    const nextValue = !state.autoIndexEnabled;
    setState(prev => ({ ...prev, autoIndexEnabled: nextValue }));
    await electronStore.set('embedding-auto-index', nextValue);
  }, [state.autoIndexEnabled]);

  const currentProvider = state.providers.find(provider => provider.id === state.selectedProviderId);
  const providerModels = getProviderModels(state.selectedProviderId);
  const showModelInfo = !!state.currentModel && state.selectedProviderId !== 'custom';
  const handleOllamaEndpointCommit = useCallback(() => {
    if (state.selectedProviderId !== 'ollama') {
      return;
    }
    void refreshOllamaModels();
  }, [refreshOllamaModels, state.selectedProviderId]);

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
            ariaLabel={translateText(
              'embeddingConfigPanel.autoIndex.ariaLabel',
              'Toggle automatic indexing',
            )}
            onChange={() => {
              void handleAutoIndexToggle();
            }}
          />
        </div>
      </div>

      <div className="embedding-config__content">
        <div className="embedding-config__row">
          <div className="embedding-config__field embedding-config__field--inline">
            <label className="embedding-config__label">
              {translateText('embeddingConfigPanel.provider.label', 'Provider')}
            </label>
            <DropdownMenu
              value={state.selectedProviderId}
              onChange={value => {
                void handleProviderChange(value);
              }}
              items={state.providers.map(provider => ({
                value: provider.id,
                label: provider.name,
              }))}
              placeholder={translateText(
                'embeddingConfigPanel.provider.placeholder',
                'Select a provider',
              )}
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
                onChange={value => {
                  void handleModelChange(value);
                }}
                groups={[{
                  groupName: currentProvider?.name || translateText(
                    'embeddingConfigPanel.model.groupFallback',
                    'Models',
                  ),
                  items: providerModels.map(model => ({
                    value: model.id,
                    label: model.pricePerMillion === 0
                      ? translateText(
                        'embeddingConfigPanel.model.freeSuffix',
                        '{{name}} (Free)',
                        { name: model.displayName },
                      )
                      : model.displayName,
                  })),
                }]}
                placeholder={translateText(
                  'embeddingConfigPanel.model.placeholder',
                  'Select a model',
                )}
                className="embedding-config__dropdown"
              />
            </div>
          )}
        </div>

        {state.selectedProviderId === 'ollama' && (
          <div className="embedding-config__field">
            <label className="embedding-config__label">
              {translateText('embeddingConfigPanel.ollama.endpointLabel', 'Ollama Service Address')}
            </label>
            <div className="embedding-config__api-key-row">
              <div className="embedding-config__input-wrapper">
                <input
                  type="text"
                  value={state.providerEndpoint}
                  onChange={event => setState(prev => ({
                    ...prev,
                    providerEndpoint: event.target.value,
                    testResult: null,
                  }))}
                  onBlur={handleOllamaEndpointCommit}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleOllamaEndpointCommit();
                    }
                  }}
                  placeholder={translateText(
                    'embeddingConfigPanel.ollama.endpointPlaceholder',
                    'For example: http://127.0.0.1:11434',
                  )}
                  className="embedding-config__input"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div
                className={`embedding-config__action ${state.isRefreshingModels ? 'disabled' : ''}`}
                onClick={state.isRefreshingModels ? undefined : () => {
                  void refreshOllamaModels();
                }}
              >
                {state.isRefreshingModels
                  ? translateText('embeddingConfigPanel.actions.refreshingModels', 'Refreshing...')
                  : translateText('embeddingConfigPanel.actions.refreshModels', 'Refresh Models')}
              </div>
            </div>
            <p className="embedding-config__endpoint-hint">
              {translateText(
                'embeddingConfigPanel.ollama.endpointHint',
                'Enter the Ollama service address. The model list is loaded dynamically from /api/tags.',
              )}
            </p>
          </div>
        )}

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
                onChange={event => setState(prev => ({
                  ...prev,
                  customConfig: { ...prev.customConfig, apiEndpoint: event.target.value },
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
                  onChange={event => setState(prev => ({
                    ...prev,
                    customConfig: { ...prev.customConfig, modelName: event.target.value },
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
                  {translateText(
                    'embeddingConfigPanel.custom.dimensionsLabel',
                    'Vector Dimensions (keep the default if unsure)',
                  )}
                </label>
                <input
                  type="number"
                  value={state.customConfig.dimensions}
                  onChange={event => setState(prev => ({
                    ...prev,
                    customConfig: {
                      ...prev.customConfig,
                      dimensions: parseInt(event.target.value, 10) || 1536,
                    },
                    testResult: null,
                  }))}
                  placeholder="1536"
                  className="embedding-config__input"
                  min={1}
                />
              </div>
              <div className="embedding-config__field embedding-config__field--inline">
                <label className="embedding-config__label">
                  {translateText(
                    'embeddingConfigPanel.custom.maxTokensLabel',
                    'Max Tokens (keep the default if unsure)',
                  )}
                </label>
                <input
                  type="number"
                  value={state.customConfig.maxTokens}
                  onChange={event => setState(prev => ({
                    ...prev,
                    customConfig: {
                      ...prev.customConfig,
                      maxTokens: parseInt(event.target.value, 10) || 8192,
                    },
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

        {showModelInfo && (
          <div className="embedding-config__model-info">
            {state.currentModel && state.currentModel.dimensions > 0 && (
              <span>
                {translateText('embeddingConfigPanel.modelInfo.dimensions', 'Dimensions: {{count}}', {
                  count: state.currentModel.dimensions,
                })}
              </span>
            )}
            {state.currentModel && state.currentModel.maxTokens > 0 && (
              <span>
                {translateText('embeddingConfigPanel.modelInfo.maxTokens', 'Max Tokens: {{count}}', {
                  count: state.currentModel.maxTokens,
                })}
              </span>
            )}
            {state.currentModel?.description && (
              <span>{state.currentModel.description}</span>
            )}
          </div>
        )}

        <div className="embedding-config__field">
          <label className="embedding-config__label">
            {translateText('embeddingConfigPanel.apiKey.label', 'API Key')}
            {state.selectedProviderId === 'ollama' && (
              <span className="embedding-config__label-hint">
                {translateText(
                  'embeddingConfigPanel.apiKey.ollamaHint',
                  '(can be left empty for local runtime)',
                )}
              </span>
            )}
          </label>
          <div className="embedding-config__api-key-row">
            <div className="embedding-config__input-wrapper">
              <input
                type={state.showApiKey ? 'text' : 'password'}
                value={state.apiKey}
                onChange={event => setState(prev => ({
                  ...prev,
                  apiKey: event.target.value,
                  testResult: null,
                }))}
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
                onClick={() => setState(prev => ({
                  ...prev,
                  showApiKey: !prev.showApiKey,
                }))}
                title={state.showApiKey
                  ? translateText('embeddingConfigPanel.apiKey.hide', 'Hide')
                  : translateText('embeddingConfigPanel.apiKey.show', 'Show')}
              >
                <Icon iconSet="ui" name={state.showApiKey ? 'eye' : 'eye-off'} size={16} />
              </span>
            </div>
            <div
              className={`embedding-config__action embedding-config__action--primary ${
                state.isIndexing
                || state.isGlobalIndexing
                || state.isRefreshingModels
                || !state.selectedProviderId
                || (state.selectedProviderId !== 'ollama' && !state.apiKey.trim())
                || (state.selectedProviderId === 'custom'
                  ? !isCustomConfigValid()
                  : !state.currentModel)
                  ? 'disabled'
                  : ''
              }`}
              onClick={
                state.isIndexing
                || state.isGlobalIndexing
                || state.isRefreshingModels
                || !state.selectedProviderId
                || (state.selectedProviderId !== 'ollama' && !state.apiKey.trim())
                || (state.selectedProviderId === 'custom'
                  ? !isCustomConfigValid()
                  : !state.currentModel)
                  ? undefined
                  : () => {
                    void handleStartIndexing();
                  }
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

        {state.testResult && (
          <div className={`embedding-config__result ${state.testResult.success ? 'success' : 'error'}`}>
            {state.testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmbeddingConfig;
