/**
 * 笔记系统 IPC 处理器入口
 * 功能：统一导出和注册所有笔记系统 IPC 处理器
 */

import { registerNoteHandlers } from './noteHandlers';
import { registerTagHandlers } from './tagHandlers';
import { registerLinkHandlers } from './linkHandlers';
import { registerTemplateHandlers } from './templateHandlers';

/**
 * 注册所有笔记系统 IPC 处理器
 */
export function registerNoteSystemHandlers(): void {
  registerNoteHandlers();
  registerTagHandlers();
  registerLinkHandlers();
  registerTemplateHandlers();
  
  console.log('[NoteSystem] 所有 IPC 处理器已注册');
}

// 导出各个处理器注册函数
export { registerNoteHandlers } from './noteHandlers';
export { registerTagHandlers } from './tagHandlers';
export { registerLinkHandlers } from './linkHandlers';
export { registerTemplateHandlers } from './templateHandlers';
