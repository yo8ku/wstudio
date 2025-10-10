/**
 * 文件图标主题上下文
 * 管理当前的文件图标主题并提供给整个应用使用
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { iconThemeLoader, IconThemeConfiguration } from '../services/IconThemeLoader';

export interface IconThemeContextValue {
  /** 当前图标主题ID，null表示不使用图标主题 */
  currentIconTheme: string | null;
  /** 当前图标主题配置 */
  currentIconThemeConfig: IconThemeConfiguration | null;
  /** 设置图标主题 */
  setIconTheme: (themeId: string | null, themePath?: string) => Promise<void>;
  /** 是否正在加载 */
  isLoading: boolean;
}

const IconThemeContext = createContext<IconThemeContextValue | undefined>(undefined);

export interface IconThemeProviderProps {
  children: ReactNode;
}

/**
 * 文件图标主题提供者
 */
export const IconThemeProvider: React.FC<IconThemeProviderProps> = ({ children }) => {
  const [currentIconTheme, setCurrentIconTheme] = useState<string | null>('material-icon-theme');
  const [currentIconThemeConfig, setCurrentIconThemeConfig] = useState<IconThemeConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 初始化时加载默认图标主题
  useEffect(() => {
    const loadDefaultTheme = async () => {
      if (currentIconTheme) {
        const config = await iconThemeLoader.loadIconTheme(
          'extensions/material-icon-theme/extension/dist/material-icons.json'
        );
        if (config) {
          setCurrentIconThemeConfig(config);
          console.log('[IconThemeContext] 默认图标主题已加载');
        }
      }
    };
    loadDefaultTheme();

    // 监听外部的图标主题应用请求
    const handleApplyIconTheme = async (e: Event) => {
      const customEvent = e as CustomEvent<{ themeId: string | null; themePath?: string }>;
      const { themeId, themePath } = customEvent.detail;
      
      if (themeId && themePath) {
        await setIconTheme(themeId, themePath);
      } else {
        await setIconTheme(null);
      }
    };

    window.addEventListener('applyIconTheme', handleApplyIconTheme);
    return () => window.removeEventListener('applyIconTheme', handleApplyIconTheme);
  }, []);

  const setIconTheme = useCallback(async (themeId: string | null, themePath?: string) => {
    console.log(`[IconThemeContext] 设置图标主题: ${themeId || 'none'}`);
    setIsLoading(true);
    
    try {
      setCurrentIconTheme(themeId);
      
      if (themeId && themePath) {
        // 加载图标主题配置
        const config = await iconThemeLoader.loadIconTheme(themePath);
        setCurrentIconThemeConfig(config);
        console.log('[IconThemeContext] 图标主题配置已加载');
      } else {
        // 清除图标主题
        setCurrentIconThemeConfig(null);
        console.log('[IconThemeContext] 图标主题已清除');
      }
      
      // 触发自定义事件，通知其他组件图标主题已更改
      window.dispatchEvent(new CustomEvent('iconThemeChanged', {
        detail: { 
          themeId, 
          config: currentIconThemeConfig 
        }
      }));
    } catch (error) {
      console.error('[IconThemeContext] 设置图标主题失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentIconThemeConfig]);

  const value: IconThemeContextValue = {
    currentIconTheme,
    currentIconThemeConfig,
    setIconTheme,
    isLoading,
  };

  return (
    <IconThemeContext.Provider value={value}>
      {children}
    </IconThemeContext.Provider>
  );
};

/**
 * 使用图标主题钩子
 */
export const useIconTheme = (): IconThemeContextValue => {
  const context = useContext(IconThemeContext);
  if (!context) {
    throw new Error('useIconTheme must be used within IconThemeProvider');
  }
  return context;
};

