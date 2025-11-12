/**
 * 背景图片设置面板 (渲染进程)
 * 提供可视化的设置界面
 */

import React, { useState, useEffect } from 'react';
import { useBackgroundStore } from '../../stores/backgroundStore';
import './styles.css';

interface BackgroundConfig {
  imagePath: string;
  opacity: number;
  blur: number;
  fit: 'cover' | 'contain' | 'fill' | 'none';
  enabled: boolean;
}

interface BackgroundImageSettingsProps {
  visible: boolean;
  onClose: () => void;
}

export const BackgroundImageSettings: React.FC<BackgroundImageSettingsProps> = ({
  visible,
  onClose
}) => {
  // 使用全局状态实现实时预览
  const { config, setConfig: setGlobalConfig } = useBackgroundStore();
  
  // 本地状态用于临时编辑
  const [localConfig, setLocalConfig] = useState<BackgroundConfig>(config);

  // 当面板打开时，同步全局配置到本地状态
  useEffect(() => {
    if (visible) {
      console.log('[BackgroundImageSettings] 面板打开，同步配置', config);
      setLocalConfig(config);
    }
  }, [visible, config]);

  // 调试：监听visible 变化
  useEffect(() => {
    console.log('[BackgroundImageSettings] 🟢 visible 状态变量', visible);
  }, [visible]);

  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用');
      return;
    }

    console.log('[BackgroundImageSettings] 开始监听事件');

    // 监听主进程发送的设置面板显示事件
    const handleShowSettings = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] ========== 收到显示设置面板事件 ==========');
      console.log('[BackgroundImageSettings] event:', event);
      console.log('[BackgroundImageSettings] args:', args);
      const initialConfig = args[0]; // event 已单独提取，数据是第一个参数
      if (initialConfig) {
        setLocalConfig(initialConfig);
        setGlobalConfig(initialConfig);
      }
    };

    // 监听图片选择结果
    const handleImageSelected = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] 收到图片选择结果:', args);
      const imagePath = args[0];
      const newConfig = { ...localConfig, imagePath };
      setLocalConfig(newConfig);
      setGlobalConfig(newConfig);
    };

    // 监听配置更新结果
    const handleConfigUpdated = (event: any, ...args: any[]) => {
      console.log('[BackgroundImageSettings] 配置已更新', args);
      const updatedConfig = args[0];
      setLocalConfig(updatedConfig);
      setGlobalConfig(updatedConfig);
    };

    ipcRenderer.on('background-image:show-settings', handleShowSettings);
    ipcRenderer.on('background-image:image-selected', handleImageSelected);
    ipcRenderer.on('background-image:config-updated', handleConfigUpdated);

    return () => {
      console.log('[BackgroundImageSettings] 移除事件监听');
      ipcRenderer.removeListener('background-image:show-settings', handleShowSettings);
      ipcRenderer.removeListener('background-image:image-selected', handleImageSelected);
      ipcRenderer.removeListener('background-image:config-updated', handleConfigUpdated);
    };
  }, [localConfig]);

  const handleBrowse = () => {
    console.log('[BackgroundImageSettings] ========== 浏览按钮被点击==========');
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    console.log('[BackgroundImageSettings] ipcRenderer 可用:', !!ipcRenderer);
    console.log('[BackgroundImageSettings] window.electron:', (window as any).electron);
    
    if (ipcRenderer) {
      console.log('[BackgroundImageSettings] 正在发布background-image:browse-image 事件');
      ipcRenderer.send('background-image:browse-image');
      console.log('[BackgroundImageSettings] 事件已发布');
    } else {
      console.error('[BackgroundImageSettings] ipcRenderer 不可用！');
    }
  };

  const handleApply = () => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (ipcRenderer) {
      console.log('[BackgroundImageSettings] 应用设置并保存', localConfig);
      // 持久化保存到 electron-store
      ipcRenderer.send('background-image:update-config', localConfig);
      onClose();
    }
  };

  const handleReset = () => {
    const resetConfig: BackgroundConfig = {
      imagePath: '',
      opacity: 0.3,
      blur: 0,
      fit: 'cover',
      enabled: false
    };
    setLocalConfig(resetConfig);
    setGlobalConfig(resetConfig);
  };

  // 实时更新配置的辅助函数
  const updateConfigRealtime = (updates: Partial<BackgroundConfig>) => {
    const newConfig = { ...localConfig, ...updates };
    setLocalConfig(newConfig);
    setGlobalConfig(newConfig); // 实时同步到全局状态
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  console.log('[BackgroundImageSettings] 渲染组件，visible =', visible);
  
  if (!visible) {
    console.log('[BackgroundImageSettings] visible=false，不渲染面板');
    return null;
  }
  
  console.log('[BackgroundImageSettings] visible=true，渲染面板');

  return (
    <div 
      className="background-image-panel" 
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
        {/* 标题栏*/}
        <div className="bg-panel-header">
          <h2>背景图片设置</h2>
          <button 
            className="bg-close-btn" 
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 图片选择 */}
        <div className="bg-setting-group">
          <label className="bg-label">背景图片路径</label>
          <div className="bg-input-group">
            <input
              type="text"
              value={localConfig.imagePath}
              onChange={(e) => updateConfigRealtime({ imagePath: e.target.value })}
              placeholder="输入图片路径或URL"
              className="bg-input"
            />
            <button onClick={handleBrowse} className="bg-button bg-button-secondary">
              浏览
            </button>
          </div>
        </div>

        {/* 透明- 实时预览 */}
        <div className="bg-setting-group">
          <label className="bg-label">
            透明 <span className="bg-value">{localConfig.opacity.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={localConfig.opacity}
            onChange={(e) => updateConfigRealtime({ opacity: parseFloat(e.target.value) })}
            className="bg-slider"
          />
        </div>

        {/* 模糊- 实时预览 */}
        <div className="bg-setting-group">
          <label className="bg-label">
            模糊 <span className="bg-value">{localConfig.blur}px</span>
          </label>
          <input
            type="range"
            min="0"
            max="20"
            step="1"
            value={localConfig.blur}
            onChange={(e) => updateConfigRealtime({ blur: parseInt(e.target.value) })}
            className="bg-slider"
          />
        </div>

        {/* 缩放模式 - 实时预览 */}
        <div className="bg-setting-group">
          <label className="bg-label">缩放模式</label>
          <select
            value={localConfig.fit}
            onChange={(e) => updateConfigRealtime({ fit: e.target.value as any })}
            className="bg-select"
          >
            <option value="cover">覆盖 (Cover)</option>
            <option value="contain">包含 (Contain)</option>
            <option value="fill">填充 (Fill)</option>
            <option value="none">原始大小 (None)</option>
          </select>
        </div>

        {/* 启用开发- 实时预览 */}
        <div className="bg-setting-group">
          <label className="bg-checkbox-label">
            <input
              type="checkbox"
              checked={localConfig.enabled}
              onChange={(e) => updateConfigRealtime({ enabled: e.target.checked })}
              className="bg-checkbox"
            />
            <span>启用背景图片</span>
          </label>
        </div>

        {/* 按钮*/}
        <div className="bg-button-group">
          <button onClick={handleReset} className="bg-button bg-button-secondary">
            重置
          </button>
          <button onClick={handleApply} className="bg-button bg-button-primary">
            应用
          </button>
        </div>
      </div>
  );
};

