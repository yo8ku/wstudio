/**
 * 共享模块统一导出
 */

export * from './protocols/ExtensionProtocol';
export * from './protocols/MessageTypes';
export * from './protocols/RPCProtocol';
export * from './types/vscode-types';
export * from './types/extension-manifest';
export * from './types/snippet';
export * from './types/theme';

// 显式导出主题相关常量，确保构建工具能正确识别
export { THEME_CHANNELS } from './types/theme';

// 工具类
export { EventEmitter } from './utils/EventEmitter';



