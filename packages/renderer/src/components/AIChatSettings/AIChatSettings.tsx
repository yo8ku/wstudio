/**
 * AI聊天设置组件
 * 功能：配置AI对话的参数（温度、最大token数等）
 */

import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../Icons/Icon';
import './AIChatSettings.scss';

// 搜索引擎类型
export type SearchEngine = 'google' | 'baidu' | 'bing' | 'yandex' | 'yahoo' | 'aol';

// 搜索引擎配置
export const SEARCH_ENGINES: Record<SearchEngine, { name: string; displayName: string }> = {
  google: { name: 'Google', displayName: 'Google' },
  baidu: { name: 'Baidu', displayName: 'Baidu' },
  bing: { name: 'Bing', displayName: 'Bing' },
  yandex: { name: 'Yandex', displayName: 'Yandex' },
  yahoo: { name: 'Yahoo', displayName: 'Yahoo' },
  aol: { name: 'AOL', displayName: 'AOL' }
};

export interface AIChatSettingsConfig {
  temperature: number;      // 温度参数 (0-2)
  maxTokens: number;        // 最大token数
  topP: number;             // Top P 采样参数 (0-1)
  presencePenalty: number;  // 存在惩罚 (-2 to 2)
  frequencyPenalty: number; // 频率惩罚 (-2 to 2)
  searchEngine: SearchEngine; // 联网搜索引擎
  thinkingBudget: number;   // Gemini 思考预算（深度思考 token 数）
}

interface AIChatSettingsProps {
  visible: boolean;
  onClose: () => void;
  config: AIChatSettingsConfig;
  onConfigChange: (config: AIChatSettingsConfig) => void;
}

// 默认配置
export const DEFAULT_CHAT_SETTINGS: AIChatSettingsConfig = {
  temperature: 0.7,
  maxTokens: 8192, // ✅ 增加默认值，避免响应被截断
  topP: 1.0,
  presencePenalty: 0,
  frequencyPenalty: 0,
  searchEngine: 'google',
  thinkingBudget: 8192 // ✅ Gemini 思考预算默认值
};

export const AIChatSettings: React.FC<AIChatSettingsProps> = ({
  visible,
  onClose,
  config,
  onConfigChange
}) => {
  const [localConfig, setLocalConfig] = useState<AIChatSettingsConfig>(config);
  const [isSearchEngineMenuOpen, setIsSearchEngineMenuOpen] = useState(false);
  const searchEngineMenuRef = useRef<HTMLDivElement>(null);

  // 同步外部配置变化
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // 点击外部关闭搜索引擎菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchEngineMenuRef.current && !searchEngineMenuRef.current.contains(event.target as Node)) {
        setIsSearchEngineMenuOpen(false);
      }
    };

    if (isSearchEngineMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSearchEngineMenuOpen]);

  // 更新配置（实时预览）
  const updateConfig = (updates: Partial<AIChatSettingsConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  // 处理搜索引擎选择
  const handleSearchEngineSelect = (engine: SearchEngine) => {
    updateConfig({ searchEngine: engine });
    setIsSearchEngineMenuOpen(false);
  };

  // 重置为默认值
  const handleReset = () => {
    setLocalConfig(DEFAULT_CHAT_SETTINGS);
    onConfigChange(DEFAULT_CHAT_SETTINGS);
  };

  // ESC键关闭
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <div 
      className="ai-chat-settings-panel"
      onKeyDown={handleKeyDown}
    >
      {/* 设置内容 */}
      <div className="settings-content">
        {/* 搜索引擎选择 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">
              <Icon name="network" size={14} />
              联网搜索引擎
            </label>
            <div className="search-engine-selector">
              <button
                className="search-engine-button"
                onClick={() => setIsSearchEngineMenuOpen(!isSearchEngineMenuOpen)}
              >
                <Icon name={localConfig.searchEngine} size={10} />
                <span>{SEARCH_ENGINES[localConfig.searchEngine].displayName}</span>
                <Icon name="chevron-down" size={12} className="dropdown-icon" />
              </button>
              
              {isSearchEngineMenuOpen && (
                <div ref={searchEngineMenuRef} className="search-engine-menu menu">
                  {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((engine) => (
                    <div
                      key={engine}
                      className={`search-engine-menu-item menu-item ${localConfig.searchEngine === engine ? 'selected' : ''}`}
                      onClick={() => handleSearchEngineSelect(engine)}
                    >
                      <div className="menu-item-content">
                        <Icon name={engine} size={14} />
                        <span>{SEARCH_ENGINES[engine].displayName}</span>
                      </div>
                      {localConfig.searchEngine === engine && (
                        <Icon name="check" size={14} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="setting-description">
            选择AI联网搜索时使用的搜索引擎。不同的搜索引擎可能返回不同的结果。
          </p>
        </div>

        {/* Temperature 温度 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Temperature (温度)</label>
            <span className="setting-value">{localConfig.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={localConfig.temperature}
            onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            控制输出的随机性。较低的值使输出更确定，较高的值使输出更随机和创造性。
          </p>
        </div>

        {/* Max Tokens 最大token数 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Max Tokens (最大令牌数)</label>
            <span className="setting-value">{localConfig.maxTokens}</span>
          </div>
          <input
            type="range"
            min="512"
            max="32768"
            step="512"
            value={localConfig.maxTokens}
            onChange={(e) => updateConfig({ maxTokens: parseInt(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            生成响应的最大token数。较大的值允许更长的响应，但会消耗更多资源。Gemini 模型建议 8192-16384 tokens。
          </p>
        </div>

        {/* Thinking Budget 思考预算 (Gemini) */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Thinking Budget (思考预算)</label>
            <span className="setting-value">{localConfig.thinkingBudget}</span>
          </div>
          <input
            type="range"
            min="1024"
            max="32768"
            step="1024"
            value={localConfig.thinkingBudget}
            onChange={(e) => updateConfig({ thinkingBudget: parseInt(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            Gemini 深度思考模式的 token 预算。控制模型在生成回答前的思考深度。建议 8192-16384 tokens。
          </p>
        </div>

        {/* Top P 采样 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Top P (核采样)</label>
            <span className="setting-value">{localConfig.topP.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localConfig.topP}
            onChange={(e) => updateConfig({ topP: parseFloat(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            核采样参数。值为1.0表示考虑所有可能的token，较低的值使输出更集中。
          </p>
        </div>

        {/* Presence Penalty 存在惩罚 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Presence Penalty (存在惩罚)</label>
            <span className="setting-value">{localConfig.presencePenalty.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="-2"
            max="2"
            step="0.1"
            value={localConfig.presencePenalty}
            onChange={(e) => updateConfig({ presencePenalty: parseFloat(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            鼓励模型谈论新话题。正值增加新话题的可能性，负值使模型更倾向重复。
          </p>
        </div>

        {/* Frequency Penalty 频率惩罚 */}
        <div className="setting-group">
          <div className="setting-label-row">
            <label className="setting-label">Frequency Penalty (频率惩罚)</label>
            <span className="setting-value">{localConfig.frequencyPenalty.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="-2"
            max="2"
            step="0.1"
            value={localConfig.frequencyPenalty}
            onChange={(e) => updateConfig({ frequencyPenalty: parseFloat(e.target.value) })}
            className="setting-slider"
          />
          <p className="setting-description">
            减少重复的词语。正值降低重复频率，负值允许更多重复。
          </p>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="settings-footer">
        <button 
          className="settings-btn settings-btn-secondary"
          onClick={handleReset}
        >
          <Icon name="refresh" size={14} />
          重置为默认值
        </button>
        <button 
          className="settings-btn settings-btn-primary"
          onClick={onClose}
        >
          完成
        </button>
      </div>
    </div>
  );
};

