/**
 * linkHandlers.ts
 * 链接系统 IPC 处理器
 * 功能：处理渲染进程的链接相关请求
 * 描述：提供双向链接的增删改查 IPC 接口
 */

import { ipcMain } from 'electron';
import { noteDatabase } from '../services/NoteDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册链接相关的 IPC 处理器
 */
export function registerLinkHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'link:create',
    'link:delete',
    'link:getOutlinks',
    'link:getBacklinks',
    'link:getBacklinksByTitle',
    'link:getAllLinks',
    'link:updateTargetId',
    'link:deleteLinksBySource'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  // 创建链接
  ipcMain.handle('link:create', async (_event, sourceId: string, targetTitle: string, context?: string) => {
    try {
      await noteDatabase.initialize();
      
      // 尝试查找目标笔记
      const targetNote = await noteDatabase.getNoteByTitle(targetTitle);
      
      const link = await noteDatabase.createLink({
        sourceId,
        targetId: targetNote?.id,
        targetTitle,
        context: context || ''
      });
      
      console.log('[Link IPC] 创建链接成功:', link.id);
      return link;
    } catch (error) {
      console.error('[Link IPC] 创建链接失败:', error);
      throw error;
    }
  });

  // 删除链接
  ipcMain.handle('link:delete', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.deleteLink(id);
      return success;
    } catch (error) {
      console.error('[Link IPC] 删除链接失败:', error);
      throw error;
    }
  });

  // 获取笔记的出链
  ipcMain.handle('link:getOutlinks', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      const links = await noteDatabase.getOutlinks(noteId);
      return links;
    } catch (error) {
      console.error('[Link IPC] 获取出链失败:', error);
      throw error;
    }
  });

  // 获取笔记的反向链接
  ipcMain.handle('link:getBacklinks', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      const links = await noteDatabase.getBacklinks(noteId);
      return links;
    } catch (error) {
      console.error('[Link IPC] 获取反向链接失败:', error);
      throw error;
    }
  });

  // 根据标题获取反向链接
  ipcMain.handle('link:getBacklinksByTitle', async (_event, title: string) => {
    try {
      await noteDatabase.initialize();
      const links = await noteDatabase.getBacklinksByTitle(title);
      return links;
    } catch (error) {
      console.error('[Link IPC] 根据标题获取反向链接失败:', error);
      throw error;
    }
  });

  // 获取所有链接
  ipcMain.handle('link:getAllLinks', async () => {
    try {
      await noteDatabase.initialize();
      const links = await noteDatabase.getAllLinks();
      return links;
    } catch (error) {
      console.error('[Link IPC] 获取所有链接失败:', error);
      throw error;
    }
  });

  // 更新链接的目标 ID
  ipcMain.handle('link:updateTargetId', async (_event, targetTitle: string, targetId: string) => {
    try {
      await noteDatabase.initialize();
      const count = await noteDatabase.updateLinkTargetId(targetTitle, targetId);
      return count;
    } catch (error) {
      console.error('[Link IPC] 更新链接目标 ID 失败:', error);
      throw error;
    }
  });

  // 删除笔记的所有出链
  ipcMain.handle('link:deleteLinksBySource', async (_event, sourceId: string) => {
    try {
      await noteDatabase.initialize();
      const count = await noteDatabase.deleteLinksBySource(sourceId);
      return count;
    } catch (error) {
      console.error('[Link IPC] 删除笔记出链失败:', error);
      throw error;
    }
  });

  console.log('[Link IPC] 链接 IPC 处理器已注册');
}
