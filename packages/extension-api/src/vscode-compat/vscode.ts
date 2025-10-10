/**
 * VSCode API 完全兼容层
 * 实现完整的 VSCode Extension API 1.85+
 */

import { EventEmitter } from './event-emitter';

// 重新导出所有 API
export * from './commands';
export * from './window';
export * from './workspace';
export * from './languages';
export * from './env';
export * from './extensions';
export * from './scm';
export * from './debug';
export * from './tasks';
export * from './notebooks';
export * from './authentication';
export * from './types';

// 主 vscode 命名空间
export namespace vscode {}

// 默认导出
export default vscode;