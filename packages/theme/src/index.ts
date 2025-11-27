/**
 * @note-studio/theme
 * 主题系统模块导出
 * 专注于主题系统功能
 */

// 主题系统
export * from './theme-system/index';

// 默认导出，包含所有命名导出（用于 CommonJS 兼容性）
import * as themeSystem from './theme-system/index';

const allExports = {
  ...themeSystem,
};

export default allExports;

