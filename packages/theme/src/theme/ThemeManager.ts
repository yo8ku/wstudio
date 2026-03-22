/**
 * 主题管理器
 * 负责主题的加载、注册和应用
 */

import { EventEmitter } from '@note-studio/shared';
import type { ITheme, IThemeColors, ITokenColors, IThemeEvents } from './types';

export interface MonacoThemeTokenRule {
  token: string;
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

export interface MonacoStandaloneThemeData {
  base: 'vs' | 'vs-dark' | 'hc-black';
  inherit: boolean;
  rules: MonacoThemeTokenRule[];
  colors: Record<string, string>;
}

export interface MonacoThemeApi {
  editor: {
    defineTheme: (themeId: string, themeData: MonacoStandaloneThemeData) => void;
    setTheme: (themeId: string) => void;
  };
}

export class ThemeManager extends EventEmitter<IThemeEvents> {
  private themes: Map<string, ITheme> = new Map();
  private currentTheme: ITheme | null = null;
  private monacoInstance: MonacoThemeApi | null = null;

  constructor() {
    super();
  }

  /**
   * 初始化 Monaco Editor
   */
  public async initializeMonaco(monacoInstance: MonacoThemeApi): Promise<void> {
    this.monacoInstance = monacoInstance;
    
    // 加载内置主题
    await this.loadBuiltinThemes();
    
    // 将所有主题注册到 Monaco
    this.registerAllThemesToMonaco();
  }

  /**
   * 注册主题
   */
  public registerTheme(theme: ITheme): void {
    this.themes.set(theme.id, theme);
    
    // 如果 Monaco 已初始化，立即注册
    if (this.monacoInstance) {
      this.registerThemeToMonaco(theme);
    }
    
    this.emit('theme-registered', theme);
  }

  /**
   * 批量注册主题
   */
  public registerThemes(themes: ITheme[]): void {
    themes.forEach(theme => this.registerTheme(theme));
  }

  /**
   * 注销主题
   */
  public unregisterTheme(themeId: string): void {
    const theme = this.themes.get(themeId);
    if (theme) {
      this.themes.delete(themeId);
      this.emit('theme-unregistered', themeId);
      
      // 如果当前主题被注销，切换到默认主题
      if (this.currentTheme?.id === themeId) {
        this.applyTheme('dark-plus').catch(console.error);
      }
    }
  }

  /**
   * 将所有主题注册到 Monaco Editor
   */
  private registerAllThemesToMonaco(): void {
    if (!this.monacoInstance) return;
    
    this.themes.forEach(theme => {
      this.registerThemeToMonaco(theme);
    });
  }

  /**
   * 将单个主题注册到 Monaco Editor
   */
  private registerThemeToMonaco(theme: ITheme): void {
    if (!this.monacoInstance) return;

    try {
      // 转换为 Monaco 主题格式
      const monacoTheme = this.convertToMonacoTheme(theme);
      
      // 定义主题
      this.monacoInstance.editor.defineTheme(theme.id, monacoTheme);
      
      console.log(`[ThemeManager] Registered theme to Monaco: ${theme.label}`);
    } catch (error) {
      console.error(`Failed to register theme ${theme.id}:`, error);
    }
  }

  /**
   * 转换为 Monaco 主题格式
   */
  private convertToMonacoTheme(theme: ITheme): MonacoStandaloneThemeData {
    return {
      base: this.getMonacoBase(theme.type),
      inherit: true,
      rules: this.convertTokenRules(theme.tokenColors),
      colors: this.convertThemeColors(theme.colors),
    };
  }

  /**
   * 获取 Monaco 基础主题
   */
  private getMonacoBase(type: 'dark' | 'light' | 'hc'): 'vs' | 'vs-dark' | 'hc-black' {
    switch (type) {
      case 'light':
        return 'vs';
      case 'dark':
        return 'vs-dark';
      case 'hc':
        return 'hc-black';
      default:
        return 'vs-dark';
    }
  }

  /**
   * 转换 token 规则
   */
  private convertTokenRules(tokenColors: ITokenColors[]): MonacoThemeTokenRule[] {
    const rules: MonacoThemeTokenRule[] = [];

    for (const token of tokenColors) {
      const scopes = Array.isArray(token.scope) ? token.scope : [token.scope];
      
      for (const scope of scopes) {
        if (!scope) continue;

        const rule: MonacoThemeTokenRule = {
          token: scope,
        };

        if (token.settings.foreground) {
          // 规范化颜色后移除 # 号
          const normalizedColor = this.normalizeColor(token.settings.foreground);
          rule.foreground = normalizedColor.replace('#', '');
        }
        
        if (token.settings.background) {
          // 规范化颜色后移除 # 号
          const normalizedColor = this.normalizeColor(token.settings.background);
          rule.background = normalizedColor.replace('#', '');
        }
        
        if (token.settings.fontStyle) {
          rule.fontStyle = token.settings.fontStyle;
        }

        rules.push(rule);
      }
    }

    return rules;
  }

  /**
   * 规范化颜色值：将 3 位十六进制转换为 6 位
   * Monaco Editor 要求颜色值必须是 6 位十六进制格式
   */
  private normalizeColor(color: string): string {
    if (!color || typeof color !== 'string') return color;
    
    // 匹配 3 位十六进制颜色值（如 #fff 或 #FFF）
    const match = color.match(/^#([0-9a-fA-F]{3})$/);
    if (match) {
      const [r, g, b] = match[1].split('');
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    
    // 6 位或 8 位颜色值统一转为小写
    if (color.match(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/)) {
      return color.toLowerCase();
    }
    
    return color;
  }

  /**
   * 转换主题颜色
   */
  private convertThemeColors(colors: IThemeColors): { [name: string]: string } {
    const monacoColors: { [name: string]: string } = {};

    // 映射所有颜色并规范化颜色值
    Object.entries(colors).forEach(([key, value]) => {
      if (value) {
        monacoColors[key] = this.normalizeColor(value);
      }
    });
    
    return monacoColors;
  }

  /**
   * 应用主题
   */
  public async applyTheme(themeId: string): Promise<void> {
    const theme = this.themes.get(themeId);
    
    if (!theme) {
      throw new Error(`Theme not found: ${themeId}`);
    }

    // 应用到 Monaco Editor
    if (this.monacoInstance) {
      this.monacoInstance.editor.setTheme(themeId);
    }

    // 应用到 DOM
    this.applyThemeToDOM(theme);

    this.currentTheme = theme;
    this.emit('theme-changed', theme);

    // 保存配置
    await this.saveCurrentTheme(themeId);
  }

  /**
   * 应用主题到 DOM
   */
  private applyThemeToDOM(theme: ITheme): void {
    const root = document.documentElement;

    // 设置主题类名
    root.className = root.className.replace(/theme-\w+/g, '');
    root.classList.add(`theme-${theme.type}`);
    root.setAttribute('data-theme-id', theme.id);

    // 应用 CSS 变量
    Object.entries(theme.colors).forEach(([key, value]) => {
      if (value) {
        const cssVar = `--vscode-${key.replace(/\./g, '-')}`;
        root.style.setProperty(cssVar, value);
      }
    });
  }

  /**
   * 获取所有主题
   */
  public getAllThemes(): ITheme[] {
    return Array.from(this.themes.values());
  }

  /**
   * 获取当前主题
   */
  public getCurrentTheme(): ITheme | null {
    return this.currentTheme;
  }

  /**
   * 获取主题
   */
  public getTheme(id: string): ITheme | undefined {
    return this.themes.get(id);
  }

  /**
   * 获取指定类型的主题
   */
  public getThemesByType(type: 'dark' | 'light' | 'hc'): ITheme[] {
    return this.getAllThemes().filter(theme => theme.type === type);
  }

  /**
   * 搜索主题
   */
  public searchThemes(query: string): ITheme[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllThemes().filter(theme => 
      theme.label.toLowerCase().includes(lowerQuery) ||
      theme.id.toLowerCase().includes(lowerQuery) ||
      theme.description?.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 保存当前主题到配置
   */
  private async saveCurrentTheme(themeId: string): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      try {
        await (window as any).electronAPI.settings.set('workbench.colorTheme', themeId);
      } catch (error) {
        console.warn('Failed to save theme to settings:', error);
      }
    }
  }

  /**
   * 加载内置主题
   */
  private async loadBuiltinThemes(): Promise<void> {
    // 加载 Dark+ 主题
    const darkPlus: ITheme = {
      id: 'dark-plus',
      label: 'Dark+ (默认深色)',
      type: 'dark',
      description: '默认深色主题',
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editor.lineHighlightBackground': '#282828',
        'editor.selectionBackground': '#264f78',
        'editorCursor.foreground': '#aeafad',
        'editorLineNumber.foreground': '#858585',
        'editorLineNumber.activeForeground': '#c6c6c6',
        'sideBar.background': '#252526',
        'sideBar.foreground': '#cccccc',
        'statusBar.background': '#007acc',
        'statusBar.foreground': '#ffffff',
        'activityBar.background': '#333333',
        'activityBar.foreground': '#ffffff',
      },
      tokenColors: [
        {
          scope: 'comment',
          settings: { foreground: '#6A9955' },
        },
        {
          scope: 'string',
          settings: { foreground: '#ce9178' },
        },
        {
          scope: 'keyword',
          settings: { foreground: '#569cd6' },
        },
        {
          scope: 'variable',
          settings: { foreground: '#9cdcfe' },
        },
        {
          scope: 'function',
          settings: { foreground: '#dcdcaa' },
        },
        {
          scope: 'constant.numeric',
          settings: { foreground: '#b5cea8' },
        },
        {
          scope: 'entity.name.type',
          settings: { foreground: '#4ec9b0' },
        },
      ],
    };

    // 加载 Light+ 主题
    const lightPlus: ITheme = {
      id: 'light-plus',
      label: 'Light+ (默认浅色)',
      type: 'light',
      description: '默认浅色主题',
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f0f0f0',
        'editor.selectionBackground': '#add6ff',
        'editorCursor.foreground': '#000000',
        'editorLineNumber.foreground': '#237893',
        'editorLineNumber.activeForeground': '#0b216f',
        'sideBar.background': '#f3f3f3',
        'sideBar.foreground': '#383838',
        'statusBar.background': '#007acc',
        'statusBar.foreground': '#ffffff',
        'activityBar.background': '#2c2c2c',
        'activityBar.foreground': '#ffffff',
      },
      tokenColors: [
        {
          scope: 'comment',
          settings: { foreground: '#008000' },
        },
        {
          scope: 'string',
          settings: { foreground: '#a31515' },
        },
        {
          scope: 'keyword',
          settings: { foreground: '#0000ff' },
        },
        {
          scope: 'variable',
          settings: { foreground: '#001080' },
        },
        {
          scope: 'function',
          settings: { foreground: '#795e26' },
        },
        {
          scope: 'constant.numeric',
          settings: { foreground: '#098658' },
        },
        {
          scope: 'entity.name.type',
          settings: { foreground: '#267f99' },
        },
      ],
    };

    this.registerTheme(darkPlus);
    this.registerTheme(lightPlus);
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    this.themes.clear();
    this.currentTheme = null;
    this.removeAllListeners();
  }
}

// 导出单例
export const themeManager = new ThemeManager();

