/**
 * 共享模块统一导出
 */

export * from './types/theme';
export * from './types/ai-panel-contribution';
export * from './types/extension-development';
export * from './types/workbench-contribution';
export * from './types/workbench-menu-context';
export * from './types/embeddings';
export * from './types/json';
export * from './types/extension';
export * from './types/workbench-background';
export * from './protocols/ExtensionHostProtocol';
export * from './protocols/PluginEditorBridgeProtocol';

// 显式导出主题相关常量，确保构建工具能正确识别
export { THEME_CHANNELS } from './types/theme';

// 工具类
export { EventEmitter } from './utils/EventEmitter';

// 服务类
export { EmbeddingService } from './services/EmbeddingService';



