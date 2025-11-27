/**
 * 主题系统核心模块
 * 提供主题类型定义等功能
 */

// 类型定义
export type {
  AppTheme,
  TokenColorRule,
  TokenStyle,
  ThemeListItem,
  ThemeConfig,
  CSSVariableMap,
} from './types';

// 导出一个空对象，确保模块有实际内容（用于 ESM 模块解析）
export const __themeSystemModule = true;
