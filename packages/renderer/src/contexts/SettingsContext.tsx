/**
 * 设置上下载
 * 提供全局的设置状态管
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SettingsContextType {
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be used within SettingsProvider');
  }
  return context;
}

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const openSettings = useCallback(() => {
    console.log('[SettingsContext] 打开设置');
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    console.log('[SettingsContext] 关闭设置');
    setIsSettingsOpen(false);
  }, []);

  const toggleSettings = useCallback(() => {
    setIsSettingsOpen(prev => !prev);
  }, []);

  const value = {
    isSettingsOpen,
    openSettings,
    closeSettings,
    toggleSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
