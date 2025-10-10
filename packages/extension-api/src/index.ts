/**
 * @note-studio/extension-api
 * 
 * VSCode API compatibility layer for Note Studio
 * Provides 100% compatible VSCode Extension API
 */

// 导出完整的 VSCode API
export * from './vscode-compat';
export { default as vscode } from './vscode-compat';

// 导出工具类
export { EventEmitter } from './utils/event-emitter';