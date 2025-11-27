/**
 * 背景图片状态管理
 * 负责在渲染进程中维护背景图片配置，供组件实时读取
 */

import { create } from 'zustand';

export type BackgroundFit = 'cover' | 'contain' | 'fill' | 'none';

export interface BackgroundConfig {
  imagePath: string;
  sourcePath?: string;
  opacity: number;
  blur: number;
  fit: BackgroundFit;
  enabled: boolean;
}

interface BackgroundStore {
  config: BackgroundConfig;
  isInitialized: boolean;
  setConfig: (config: BackgroundConfig) => void;
  updateConfig: (updates: Partial<BackgroundConfig>) => void;
  resetConfig: () => void;
  markInitialized: () => void;
}

export const DEFAULT_BACKGROUND_CONFIG: BackgroundConfig = Object.freeze({
  imagePath: '',
  sourcePath: '',
  opacity: 0.75,
  blur: 0,
  fit: 'cover' as const,
  enabled: false,
});

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

const sanitizeConfig = (config: BackgroundConfig): BackgroundConfig => {
  const sanitizedOpacity = clamp(config.opacity, 0, 1);
  const sanitizedBlur = clamp(config.blur, 0, 20);
  const sanitizedFit: BackgroundFit = ['cover', 'contain', 'fill', 'none'].includes(config.fit)
    ? config.fit
    : 'cover';

  return {
    imagePath: config.imagePath ?? '',
    sourcePath: config.sourcePath ?? '',
    opacity: sanitizedOpacity,
    blur: sanitizedBlur,
    fit: sanitizedFit,
    enabled: Boolean(config.enabled && config.imagePath),
  };
};

const mergeWithDefault = (config: BackgroundConfig | Partial<BackgroundConfig>): BackgroundConfig => {
  const merged: BackgroundConfig = {
    ...DEFAULT_BACKGROUND_CONFIG,
    ...config,
  };
  return sanitizeConfig(merged);
};

export const useBackgroundStore = create<BackgroundStore>((set, get) => ({
  config: DEFAULT_BACKGROUND_CONFIG,
  isInitialized: false,

  setConfig: (config) => {
    const finalConfig = mergeWithDefault(config);
    set({ config: finalConfig, isInitialized: true });
  },

  updateConfig: (updates) => {
    const current = get().config;
    const finalConfig = mergeWithDefault({ ...current, ...updates });
    set({ config: finalConfig });
  },

  resetConfig: () => {
    set({ config: DEFAULT_BACKGROUND_CONFIG, isInitialized: false });
  },

  markInitialized: () => set({ isInitialized: true }),
}));

