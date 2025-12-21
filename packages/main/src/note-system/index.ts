/**
 * 笔记系统模块入口
 * 功能：统一导出笔记系统所有功能
 * 描述：提供笔记系统的服务、类型和 IPC 处理器
 */

// 导出类型
export * from './types';

// 导出服务
export { NoteDatabase, noteDatabase } from './services/NoteDatabase';

// 导出 IPC 处理器
export { registerNoteSystemHandlers } from './ipc';
export {
  registerNoteHandlers,
  registerTagHandlers,
  registerLinkHandlers,
  registerTemplateHandlers
} from './ipc';
