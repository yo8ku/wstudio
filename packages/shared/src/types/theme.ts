/**
 * 主题系统共享类型
 * 用于主进程和渲染进程之间的 IPC 通信
 */

/**
 * 主题信息（传输用）
 */
export interface ThemeInfo {
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
 * 完整主题数据（传输用）
 */
export interface ThemeData {
  id: string;
  name: string;
  type: 'light' | 'dark' | 'hc' | 'hcLight';
  author?: string;
  description?: string;
  version?: string;
  colors: Record<string, string>;
  tokenColors: Array<{
    name?: string;
    scope: string[];
    settings: {
      foreground?: string;
      background?: string;
      fontStyle?: string;
    };
  }>;
  semanticHighlighting?: boolean;
  semanticTokenColors?: Record<string, string | Record<string, string>>;
  source?: 'builtin' | 'user' | 'market';
  isBuiltin?: boolean;
  isFavorite?: boolean;
  usageCount?: number;
  lastUsedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  originalPath?: string;
}

/**
 * 主题配置（传输用）
 */
export interface ThemeConfigData {
  activeThemeId?: string;
  customColors?: Record<string, string>;
  recentThemes?: string[];
  favoriteThemes?: string[];
}

/**
 * 主题 IPC 通道名称
 */
export const THEME_CHANNELS = {
  // 查询操作
  GET_ALL_THEMES: 'theme:get-all-themes',
  GET_THEME: 'theme:get-theme',
  GET_THEME_LIST: 'theme:get-theme-list',
  GET_CURRENT_THEME: 'theme:get-current-theme',
  GET_THEME_CONFIG: 'theme:get-theme-config',
  GET_LATEST_USER_THEME_FILE: 'theme:getLatestUserThemeFile',
  GET_THEME_OVERRIDE: 'theme:get-override',
  
  // 设置操作
  SET_THEME: 'theme:set-theme',
  SET_CUSTOM_COLORS: 'theme:set-custom-colors',
  
  // 主题管理
  SAVE_THEME: 'theme:save',
  SAVE_OVERRIDE: 'theme:save-override',
  DELETE_THEME: 'theme:delete-theme',
  DELETE_OVERRIDE: 'theme:delete-override',
  
  // 事件通知（主进程 -> 渲染进程）
  THEME_CHANGED: 'theme:theme-changed',
  THEME_LIST_UPDATED: 'theme:theme-list-updated',
} as const;

/**
 * 设置主题的参数
 */
export interface SetThemeParams {
  themeId: string;
  customColors?: Record<string, string>;
}

/**
 * 主题覆盖数据
 */
export interface ThemeOverrideData {
  baseThemeId: string;
  colors: Record<string, string>;
}




