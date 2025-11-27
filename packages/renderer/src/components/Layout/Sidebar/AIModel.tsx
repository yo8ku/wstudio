/**
 * AI 模型配置组件
 * 支持自定义 API 密钥和 API 地址
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect } from '../../common/CustomSelect';

// 通过主进程代理的 fetch 函数，用于避免 SSL 协议错误
const proxyFetch = async (url: string, options?: RequestInit): Promise<Response> => {
  const electronAPI = window.electronAPI;
  
  // 如果没有 ai.fetch API，回退到普通 fetch
  if (!electronAPI?.ai?.fetch) {
    return fetch(url, options);
  }
  
  try {
    const result = await electronAPI.ai.fetch(url, options);
    
    // 将主进程返回的结果转换为标准 Response 对象
    const response = new Response(result.body, {
      status: result.status,
      statusText: result.statusText,
      headers: new Headers(result.headers)
    });
    
    return response;
  } catch (error) {
    // 如果代理失败，回退到普通 fetch
    console.warn('[AIModel] 代理 fetch 失败，回退到普通 fetch:', error);
    return fetch(url, options);
  }
};

interface ChatModel {
  name: string;
  displayName?: string;
}

interface AIModelConfig {
  name: string;
  apiKey: string;
  apiEndpoint: string;
  model: string;
  temperature: number;
  providerId: string;
  chatModels?: ChatModel[];  // 可选的聊天模型列表
}

interface ModelInfo {
  id: string;
  name: string;
}

interface PresetModel {
  id: string;
  name: string;
  defaultEndpoint: string;
}

// Tooltip 组件，使用 Portal 渲染到 body
const Tooltip: React.FC<{ children: React.ReactNode; content: string }> = ({ children, content }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      });
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'help', display: 'inline-flex' }}
      >
        {children}
      </span>
      {isVisible &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: `${position.top}px`,
              left: `${position.left}px`,
              transform: 'translate(-50%, -100%)',
              backgroundColor: 'var(--vscode-editorHoverWidget-background)',
              color: 'var(--vscode-editorHoverWidget-foreground)',
              border: '1px solid var(--vscode-focusBorder)',
              borderRadius: '3px',
              padding: '8px 12px',
              fontSize: '12px',
              lineHeight: '1.5',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
              pointerEvents: 'none',
              whiteSpace: 'normal',
              maxWidth: '300px',
              textAlign: 'left',
              zIndex: 999999,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
};

export const AIModel: React.FC = () => {
  const [configs, setConfigs] = useState<AIModelConfig[]>([]);
  const [activeConfigIndex, setActiveConfigIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // 预设的 AI 模型提供商
  const presetModels: PresetModel[] = [
    {
      id: 'builtin',
      name: '内置模型',
      defaultEndpoint: ''
    },
    {
      id: 'openai',
      name: 'OpenAI',
      defaultEndpoint: 'https://api.gptsapi.net/v1/chat/completions'
    },
    {
      id: 'anthropic',
      name: 'Anthropic Claude',
      defaultEndpoint: 'https://api.gptsapi.net/v1/messages'
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta'
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      defaultEndpoint: 'https://api.deepseek.com/v1/chat/completions'
    },
    {
      id: 'xai',
      name: 'xAI Grok',
      defaultEndpoint: 'https://api.x.ai/v1/chat/completions'
    },
    {
      id: 'groq',
      name: 'Groq',
      defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions'
    },
    {
      id: 'azure',
      name: 'Azure OpenAI',
      defaultEndpoint: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT/chat/completions?api-version=2024-02-15-preview'
    },
    {
      id: 'custom',
      name: '自定义',
      defaultEndpoint: ''
    }
  ];

  // 动态获取模型列表并自动填充 chatModels
  const fetchAvailableModels = async (providerId: string, apiKey: string, endpoint: string) => {
    // 内置模型：从真实的内置AI获取模型列表
    if (providerId === 'builtin') {
      setIsLoadingModels(true);
      try {
        console.log('[AIModel] 🔍 从内置AI获取真实模型列表...');
        const models = await window.electronAPI?.builtinAI?.getModels();
        
        if (models && models.length > 0) {
          console.log('[AIModel] ✅ 获取到内置AI真实模型:', models);
          setAvailableModels(models);
          
          // 自动填充 chatModels 数组
          const chatModels: ChatModel[] = models.map((modelName: string) => ({
            name: modelName,
            displayName: modelName
          }));
          updateCurrentConfig({ chatModels });
          console.log('[AIModel] 自动填充内置AI模型到配置:', chatModels);
        } else {
          console.log('[AIModel] ⚠️ 内置AI模型列表为空');
          setAvailableModels([]);
        }
      } catch (error) {
        console.error('[AIModel] ❌ 获取内置AI模型列表失败:', error);
        setAvailableModels([]);
      } finally {
        setIsLoadingModels(false);
      }
      return;
    }

    if (!providerId || !apiKey || !endpoint) {
      setAvailableModels([]);
      return;
    }

    setIsLoadingModels(true);
    try {
      let response;
      let models: string[] = [];
      
      if (providerId === 'gemini') {
        // Gemini 获取模型列表
        const listEndpoint = `${endpoint}/models?key=${apiKey}`;
        response = await proxyFetch(listEndpoint);
        
        if (response.ok) {
          const data = await response.json();
          // Gemini 返回的是 models 数组
          models = data.models
            ?.filter((m: any) => m.name?.includes('gemini'))
            .map((m: any) => m.name.replace('models/', '')) || [];
          setAvailableModels(models);
          
          // 自动填充 chatModels 数组
          if (models.length > 0) {
            const chatModels: ChatModel[] = models.map(modelName => ({
              name: modelName,
              displayName: modelName
            }));
            updateCurrentConfig({ chatModels });
            console.log('[AIModel] 自动填充聊天模型:', chatModels);
          }
        }
      } else if (providerId === 'openai') {
        // OpenAI 获取模型列表
        response = await proxyFetch('https://api.gptsapi.net/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          models = data.data
            ?.filter((m: any) => m.id.includes('gpt'))
            .map((m: any) => m.id)
            .sort() || [];
          setAvailableModels(models);
          
          // 自动填充 chatModels 数组
          if (models.length > 0) {
            const chatModels: ChatModel[] = models.map(modelName => ({
              name: modelName,
              displayName: modelName
            }));
            updateCurrentConfig({ chatModels });
          }
        }
      } else if (providerId === 'anthropic') {
        // Anthropic 没有公开的 models API，使用已知模型列表
        models = [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
        setAvailableModels(models);
        
        // 自动填充 chatModels 数组
        const chatModels: ChatModel[] = models.map(modelName => ({
          name: modelName,
          displayName: modelName
        }));
        updateCurrentConfig({ chatModels });
      } else {
        // 其他提供商尝试使用 OpenAI 兼容的 /models 端点
        const baseUrl = endpoint.replace(/\/chat\/completions.*/, '');
        response = await proxyFetch(`${baseUrl}/models`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          models = data.data?.map((m: any) => m.id) || [];
          setAvailableModels(models);
          
          // 自动填充 chatModels 数组
          if (models.length > 0) {
            const chatModels: ChatModel[] = models.map(modelName => ({
              name: modelName,
              displayName: modelName
            }));
            updateCurrentConfig({ chatModels });
          }
        }
      }
    } catch (error) {
      console.error('[AIModel] 获取模型列表失败:', error);
      setAvailableModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  // 从本地存储加载配置
  useEffect(() => {
    const savedConfigs = localStorage.getItem('ai-model-configs');
    if (savedConfigs) {
      try {
        setConfigs(JSON.parse(savedConfigs));
      } catch (error) {
        console.error('加载 AI 配置失败:', error);
      }
    } else {
      // 默认配置
      setConfigs([
        {
          name: '内置模型',
          apiKey: '',
          apiEndpoint: '',
          model: '',
          temperature: 0.7,
          providerId: 'builtin'
        }
      ]);
    }
  }, []);

  const currentConfig = configs[activeConfigIndex];

  // 当切换配置时，重置测试状态和模型列表
  useEffect(() => {
    setTestStatus('idle');
    setTestMessage('');
    setAvailableModels([]);
  }, [activeConfigIndex]);

  const saveConfigs = (newConfigs: AIModelConfig[]) => {
    setConfigs(newConfigs);
    localStorage.setItem('ai-model-configs', JSON.stringify(newConfigs));
  };

  const updateCurrentConfig = (updates: Partial<AIModelConfig>) => {
    const newConfigs = [...configs];
    newConfigs[activeConfigIndex] = { ...currentConfig, ...updates };
    saveConfigs(newConfigs);
  };

  const addNewConfig = () => {
    const newConfig: AIModelConfig = {
      name: `配置 ${configs.length + 1}`,
      apiKey: '',
      apiEndpoint: '',
      model: '',
      temperature: 0.7,
      providerId: ''
    };
    saveConfigs([...configs, newConfig]);
    setActiveConfigIndex(configs.length);
    setIsEditing(true);
  };

  const deleteConfig = (index: number) => {
    if (configs.length === 1) {
      alert('至少需要保留一个配置');
      return;
    }
    const newConfigs = configs.filter((_, i) => i !== index);
    saveConfigs(newConfigs);
    if (activeConfigIndex >= newConfigs.length) {
      setActiveConfigIndex(newConfigs.length - 1);
    }
  };

  const testConnection = async () => {
    if (!currentConfig.apiKey || !currentConfig.apiEndpoint) {
      setTestStatus('error');
      setTestMessage('请先填写 API 密钥和 API 地址');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    try {
      let response;
      
      // Gemini 使用不同的 API 格式
      if (currentConfig.providerId === 'gemini') {
        // Gemini 测试连接：先获取模型列表来验证 API Key
        const baseUrl = currentConfig.apiEndpoint.replace(/\/$/, ''); // 移除末尾的斜杠
        const endpoint = `${baseUrl}/models?key=${currentConfig.apiKey}`;
        
        console.log('[AIModel] Gemini 测试连接（获取模型列表）:', {
          baseUrl,
          endpoint: endpoint.replace(currentConfig.apiKey, 'API_KEY_HIDDEN')
        });
        
        response = await proxyFetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } else if (currentConfig.providerId === 'anthropic') {
        // Claude 使用特殊的 header 格式
        // 如果没有选择模型，使用默认模型进行测试
        const testModel = currentConfig.model || 'claude-3-5-sonnet-20241022';
        response = await proxyFetch(currentConfig.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': currentConfig.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          })
        });
      } else {
        // OpenAI 兼容格式（适用于 OpenAI、DeepSeek、Groq 等）
        // 如果没有选择模型，使用默认模型进行测试
        const testModel = currentConfig.model || 'gpt-3.5-turbo';
        response = await proxyFetch(currentConfig.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentConfig.apiKey}`
          },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 10
          })
        });
      }

      if (response.ok) {
        setTestStatus('success');
        setTestMessage('连接成功！正在获取模型列表...');
        
        // 连接成功后，获取可用模型列表
        await fetchAvailableModels(currentConfig.providerId, currentConfig.apiKey, currentConfig.apiEndpoint);
        
        setTestMessage('连接成功！模型列表已更新。');
      } else {
        const errorText = await response.text();
        setTestStatus('error');
        
        // 尝试解析错误信息
        let errorDetail = '';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error?.message || errorJson.message || '';
        } catch {
          errorDetail = errorText.substring(0, 100);
        }
        
        setTestMessage(`连接失败: ${response.status} - ${errorDetail || response.statusText}`);
        console.error('[AIModel] 连接失败详情:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(`连接失败: ${error instanceof Error ? error.message : '未知错误'}`);
      console.error('[AIModel] 连接异常:', error);
    }

    setTimeout(() => {
      setTestStatus('idle');
      setTestMessage('');
    }, 3000);
  };

  const loadPreset = (presetId: string) => {
    const preset = presetModels.find(p => p.id === presetId);
    if (preset) {
      updateCurrentConfig({
        apiEndpoint: preset.defaultEndpoint,
        model: '',
        providerId: presetId
      });
    }
  };

  // 获取当前提供商的模型列表（使用动态获取的列表）
  const getCurrentProviderModels = () => {
    return availableModels;
  };

  if (!currentConfig) {
    return (
      <div className="ai-model-panel p-4">
        <div className="text-center py-8" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
          没有配置
        </div>
      </div>
    );
  }

  // 打开 settings.json 并定位到 ai.models
  const openSettingsJson = async () => {
    try {
      const result = await window.electronAPI?.settings?.openJson('user');
      if (result?.success && result.data && result.data.content) {
        // 查找 "ai.models" 在文件中的位置
        const content = result.data.content;
        const lines = content.split('\n');
        let targetLine = 0;
        let targetColumn = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = line.match(/"ai\.models"\s*:/);
          if (match) {
            targetLine = i + 1; // Monaco 编辑器行号从 1 开始
            targetColumn = match.index ? match.index + 1 : 1;
            break;
          }
        }
        
        // 触发打开文件事件，带有定位信息
        window.dispatchEvent(new CustomEvent('open-file', {
          detail: {
            path: result.data.path,
            content: result.data.content,
            name: result.data.name,
            language: result.data.language,
            lineNumber: targetLine || 1,
            column: targetColumn || 1
          }
        }));
      } else {
        console.error('打开 settings.json 失败:', result?.error);
      }
    } catch (error) {
      console.error('打开 settings.json 异常:', error);
    }
  };

  return (
    <div className="ai-model-panel p-4 pb-6">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--sidebar-fg)' }}>
            AI 模型配置
          </h2>
          <Tooltip content="在 settings.json 中打开">
            <button
              onClick={openSettingsJson}
              className="p-1 rounded transition-opacity hover:opacity-70"
              style={{ 
                backgroundColor: 'transparent', 
                color: 'var(--sidebar-fg)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
                <path d="M8.7 15.9L4.8 12l3.9-3.9a.984.984 0 0 0 0-1.4a.984.984 0 0 0-1.4 0l-4.59 4.59a.996.996 0 0 0 0 1.41l4.59 4.6c.39.39 1.01.39 1.4 0a.984.984 0 0 0 0-1.4zm6.6 0l3.9-3.9l-3.9-3.9a.984.984 0 0 1 0-1.4a.984.984 0 0 1 1.4 0l4.59 4.59c.39.39.39 1.02 0 1.41l-4.59 4.6a.984.984 0 0 1-1.4 0a.984.984 0 0 1 0-1.4z" fill="currentColor"></path>
              </svg>
            </button>
          </Tooltip>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
          配置 AI 模型的 API 密钥和端点
        </p>
      </div>

      {/* 配置选择器 */}
      <div className="mb-4">
        <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
          当前配置
        </label>
        <div className="flex gap-2">
          <select
            value={activeConfigIndex}
            onChange={(e) => setActiveConfigIndex(Number(e.target.value))}
            className="flex-1 px-3 py-2 rounded focus:outline-none text-sm"
            style={{ 
              backgroundColor: 'var(--input-bg)', 
              color: 'var(--input-fg)', 
              border: '1px solid var(--input-border)'
            }}
          >
            {configs.map((config, index) => (
              <option key={index} value={index}>
                {config.name}
              </option>
            ))}
          </select>
          <button
            onClick={addNewConfig}
            className="px-3 py-2 rounded text-sm transition-colors"
            style={{ 
              backgroundColor: 'var(--button-bg)', 
              color: 'var(--button-fg)'
            }}
            title="添加新配置"
          >
            +
          </button>
        </div>
      </div>

      {/* 配置表单 */}
      <div className="space-y-4">
        {/* 配置名称 */}
        <div>
          <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
            配置名称
          </label>
          <input
            type="text"
            value={currentConfig.name}
            onChange={(e) => updateCurrentConfig({ name: e.target.value })}
            className="w-full px-3 py-2 rounded focus:outline-none text-sm"
            style={{ 
              backgroundColor: 'var(--input-bg)', 
              color: 'var(--input-fg)', 
              border: '1px solid var(--input-border)'
            }}
            placeholder="例如: OpenAI GPT-4"
          />
        </div>

        {/* 预设模板 */}
        <div>
          <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
            快速选择提供商
          </label>
          <select
            value={currentConfig.providerId || 'builtin'}
            onChange={(e) => loadPreset(e.target.value)}
            className="w-full px-3 py-2 rounded focus:outline-none text-sm"
            style={{ 
              backgroundColor: 'var(--input-bg)', 
              color: 'var(--input-fg)', 
              border: '1px solid var(--input-border)'
            }}
          >
            {presetModels.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>

        {/* API 地址 */}
        <div>
          <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
            API 地址
          </label>
          <input
            type="text"
            value={currentConfig.apiEndpoint}
            onChange={(e) => updateCurrentConfig({ apiEndpoint: e.target.value })}
            className="w-full px-3 py-2 rounded focus:outline-none text-sm font-mono"
            style={{ 
              backgroundColor: 'var(--input-bg)', 
              color: 'var(--input-fg)', 
              border: '1px solid var(--input-border)'
            }}
            placeholder="https://api.gptsapi.net/v1/chat/completions"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            完整的 API 端点 URL
          </p>
        </div>

        {/* API 密钥 */}
        <div>
          <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
            API 密钥
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={currentConfig.apiKey}
              onChange={(e) => updateCurrentConfig({ apiKey: e.target.value })}
              className="w-full px-3 py-2 pr-10 rounded focus:outline-none text-sm font-mono"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)', 
                border: '1px solid var(--input-border)'
              }}
              placeholder="sk-..."
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}
              title={showApiKey ? '隐藏' : '显示'}
            >
              {showApiKey ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            您的 API 密钥将安全存储在本地
          </p>
        </div>

        {/* 模型选择 */}
        <div>
          <label className="text-sm block mb-2" style={{ color: 'var(--sidebar-fg)' }}>
            模型选择
            {isLoadingModels && (
              <span className="ml-2 text-xs" style={{ opacity: 0.6 }}>
                (正在加载...)
              </span>
            )}
          </label>
          <CustomSelect
            value={currentConfig.model}
            onChange={(value) => updateCurrentConfig({ model: value })}
            items={getCurrentProviderModels().map(model => ({
              value: model,
              label: model
            }))}
            placeholder={
              isLoadingModels 
                ? "正在加载模型列表..." 
                : currentConfig.providerId 
                  ? (availableModels.length > 0 ? "选择模型..." : "未找到可用模型")
                  : "请先选择提供商"
            }
          />
          {!currentConfig.providerId && (
            <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
              请先使用"快速选择提供商"选择一个 AI 提供商
            </p>
          )}
          {currentConfig.providerId && currentConfig.apiKey && availableModels.length === 0 && !isLoadingModels && (
            <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
              💡 请先点击"测试连接"，成功后将自动加载可用模型列表
            </p>
          )}
          {availableModels.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
              ✅ 已加载 {availableModels.length} 个可用模型
            </p>
          )}
        </div>

        {/* 高级设置 */}
        <div>
          <h3 className="text-xs font-semibold uppercase mb-3" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            高级设置
          </h3>
          
          {/* 温度 */}
          <div>
            <label className="text-sm mb-2 flex items-center gap-1" style={{ color: 'var(--sidebar-fg)' }}>
              <span>温度 (Temperature): {currentConfig.temperature}</span>
              <Tooltip content='调高温度会使得模型的输出更多样性和创新性，反之，降低温度会使输出内容更加遵循指令要求但减少多样性。建议不要与 "Top p" 同时调整。'>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  className="w-4 h-4"
                  style={{ opacity: 0.6 }}
                >
                  <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8z" fill="currentColor"></path>
                </svg>
              </Tooltip>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={currentConfig.temperature}
              onChange={(e) => updateCurrentConfig({ temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={testConnection}
            disabled={testStatus === 'testing'}
            className="flex-1 px-4 py-2 text-sm rounded transition-colors disabled:opacity-50"
            style={{ 
              backgroundColor: 'var(--button-bg)', 
              color: 'var(--button-fg)'
            }}
          >
            {testStatus === 'testing' ? '测试中...' : '测试连接'}
          </button>
          {configs.length > 1 && (
            <button
              onClick={() => deleteConfig(activeConfigIndex)}
              className="px-4 py-2 text-sm rounded transition-colors"
              style={{ 
                backgroundColor: 'var(--input-bg)', 
                color: 'var(--input-fg)',
                border: '1px solid var(--input-border)'
              }}
              title="删除当前配置"
            >
              删除
            </button>
          )}
        </div>

        {/* 测试状态 */}
        {testMessage && (
          <div
            className="p-3 rounded text-sm"
            style={{ 
              backgroundColor: testStatus === 'success' ? 'var(--vscode-testing-iconPassed, rgba(16, 185, 129, 0.2))' :
                               testStatus === 'error' ? 'var(--vscode-testing-iconFailed, rgba(239, 68, 68, 0.2))' :
                               'var(--vscode-inputValidation-infoBorder, rgba(59, 130, 246, 0.2))',
              color: testStatus === 'success' ? 'var(--vscode-testing-iconPassed, #10b981)' :
                     testStatus === 'error' ? 'var(--vscode-testing-iconFailed, #ef4444)' :
                     'var(--sidebar-fg)',
              border: `1px solid ${
                testStatus === 'success' ? 'var(--vscode-testing-iconPassed, rgba(16, 185, 129, 0.3))' :
                testStatus === 'error' ? 'var(--vscode-testing-iconFailed, rgba(239, 68, 68, 0.3))' :
                'var(--vscode-inputValidation-infoBorder, rgba(59, 130, 246, 0.3))'
              }`
            }}
          >
            {testMessage}
            {testStatus === 'error' && (
              <div className="mt-2 text-xs" style={{ opacity: 0.8 }}>
                提示：按 F12 打开控制台查看详细错误信息
              </div>
            )}
          </div>
        )}

        {/* Gemini 特殊提示 */}
        {currentConfig.providerId === 'gemini' && testStatus === 'error' && testMessage.includes('404') && (
          <div className="p-3 rounded text-xs space-y-1" style={{ 
            backgroundColor: 'var(--input-bg)', 
            color: 'var(--sidebar-fg)',
            opacity: 0.9
          }}>
            <div className="font-semibold">🔍 Gemini 404 错误排查：</div>
            <div>1. 确认已配置正确的 API 密钥</div>
            <div>2. 确认已从下拉列表选择模型</div>
            <div>3. API 端点应为：https://generativelanguage.googleapis.com/v1beta</div>
            <div>4. 打开控制台（F12）查看详细日志</div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <h3 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            使用说明
          </h3>
          <ul className="text-xs space-y-1" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
            <li>• 支持 OpenAI、Claude、Gemini、DeepSeek 等 AI 提供商</li>
            <li>• 配置流程：选择提供商 → 填写 API 密钥 → 测试连接 → 选择模型</li>
            <li>• 测试连接成功后，将自动加载可用模型列表</li>
            <li>• API 密钥安全存储在浏览器本地，不会上传到服务器</li>
            <li>• 可以创建多个配置，随时切换使用不同的 AI 模型</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
