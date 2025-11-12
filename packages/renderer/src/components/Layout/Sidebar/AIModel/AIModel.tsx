/**
 * AI 模型配置组件 - AI 模型配置侧边栏
 * 显示配置列表，点击配置项在标签页中打开详情
 */

import React, { useState, useEffect } from 'react';
import { updateModelCacheFromConfig } from '../../../../services/ModelCacheService';
import { Icon } from '../../../Icons/Icon';
import './AIModel.scss';

interface ChatModel {
  id: string;
  name: string;
  displayName?: string;
}

interface AIModelStorageConfig {
  id: string;
  name: string;
  providerId: string;
  apiKey: string;
  apiEndpoint: string;
  temperature?: number;
  maxTokens?: number;
  chatModels?: ChatModel[];
  isEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface AIModelStorageModel {
  id: string;
  name: string;
  displayName?: string;
  providerId: string;
  apiEndpoint: string;
  apiKey: string;
  createdAt: number;
  updatedAt: number;
}

export const AIModel: React.FC = () => {
  const [configs, setConfigs] = useState<AIModelStorageConfig[]>([]);
  const [activeConfigIndex, setActiveConfigIndex] = useState<number | null>(null);

  // 从 SQLite 加载配置
  useEffect(() => {
    const loadConfigs = async () => {
      try {

        const savedConfigs = await window.electron?.ipcRenderer.invoke('ai-model:list');
        console.log('[AIModel] 从 SQLite 加载配置:', savedConfigs);
        console.log('[AIModel] 配置数量:', savedConfigs?.length);
        console.log('[AIModel] 配置ID列表:', savedConfigs?.map((c: any) => ({ id: c.id, name: c.name })));
        
        if (savedConfigs && savedConfigs.length > 0) {
          console.log('[AIModel] 解析后的配置:', savedConfigs);
          setConfigs(savedConfigs as AIModelStorageConfig[]);
          // 加载配置后更新模型缓存
          await updateModelCacheFromConfig();
        } else {
          // 首次启动，没有配置，保持空数据
          console.log('[AIModel] 首次启动，暂无配置');
          setConfigs([]);
        }
      } catch (error) {
        console.error('[AIModel] 加载 AI 配置失败:', error);
      }
    };
    
    loadConfigs();
  }, []);

  // 监听配置更新事件（当在标签页中修改配置后）
  useEffect(() => {
    const handleConfigUpdate = async () => {
      try {
        console.log('[AIModel] 🎯 收到 ai-config-updated 事件！开始重新加载配置列表...');
        const savedConfigs = await window.electron?.ipcRenderer.invoke('ai-model:list');
        console.log('[AIModel] ✅ 重新加载的配置列表:', savedConfigs);
        console.log('[AIModel] 📋 配置详情:', savedConfigs?.map((c: any) => ({ id: c.id, name: c.name, providerId: c.providerId })));
        
        // 检查是否有重复配置
        if (savedConfigs && savedConfigs.length > 0) {
          const uniqueIds = new Set(savedConfigs.map((c: any) => c.id));
          if (uniqueIds.size !== savedConfigs.length) {
            console.error('[AIModel] ⚠️ [事件更新] 检测到ID重复的配置！');
          }
        }
        
        // 无论配置列表是否为空，都要更新状态
        console.log('[AIModel] 🔄 开始更新侧边栏状态...');
        setConfigs((savedConfigs || []) as AIModelStorageConfig[]);
        console.log('[AIModel] ✨ 侧边栏配置列表已更新，新的配置数量:', savedConfigs?.length || 0);
        
        // 配置更新后更新模型缓存
        try {
          await updateModelCacheFromConfig();
          console.log('[AIModel] ✅ 模型缓存已更新');
        } catch (cacheError) {
          console.error('[AIModel] ⚠️ 模型缓存更新失败:', cacheError);
        }
      } catch (error) {
        console.error('[AIModel] ❌ 重新加载配置失败:', error);
      }
    };

    console.log('[AIModel] 🔧 注册 ai-config-updated 事件监听器');
    window.addEventListener('ai-config-updated', handleConfigUpdate);
    return () => {
      console.log('[AIModel] 🗑️ 移除 ai-config-updated 事件监听器');
      window.removeEventListener('ai-config-updated', handleConfigUpdate);
    };
  }, []);

  // 监听 AI 配置标签页打开事件，更新选中状态
  useEffect(() => {
    const handleConfigOpened = (event: Event) => {
      const customEvent = event as CustomEvent<{ configIndex?: number }>;
      const configIndex = customEvent?.detail?.configIndex;
      
      if (configIndex !== undefined) {
        setActiveConfigIndex(configIndex);
        console.log('[AIModel] 配置已打开，索引:', configIndex);
      }
    };

    // 监听 AI 配置标签页关闭事件，清除选中状态
    const handleConfigTabClosed = () => {
      setActiveConfigIndex(null);
      console.log('[AIModel] 配置标签页已关闭，清除选中状态');
    };

    window.addEventListener('open-ai-config', handleConfigOpened as EventListener);
    window.addEventListener('ai-config-tab-closed', handleConfigTabClosed);
    
    return () => {
      window.removeEventListener('open-ai-config', handleConfigOpened as EventListener);
      window.removeEventListener('ai-config-tab-closed', handleConfigTabClosed);
    };
  }, []);

  // 添加新配置（创建临时配置，不保存到数据库）
  const addNewConfig = () => {
    const now = Date.now();
    
    // 生成UUID 
     
    const tempConfigId = `temp-config-${now}`;
    
    console.log('[AIModel] 创建临时配置:', tempConfigId);
    
    // 直接打开新配置的标签页（使用临时ID）
    // 标签页会创建一个新的空配置表单
    openConfigInTab(tempConfigId, undefined);
    
    console.log('[AIModel] ✓ 临时配置标签页已打开');
  };

  // 在标签页中打开配置
  const openConfigInTab = (configId: string, configIndex?: number) => {
    window.dispatchEvent(new CustomEvent('open-ai-config', {
      detail: { configId, configIndex }
    }));
  };

  // 获取提供商显示名称
  const getProviderDisplayName = (providerId: string): string => {
    const providerNames: Record<string, string> = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'gemini': 'Google Gemini',
      'deepseek': 'DeepSeek',
      'xai': 'xAI Grok',
      'groq': 'Groq',
      'azure': 'Azure OpenAI',
      'custom': '自定义'
    };
    return providerNames[providerId] || '未知';
  };

  // 删除配置
  const deleteConfig = async (configId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // 阻止事件冒泡，避免触发打开配置
    
    try {
      console.log('[AIModel] 删除配置:', configId);
      
      await window.electron?.ipcRenderer.invoke('ai-model:delete', configId);
      
      console.log('[AIModel] 配置已从数据库删除');
      
      // 只更新本地状态，不触发全局更新事件
      const updatedConfigs = configs.filter(c => c.id !== configId);
      setConfigs(updatedConfigs);
      
      console.log('[AIModel] 本地状态已更新，剩余配置数量:', updatedConfigs.length);
      
      // 更新模型缓存
      await updateModelCacheFromConfig();
      
      console.log('[AIModel] ✓ 配置删除完成');
    } catch (error) {
      console.error('[AIModel] ❌ 删除配置失败:', error);
    }
  };



  return (
    <div className="sidebar-content ai-model-sidebar">
      {/* 顶部操作栏 */}
      <div className="ai-model-header">
        <h3 className="ai-model-title">AI 模型配置 ({configs.length})</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            className="btn-add-config" 
            onClick={addNewConfig}
            title="添加新配置"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3.5a.5.5 0 0 1 .5.5v3.5H12a.5.5 0 0 1 0 1H8.5V12a.5.5 0 0 1-1 0V8.5H4a.5.5 0 0 1 0-1h3.5V4a.5.5 0 0 1 .5-.5z"/>
            </svg>
          </button>
        </div>
      </div>

      {configs.length === 0 ? (
        <div className="empty-state">
          <p>暂无配置</p>
        </div>
      ) : (
        <div className="config-list">
          {configs.map((config, index) => (
            <div
              key={config.id}
              className={`config-item ${activeConfigIndex === index ? 'active' : ''} ${config.isEnabled === false ? 'disabled' : ''}`}
              onClick={() => openConfigInTab(config.id, index)}
            >
              <div className="config-info">
                <div className="config-name">
                  {config.name}
                  {config.isEnabled === false && (
                    <span className="config-status-badge disabled">已禁用</span>
                  )}
                </div>
                <div className="config-provider">
                  {getProviderDisplayName(config.providerId)}
                </div>
              </div>
              <button 
                className="btn-delete-config"
                onClick={(e) => deleteConfig(config.id, e)}
                title="删除配置"
              >
                <Icon name="delete" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
