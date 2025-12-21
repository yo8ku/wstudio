/**
 * tagHandlers.ts
 * 标签系统 IPC 处理器
 * 功能：处理渲染进程的标签相关请求
 * 描述：提供标签的增删改查 IPC 接口
 */

import { ipcMain } from 'electron';
import { noteDatabase } from '../services/NoteDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册标签相关的 IPC 处理器
 */
export function registerTagHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'tag:create',
    'tag:update',
    'tag:delete',
    'tag:getAll',
    'tag:getByName',
    'tag:getNotesByTag',
    'tag:getTagsByNote',
    'tag:addNoteTag',
    'tag:removeNoteTag'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  // 创建标签
  ipcMain.handle('tag:create', async (_event, name: string, parentId?: string) => {
    try {
      await noteDatabase.initialize();
      const tag = await noteDatabase.createTag({ name, parentId });
      console.log('[Tag IPC] 创建标签成功:', tag.name);
      return tag;
    } catch (error) {
      console.error('[Tag IPC] 创建标签失败:', error);
      throw error;
    }
  });

  // 更新标签
  ipcMain.handle('tag:update', async (_event, id: string, name: string) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.updateTag(id, { name });
      return success;
    } catch (error) {
      console.error('[Tag IPC] 更新标签失败:', error);
      throw error;
    }
  });

  // 删除标签
  ipcMain.handle('tag:delete', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.deleteTag(id);
      return success;
    } catch (error) {
      console.error('[Tag IPC] 删除标签失败:', error);
      throw error;
    }
  });

  // 获取所有标签
  ipcMain.handle('tag:getAll', async () => {
    try {
      await noteDatabase.initialize();
      const tags = await noteDatabase.getAllTags();
      return tags;
    } catch (error) {
      console.error('[Tag IPC] 获取所有标签失败:', error);
      throw error;
    }
  });

  // 根据名称获取标签
  ipcMain.handle('tag:getByName', async (_event, name: string) => {
    try {
      await noteDatabase.initialize();
      const tag = await noteDatabase.getTagByName(name);
      return tag;
    } catch (error) {
      console.error('[Tag IPC] 根据名称获取标签失败:', error);
      throw error;
    }
  });

  // 根据标签获取笔记
  ipcMain.handle('tag:getNotesByTag', async (_event, tagId: string) => {
    try {
      await noteDatabase.initialize();
      const notes = await noteDatabase.getNotesByTag(tagId);
      return notes;
    } catch (error) {
      console.error('[Tag IPC] 根据标签获取笔记失败:', error);
      throw error;
    }
  });

  // 获取笔记的标签
  ipcMain.handle('tag:getTagsByNote', async (_event, noteId: string) => {
    try {
      await noteDatabase.initialize();
      const tags = await noteDatabase.getTagsByNote(noteId);
      return tags;
    } catch (error) {
      console.error('[Tag IPC] 获取笔记标签失败:', error);
      throw error;
    }
  });

  // 添加笔记标签关联
  ipcMain.handle('tag:addNoteTag', async (_event, noteId: string, tagId: string) => {
    try {
      await noteDatabase.initialize();
      await noteDatabase.addNoteTag(noteId, tagId);
      return true;
    } catch (error) {
      console.error('[Tag IPC] 添加笔记标签关联失败:', error);
      throw error;
    }
  });

  // 移除笔记标签关联
  ipcMain.handle('tag:removeNoteTag', async (_event, noteId: string, tagId: string) => {
    try {
      await noteDatabase.initialize();
      await noteDatabase.removeNoteTag(noteId, tagId);
      return true;
    } catch (error) {
      console.error('[Tag IPC] 移除笔记标签关联失败:', error);
      throw error;
    }
  });

  console.log('[Tag IPC] 标签 IPC 处理器已注册');
}
