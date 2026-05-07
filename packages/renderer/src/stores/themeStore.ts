/**
 * 主题状态管理 Store (Zustand)
 * 管理主题状态和 CSS 变量应用
 */

import { create } from 'zustand';
import type { ThemeData, ThemeInfo } from '@note-studio/shared';
import { themeService } from '../services/ThemeService';

let deferredThemeListTimer: number | null = null;

/**
 * 主题状态接口
 */
interface ThemeState {
  // 状态
  currentTheme: ThemeData | null;
  themeList: ThemeInfo[];
  isLoading: boolean;
  error: string | null;

  // 操作
  initialize: () => Promise<void>;
  setTheme: (themeId: string, customColors?: Record<string, string>) => Promise<boolean>;
  setCustomColors: (customColors: Record<string, string>) => Promise<boolean>;
  applyThemeToDOM: (theme: ThemeData) => void;
}

/**
 * 主题 Store
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  // 初始状态
  currentTheme: null,
  themeList: [],
  isLoading: false,
  error: null,

  /**
   * 初始化主题系统
   */
  initialize: async () => {
    console.log('[ThemeStore] 开始初始化...');
    set({ isLoading: true, error: null });

    try {
      const currentTheme = await themeService.getCurrentTheme();

      set({
        currentTheme,
        isLoading: false,
      });

      if (currentTheme) {
        get().applyThemeToDOM(currentTheme);
      }

      if (deferredThemeListTimer === null) {
        deferredThemeListTimer = window.setTimeout(() => {
          deferredThemeListTimer = null;
          void (async () => {
            const themes = await themeService.getAllThemes();
            let nextCurrentTheme = get().currentTheme;

            if (!nextCurrentTheme && themes.length > 0) {
              const defaultThemeId = themes[0].id;
              await themeService.setTheme(defaultThemeId);
              nextCurrentTheme = await themeService.getCurrentTheme();
            }

            set({
              themeList: themes,
              currentTheme: nextCurrentTheme,
            });

            if (nextCurrentTheme) {
              get().applyThemeToDOM(nextCurrentTheme);
            }
          })().catch((error) => {
            console.error('[ThemeStore] Deferred theme list load failed:', error);
          });
        }, 2400);
      }
    } catch (error) {
      console.error('[ThemeStore] 初始化失败:', error);
      set({
        error: error instanceof Error ? error.message : '初始化失败',
        isLoading: false,
      });
    }
  },

  /**
   * 设置主题
   */
  setTheme: async (themeId: string, customColors?: Record<string, string>) => {
    console.log('[ThemeStore] 设置主题:', themeId);
    set({ isLoading: true, error: null });

    try {
      const success = await themeService.setTheme(themeId, customColors);

      if (success) {
        const currentTheme = await themeService.getCurrentTheme();
        set({ currentTheme, isLoading: false });

        if (currentTheme) {
          get().applyThemeToDOM(currentTheme);
        }

        console.log('[ThemeStore] 主题设置成功');
        return true;
      } else {
        set({ error: '设置主题失败', isLoading: false });
        return false;
      }
    } catch (error) {
      console.error('[ThemeStore] 设置主题失败:', error);
      set({
        error: error instanceof Error ? error.message : '设置主题失败',
        isLoading: false,
      });
      return false;
    }
  },

  /**
   * 设置自定义颜色
   */
  setCustomColors: async (customColors: Record<string, string>) => {
    console.log('[ThemeStore] 设置自定义颜色');
    set({ isLoading: true, error: null });

    try {
      const success = await themeService.setCustomColors(customColors);

      if (success) {
        const currentTheme = await themeService.getCurrentTheme();
        set({ currentTheme, isLoading: false });

        if (currentTheme) {
          get().applyThemeToDOM(currentTheme);
        }

        console.log('[ThemeStore] 自定义颜色设置成功');
        return true;
      } else {
        set({ error: '设置自定义颜色失败', isLoading: false });
        return false;
      }
    } catch (error) {
      console.error('[ThemeStore] 设置自定义颜色失败:', error);
      set({
        error: error instanceof Error ? error.message : '设置自定义颜色失败',
        isLoading: false,
      });
      return false;
    }
  },

  /**
   * 应用主题到 DOM
   * 从主题 JSON 的 colors 对象动态生成 CSS 变量（--ws- 前缀）
   */
  applyThemeToDOM: (theme: ThemeData) => {
    console.log('[ThemeStore] 应用主题到 DOM:', theme.id);
    console.log('[ThemeStore] 主题颜色数量:', Object.keys(theme.colors).length);

    try {
      // 设置主题属性到 root 元素
      document.documentElement.setAttribute('data-theme', theme.id);
      document.body.setAttribute('data-theme-type', theme.type);

      // 获取或创建 style 元素
      let styleElement = document.getElementById('theme-variables') as HTMLStyleElement;
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'theme-variables';
        document.head.appendChild(styleElement);
        console.log('[ThemeStore] 创建新的 <style> 元素');
      }

      // 生成 CSS 变量：将 JSON 中的 colors 对象转换为 CSS 变量
      // 例如: "editor.background": "#002b36" -> --ws-editor-background: #002b36;
      const cssVariables = Object.entries(theme.colors)
        .map(([key, value]) => {
          // 将点号替换为连字符，并添加 --ws- 前缀
          const cssVarName = `--ws-${key.replace(/\./g, '-')}`;
          return `  ${cssVarName}: ${value};`;
        })
        .join('\n');

      // 应用 CSS 变量到 :root
      styleElement.textContent = `:root {\n${cssVariables}\n}`;

      console.log('[ThemeStore] ✅ 主题已应用:', theme.name);
      console.log('[ThemeStore] ✅ CSS 变量数量:', Object.keys(theme.colors).length);

      // 验证 CSS 变量是否正确注入
      const testVar = getComputedStyle(document.documentElement).getPropertyValue('--ws-editor-background');
      if (testVar) {
        console.log('[ThemeStore] ✅ CSS 变量验证成功，--ws-editor-background:', testVar.trim());
      } else {
        console.warn('[ThemeStore] ⚠️ CSS 变量验证失败，可能未正确注入');
      }
    } catch (error) {
      console.error('[ThemeStore] ❌ 应用主题到 DOM 失败:', error);
    }
  },
}));

// 监听主题变更事件
if (typeof window !== 'undefined') {
  window.addEventListener('theme-changed', ((event: CustomEvent<ThemeData>) => {
    console.log('[ThemeStore] 收到主题变更事件');
    const { currentTheme } = useThemeStore.getState();
    
    // 更新状态
    useThemeStore.setState({ currentTheme: event.detail });
    
    // 应用到 DOM
    useThemeStore.getState().applyThemeToDOM(event.detail);
  }) as EventListener);

  window.addEventListener('theme-list-updated', ((event: CustomEvent<ThemeInfo[]>) => {
    console.log('[ThemeStore] 收到主题列表更新事件');
    useThemeStore.setState({ themeList: event.detail });
  }) as EventListener);
}
