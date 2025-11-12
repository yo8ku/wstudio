/**
 * 应用主题格式类型定义
 * 解析后的主题格式，用于应用内部使用
 */

/**
 * 应用主题
 */
export interface AppTheme {
  /** 主题唯一标识 */
  id: string;
  /** 主题显示名称 */
  name: string;
  /** 主题类型 */
  type: 'light' | 'dark' | 'hc' | 'hcLight';
  /** 基础主题ID（用于自定义主题继承） */
  baseTheme?: string;
  /** 主题作者 */
  author?: string;
  /** 主题描述 */
  description?: string;
  /** 主题版本 */
  version?: string;
  /** 颜色映射（扁平化） */
  colors: Record<string, string>;
  /** 语法高亮规则 */
  tokenColors: TokenColorRule[];
  /** 语义高亮 */
  semanticHighlighting?: boolean;
  semanticTokenColors?: Record<string, string | TokenStyle>;
  /** 主题来源 */
  source?: 'builtin' | 'user' | 'market';
  /** 是否为内置主题 */
  isBuiltin?: boolean;
  /** 是否收藏 */
  isFavorite?: boolean;
  /** 使用次数 */
  usageCount?: number;
  /** 最后使用时间 */
  lastUsedAt?: number;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
  /** 原始文件路径 */
  originalPath?: string;
}

/**
 * Token 颜色规则
 */
export interface TokenColorRule {
  /** 规则名称 */
  name?: string;
  /** 作用域 */
  scope: string[];
  /** 样式 */
  settings: TokenStyle;
}

/**
 * Token 样式
 */
export interface TokenStyle {
  /** 前景色 */
  foreground?: string;
  /** 背景色 */
  background?: string;
  /** 字体样式 */
  fontStyle?: string;
}


/**
 * 主题列表项（轻量版）
 */
export interface ThemeListItem {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc' | 'hcLight';
  author?: string;
  description?: string;
  source?: 'builtin' | 'user' | 'market';
  isFavorite?: boolean;
  lastUsedAt?: number;
}

/**
 * 主题配置（用户设置）
 */
export interface ThemeConfig {
  /** 当前激活的主题 ID */
  activeThemeId?: string;
  /** 用户自定义颜色（覆盖主题颜色） */
  customColors?: Record<string, string>;
  /** 最近使用的主题 */
  recentThemes?: string[];
  /** 收藏的主题 */
  favoriteThemes?: string[];
}

/**
 * CSS 变量映射
 */
export interface CSSVariableMap {
  [cssVarName: string]: string;
}








