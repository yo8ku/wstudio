/**
 * 共享模块统一导出
 */

export * from './types/theme';
export * from './types/embeddings';
export * from './types/workbench-background';

// 显式导出主题相关常量，确保构建工具能正确识别
export { THEME_CHANNELS } from './types/theme';

// 工具类
export { EventEmitter } from './utils/EventEmitter';

// 服务类
export { EmbeddingService } from './services/EmbeddingService';



