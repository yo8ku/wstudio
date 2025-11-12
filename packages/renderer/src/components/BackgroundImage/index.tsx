/**
 * 背景图片渲染组件
 * 监听配置更新并应用背景图片到界面
 */

import React, { useEffect } from 'react';
import { useBackgroundStore } from '../../stores/backgroundStore';

export const BackgroundImage: React.FC = () => {
  // 立即执行的日志，确认组件是否被调试  
  // 使用 Zustand store
  const { config, setConfig } = useBackgroundStore();


  useEffect(() => {
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (!ipcRenderer) {
      console.error('[BackgroundImage] ipcRenderer 不可用');
      return;
    }

    // 监听配置更新事件
    const handleConfigUpdated = (event: any, ...args: any[]) => {
      // 配置数据应该是第一个参数（因为 event 已经单独提取了）
      const updatedConfig = args[0];
      if (updatedConfig) {
        console.log('[BackgroundImage] 应用新配置', updatedConfig);
        setConfig(updatedConfig);
      } else {
        console.log('[BackgroundImage]  没有收到有效的配置数据');
      }
    };

    // 监听保存到settings.json的事件
    const handleSaveToSettings = async (event: any, ...args: any[]) => {
      console.log('[BackgroundImage] ========== 收到保存到settings的请求==========');
      const bgConfig = args[0];
      if (!bgConfig) return;
      
      try {
        // 以插件命名空间格式保存到settings.json
        const settingsValue = {
          imagePath: bgConfig.imagePath,
          opacity: bgConfig.opacity,
          blur: bgConfig.blur,
          fit: bgConfig.fit,
          enabled: bgConfig.enabled,
        };
        
        await window.electronAPI?.settings?.update?.('background-image', settingsValue);
        console.log('[BackgroundImage] 背景配置已保存到 settings.json');
      } catch (error) {
        console.error('[BackgroundImage] 保存到settings失败:', error);
      }
    };

    
    ipcRenderer.on('background-image:config-updated', handleConfigUpdated);
    ipcRenderer.on('background-image:save-to-settings', handleSaveToSettings);

    // 组件挂载后，请求当前配置
    ipcRenderer.send('background-image:renderer-ready');

    return () => {
      console.log('[BackgroundImage] 移除配置更新监听');
      ipcRenderer.removeListener('background-image:config-updated', handleConfigUpdated);
      ipcRenderer.removeListener('background-image:save-to-settings', handleSaveToSettings);
    };
  }, []);

  // 当配置变化时，更新body类名以控制透明背景
  useEffect(() => {

    if (!config.enabled || !config.imagePath) {
      document.body.classList.remove('background-image-enabled');
      return;
    }

    // 添加类名，让 CSS body 背景设置为透明（使用!important 防止主题覆盖）
    document.body.classList.add('background-image-enabled');
    
    // 清理函数：组件卸载时移除类名
    return () => {
      document.body.classList.remove('background-image-enabled');
    };
  }, [config]);

  // 监听主题切换事件，确保背景透明度在主题切换后仍然有效
  useEffect(() => {
    const handleThemeChange = () => {
      // 如果背景启用，重新确认body 类名存在
      if (config.enabled && config.imagePath) {
        document.body.classList.add('background-image-enabled');
      }
    };

    // 监听主题切换事件
    const ipcRenderer = (window as any).electron?.ipcRenderer;
    if (ipcRenderer) {
      ipcRenderer.on('theme:theme-changed', handleThemeChange);
    }

    return () => {
      if (ipcRenderer) {
        ipcRenderer.removeListener('theme:theme-changed', handleThemeChange);
      }
    };
  }, [config.enabled, config.imagePath]);

  // 如果背景未启用或没有图片路径，不渲染背景层（但组件本身仍然挂载以监听事件）
  if (!config.enabled || !config.imagePath) {
    return null;
  }

  // 使用绝对定位创建背景层，z-index 设为 99（在最底层级）
  // 透明度和模糊效果直接应用于背景层
  const backgroundStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 99, // 背景在最底层，不遮挡UI元素
    pointerEvents: 'none',
    backgroundImage: `url("${config.imagePath}")`, // imagePath 已由 BackgroundManager 转换local-file:// 协议
    backgroundSize: config.fit,
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: config.opacity,
    filter: config.blur > 0 ? `blur(${config.blur}px)` : 'none',
  };
  return (
    <div 
      id="background-image-layer" 
      style={backgroundStyle}
      data-background-enabled="true"
    />
  );
};

