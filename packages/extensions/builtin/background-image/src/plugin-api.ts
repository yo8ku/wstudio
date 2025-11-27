/**
 * 插件 API 类型定义
 * 从 plugin-system 重新导出类型，方便插件使用
 */

// 使用相对路径导入，因为插件系统可能不在 node_modules 中
export type { PluginAPI } from '../../../../plugin-system/src/api/PluginAPI';
export type { PluginContext } from '../../../../plugin-system/src/types/plugin';

