/**
 * ThemeService - 渲染进程主题管理服务
 * 通过 IPC 与主进程通信，管理主题数据
 */

import {
  THEME_CHANNELS,
  type ThemeInfo,
  type ThemeData,
  type ThemeConfigData,
  type SetThemeParams,
} from '@note-studio/shared';

/**
 * 渲染进程主题服务
 */
export class ThemeService {
  private static instance: ThemeService;

  private constructor() {
    // 监听主进程的主题变更事件
    this.listenToThemeChanges();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ThemeService {
    if (!ThemeService.instance) {
      ThemeService.instance = new ThemeService();
    }
    return ThemeService.instance;
  }

  /**
   * 监听主题变更事件
   */
  private listenToThemeChanges(): void {
    // 监听主题变更
    window.electronAPI?.on?.(THEME_CHANNELS.THEME_CHANGED, (theme: ThemeData) => {
      console.log('[ThemeService] 主题已变更:', theme.id);
      // 触发自定义事件，供 Zustand store 监听
      window.dispatchEvent(
        new CustomEvent('theme-changed', { detail: theme })
      );
    });

    // 监听主题列表更新
    window.electronAPI?.on?.(THEME_CHANNELS.THEME_LIST_UPDATED, (themes: ThemeInfo[]) => {
      console.log('[ThemeService] 主题列表已更新，数量:', themes.length);
      // 触发自定义事件
      window.dispatchEvent(
        new CustomEvent('theme-list-updated', { detail: themes })
      );
    });
  }

  /**
   * 获取所有主题列表
   */
  async getAllThemes(): Promise<ThemeInfo[]> {
    try {
      const themes = await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.GET_ALL_THEMES);
      return themes || [];
    } catch (error) {
      console.error('[ThemeService] 获取主题列表失败:', error);
      return [];
    }
  }

  /**
   * 获取主题详情
   */
  async getTheme(themeId: string): Promise<ThemeData | null> {
    try {
      return await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.GET_THEME, themeId);
    } catch (error) {
      console.error('[ThemeService] 获取主题详情失败:', error);
      return null;
    }
  }

  /**
   * 获取当前主题
   */
  async getCurrentTheme(): Promise<ThemeData | null> {
    try {
      return await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.GET_CURRENT_THEME);
    } catch (error) {
      console.error('[ThemeService] 获取当前主题失败:', error);
      return null;
    }
  }

  /**
   * 获取主题配置
   */
  async getThemeConfig(): Promise<ThemeConfigData> {
    try {
      return await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.GET_THEME_CONFIG);
    } catch (error) {
      console.error('[ThemeService] 获取主题配置失败:', error);
      return {};
    }
  }

  /**
   * 设置当前主题
   */
  async setTheme(themeId: string, customColors?: Record<string, string>): Promise<boolean> {
    try {
      const params: SetThemeParams = { themeId, customColors };
      const result = await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.SET_THEME, params);
      return result?.success || false;
    } catch (error) {
      console.error('[ThemeService] 设置主题失败:', error);
      return false;
    }
  }

  /**
   * 设置自定义颜色
   */
  async setCustomColors(customColors: Record<string, string>): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke(
        THEME_CHANNELS.SET_CUSTOM_COLORS,
        customColors
      );
      return result?.success || false;
    } catch (error) {
      console.error('[ThemeService] 设置自定义颜色失败:', error);
      return false;
    }
  }

  /**
   * 删除主题
   */
  async deleteTheme(themeId: string): Promise<boolean> {
    try {
      const result = await window.electron?.ipcRenderer.invoke(THEME_CHANNELS.DELETE_THEME, themeId);
      return result?.success || false;
    } catch (error) {
      console.error('[ThemeService] 删除主题失败:', error);
      return false;
    }
  }

}

// 导出单例实例
export const themeService = ThemeService.getInstance();

