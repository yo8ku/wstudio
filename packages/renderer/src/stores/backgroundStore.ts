/**
 * 背景图片状态管
 * 使用 Zustand 管理背景图片的全局状态
 */

import { create } from 'zustand';

interface BackgroundConfig {
  imagePath: string;
  opacity: number;
  blur: number;
  fit: 'cover' | 'contain' | 'fill' | 'none';
  enabled: boolean;
}

interface BackgroundStore {
  config: BackgroundConfig;
  setConfig: (config: BackgroundConfig) => void;
  isEnabled: () => boolean;
}

export const useBackgroundStore = create<BackgroundStore>((set, get) => ({
  config: {
    imagePath: '',
    opacity: 0.3,
    blur: 0,
    fit: 'cover',
    enabled: false
  },
  setConfig: (config) => {
    console.log('[BackgroundStore] 更新配置:', config);
    set({ config });
  },
  isEnabled: () => {
    const { config } = get();
    return config.enabled && !!config.imagePath;
  }
}));




