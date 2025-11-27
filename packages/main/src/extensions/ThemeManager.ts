/**
 * 主题管理器 - 管理和应用主题
 * ⚠️ 注意：VSCodeThemeLoader 已被移除，此功能暂时不可用
 */

import { EventEmitter } from 'events';

/**
 * 主题接口
 */
export interface ITheme {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc';
  colors: Record<string, string>;
  tokenColors?: Array<{
    name?: string;
    scope?: string | string[];
    settings: Record<string, unknown>;
  }>;
}

export interface ThemeChangedEvent {
  themeId: string;
  theme: ITheme;
}

/**
 * 主题管理器
 */
export class ThemeManager extends EventEmitter {
  private themes: Map<string, ITheme> = new Map();
  private currentThemeId: string | null = null;
  
  constructor() {
    super();
  }

  /**
   * 注册扩展的主题
   * ⚠️ 注意：VSCodeThemeLoader 已被移除，此功能暂时不可用
   */
  async registerThemesFromExtension(extensionPath: string): Promise<number> {
    console.log(`[ThemeManager] 从扩展加载主题: ${extensionPath}`);
    console.warn('[ThemeManager] VSCodeThemeLoader 已被移除，主题加载功能暂时不可用');
    return 0;
  }

  /**
   * 注册单个主题
   */
  registerTheme(theme: ITheme): boolean {
    // 基本验证
    if (!theme.id || !theme.name || !theme.type || !theme.colors) {
      console.warn(`[ThemeManager] 主题验证失败: ${theme.name || 'unknown'}`);
      return false;
    }
    
    this.themes.set(theme.id, theme);
    console.log(`[ThemeManager] 已注册主题: ${theme.name}`);
    return true;
  }

  /**
   * 获取所有主题
   */
  getAllThemes(): ITheme[] {
    return Array.from(this.themes.values());
  }

  /**
   * 获取指定类型的主题
   */
  getThemesByType(type: 'light' | 'dark' | 'hc'): ITheme[] {
    return this.getAllThemes().filter(theme => theme.type === type);
  }

  /**
   * 根据 ID 获取主题
   */
  getThemeById(themeId: string): ITheme | undefined {
    return this.themes.get(themeId);
  }

  /**
   * 搜索主题
   */
  searchThemes(query: string): ITheme[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllThemes().filter(theme => 
      theme.name.toLowerCase().includes(lowerQuery) ||
      theme.id.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 应用主题
   */
  async applyTheme(themeId: string): Promise<boolean> {
    const theme = this.themes.get(themeId);
    
    if (!theme) {
      console.error(`[ThemeManager] 主题不存在: ${themeId}`);
      return false;
    }
    
    console.log(`[ThemeManager] 应用主题: ${theme.name}`);
    
    // 应用主题颜色
    this.applyThemeColors(theme);
    
    // 更新当前主题
    this.currentThemeId = themeId;
    
    // 触发主题变更事件
    this.emit('themeChanged', {
      themeId,
      theme
    } as ThemeChangedEvent);
    
    return true;
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): ITheme | null {
    if (!this.currentThemeId) {
      return null;
    }
    return this.themes.get(this.currentThemeId) || null;
  }

  /**
   * 获取主题预览信息
   * ⚠️ 注意：VSCodeThemeLoader 已被移除，此功能暂时不可用
   */
  getThemePreview(themeId: string) {
    const theme = this.themes.get(themeId);
    if (!theme) {
      return null;
    }
    // 返回基本预览信息
    return {
      id: theme.id,
      name: theme.name,
      type: theme.type,
      colors: theme.colors
    };
  }

  /**
   * 取消注册主题（扩展卸载时）
   */
  unregisterTheme(themeId: string): boolean {
    if (this.themes.has(themeId)) {
      this.themes.delete(themeId);
      console.log(`[ThemeManager] 已取消注册主题: ${themeId}`);
      
      // 如果是当前主题，切换到默认主题
      if (this.currentThemeId === themeId) {
        this.applyDefaultTheme();
      }
      
      return true;
    }
    return false;
  }

  /**
   * 取消注册扩展的所有主题
   */
  unregisterThemesByExtension(extensionId: string): number {
    let count = 0;
    const themesToRemove: string[] = [];
    
    // 找到所有属于该扩展的主题
    for (const [themeId, theme] of this.themes.entries()) {
      if (themeId.startsWith(extensionId)) {
        themesToRemove.push(themeId);
      }
    }
    
    // 删除主题
    themesToRemove.forEach(themeId => {
      if (this.unregisterTheme(themeId)) {
        count++;
      }
    });
    
    return count;
  }

  /**
   * 应用默认主题
   */
  private applyDefaultTheme(): void {
    // 查找默认主题
    const defaultTheme = this.themes.get('theme-default-default-dark-theme') ||
                        this.themes.get('theme-default-default-light-theme') ||
                        this.getAllThemes()[0];
    
    if (defaultTheme) {
      this.applyTheme(defaultTheme.id);
    } else {
      console.warn('[ThemeManager] 没有可用的默认主题');
    }
  }

  /**
   * 应用主题颜色（实际实现需要与 UI 层集成）
   */
  private applyThemeColors(theme: ITheme): void {
    // TODO: 实际实现需要：
    // 1. 更新 CSS 变量
    // 2. 更新 Monaco Editor 主题
    // 3. 通知渲染进程更新 UI
    
    console.log('[ThemeManager] 应用主题颜色:');
    console.log('  编辑器背景:', theme.colors['editor.background']);
    console.log('  编辑器前景:', theme.colors['editor.foreground']);
    console.log('  侧边栏背景:', theme.colors['sideBar.background']);
    
    // 示例：发送到渲染进程
    // ipcMain.emit('apply-theme', { colors: theme.colors });
  }

  /**
   * 导出主题配置
   */
  exportTheme(themeId: string): string | null {
    const theme = this.themes.get(themeId);
    if (!theme) {
      return null;
    }
    return JSON.stringify(theme, null, 2);
  }

  /**
   * 导入主题配置
   */
  importTheme(themeJson: string): boolean {
    try {
      const theme = JSON.parse(themeJson) as ITheme;
      return this.registerTheme(theme);
    } catch (error) {
      console.error('[ThemeManager] 导入主题失败:', error);
      return false;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const themes = this.getAllThemes();
    return {
      total: themes.length,
      light: themes.filter(t => t.type === 'light').length,
      dark: themes.filter(t => t.type === 'dark').length,
      hc: themes.filter(t => t.type === 'hc').length,
      currentTheme: this.currentThemeId
    };
  }
}

// 导出单例
export const themeManager = new ThemeManager();










