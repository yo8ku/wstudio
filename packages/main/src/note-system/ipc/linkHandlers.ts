/**
 * linkHandlers.ts
 * 链接系统 IPC 处理器
 * 功能：处理渲染进程的链接相关请求
 * 描述：提供双向链接的增删改查 IPC 接口
 */

import { ipcMain } from 'electron';
import { linkIndexingService } from '../services/LinkIndexingService';
import { noteDatabase } from '../services/NoteDatabase';

let isRegistered = false;

export function registerLinkHandlers(): void {
  if (isRegistered) {
    return;
  }

  const handlersToRemove = [
    'link:create',
    'link:delete',
    'link:getOutlinks',
    'link:getBacklinks',
    'link:getBacklinksByTitle',
    'link:getAllLinks',
    'link:findUnlinkedMentions',
    'link:convertUnlinkedMention',
    'link:searchTargets',
    'link:getAnchors',
    'link:updateTargetId',
    'link:deleteLinksBySource'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (error) {
      void error;
    }
  }

  isRegistered = true;

  ipcMain.handle('link:create', async (_event, sourceId: string, targetTitle: string, context?: string) => {
    try {
      await noteDatabase.initialize();

      const targetNote = await noteDatabase.getNoteByTitle(targetTitle);
      const link = await noteDatabase.createLink({
        sourceId,
        targetId: targetNote?.id,
        targetTitle,
        context: context || '',
        isResolved: !!targetNote
      });

      console.log('[Link IPC] 创建链接成功:', link.id);
      return link;
    } catch (error) {
      console.error('[Link IPC] 创建链接失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:delete', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.deleteLink(id);
    } catch (error) {
      console.error('[Link IPC] 删除链接失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:getOutlinks', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.getOutlinks(noteId);
    } catch (error) {
      console.error('[Link IPC] 获取出链失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:getBacklinks', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.getBacklinks(noteId);
    } catch (error) {
      console.error('[Link IPC] 获取反向链接失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:getBacklinksByTitle', async (_event, title: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.getBacklinksByTitle(title);
    } catch (error) {
      console.error('[Link IPC] 根据标题获取反向链接失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:getAllLinks', async () => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.getAllLinks();
    } catch (error) {
      console.error('[Link IPC] 获取所有链接失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:findUnlinkedMentions', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      return await linkIndexingService.findUnlinkedMentions(noteId);
    } catch (error) {
      console.error('[Link IPC] 查询未链接提及失败:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'link:convertUnlinkedMention',
    async (
      _event,
      sourceNoteId: string,
      targetNoteId: string,
      position: { start: number; end: number },
      matchedText?: string
    ) => {
      try {
        await noteDatabase.initialize();
        return await linkIndexingService.convertUnlinkedMention(sourceNoteId, targetNoteId, position, matchedText);
      } catch (error) {
        console.error('[Link IPC] 转换未链接提及失败:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('link:searchTargets', async (_event, query: string) => {
    try {
      await noteDatabase.initialize();
      return await linkIndexingService.searchLinkTargets(query);
    } catch (error) {
      console.error('[Link IPC] 搜索链接目标失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:getAnchors', async (_event, targetReference: string, query?: string) => {
    try {
      await noteDatabase.initialize();
      return await linkIndexingService.getLinkAnchors(targetReference, query);
    } catch (error) {
      console.error('[Link IPC] 获取链接锚点失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:updateTargetId', async (_event, targetTitle: string, targetId: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.updateLinkTargetId(targetTitle, targetId);
    } catch (error) {
      console.error('[Link IPC] 更新链接目标 ID 失败:', error);
      throw error;
    }
  });

  ipcMain.handle('link:deleteLinksBySource', async (_event, sourceId: string) => {
    try {
      await noteDatabase.initialize();
      return await noteDatabase.deleteLinksBySource(sourceId);
    } catch (error) {
      console.error('[Link IPC] 删除笔记出链失败:', error);
      throw error;
    }
  });

  console.log('[Link IPC] 链接 IPC 处理器已注册');
}
