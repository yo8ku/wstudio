/**
 * noteHandlers.ts
 * 笔记系统 IPC 处理器
 * 功能：处理渲染进程的笔记相关请求
 * 描述：提供笔记的增删改查、每日笔记、搜索等 IPC 接口
 */

import { ipcMain } from 'electron';
import { noteDatabase } from '../services/NoteDatabase';
import { NoteItem, NoteType } from '../types';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册笔记相关的 IPC 处理器
 */
export function registerNoteHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'note:create',
    'note:update',
    'note:delete',
    'note:get',
    'note:getAll',
    'note:search',
    'note:searchAdvanced',
    'note:getDailyNote',
    'note:createDailyNote',
    'note:getFavorites',
    'note:toggleFavorite',
    'note:getByTitle'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  // ==================== 笔记 CRUD ====================

  // 创建笔记
  ipcMain.handle('note:create', async (_event, data: Partial<NoteItem>) => {
    try {
      await noteDatabase.initialize();
      const note = await noteDatabase.createNote(data);
      console.log('[Note IPC] 创建笔记成功:', note.id);
      return note;
    } catch (error) {
      console.error('[Note IPC] 创建笔记失败:', error);
      throw error;
    }
  });

  // 更新笔记
  ipcMain.handle('note:update', async (_event, id: string, updates: Partial<NoteItem>) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.updateNote(id, updates);
      return success;
    } catch (error) {
      console.error('[Note IPC] 更新笔记失败:', error);
      throw error;
    }
  });

  // 删除笔记
  ipcMain.handle('note:delete', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const success = await noteDatabase.deleteNote(id);
      return success;
    } catch (error) {
      console.error('[Note IPC] 删除笔记失败:', error);
      throw error;
    }
  });

  // 获取单个笔记
  ipcMain.handle('note:get', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const note = await noteDatabase.getNote(id);
      return note;
    } catch (error) {
      console.error('[Note IPC] 获取笔记失败:', error);
      throw error;
    }
  });

  // 获取所有笔记
  ipcMain.handle('note:getAll', async () => {
    try {
      await noteDatabase.initialize();
      const notes = await noteDatabase.getAllNotes();
      return notes;
    } catch (error) {
      console.error('[Note IPC] 获取所有笔记失败:', error);
      throw error;
    }
  });

  // 搜索笔记
  ipcMain.handle('note:search', async (_event, query: string) => {
    try {
      await noteDatabase.initialize();
      const notes = await noteDatabase.searchNotes(query);
      return notes;
    } catch (error) {
      console.error('[Note IPC] 搜索笔记失败:', error);
      throw error;
    }
  });

  // 高级搜索笔记
  ipcMain.handle('note:searchAdvanced', async (_event, options: {
    query?: string;
    tagIds?: string[];
    type?: NoteType;
    startDate?: number;
    endDate?: number;
    isFavorite?: boolean;
  }) => {
    try {
      await noteDatabase.initialize();
      const notes = await noteDatabase.searchNotesAdvanced(options);
      return notes;
    } catch (error) {
      console.error('[Note IPC] 高级搜索笔记失败:', error);
      throw error;
    }
  });

  // ==================== 每日笔记 ====================

  // 获取每日笔记
  ipcMain.handle('note:getDailyNote', async (_event, date: string) => {
    try {
      await noteDatabase.initialize();
      const note = await noteDatabase.getDailyNote(date);
      return note;
    } catch (error) {
      console.error('[Note IPC] 获取每日笔记失败:', error);
      throw error;
    }
  });

  // 创建每日笔记
  ipcMain.handle('note:createDailyNote', async (_event, date: string, template?: string) => {
    try {
      await noteDatabase.initialize();
      const note = await noteDatabase.createDailyNote(date, template);
      return note;
    } catch (error) {
      console.error('[Note IPC] 创建每日笔记失败:', error);
      throw error;
    }
  });

  // ==================== 收藏功能 ====================

  // 获取收藏的笔记
  ipcMain.handle('note:getFavorites', async () => {
    try {
      await noteDatabase.initialize();
      const notes = await noteDatabase.getFavorites();
      return notes;
    } catch (error) {
      console.error('[Note IPC] 获取收藏笔记失败:', error);
      throw error;
    }
  });

  // 切换收藏状态
  ipcMain.handle('note:toggleFavorite', async (_event, id: string) => {
    try {
      await noteDatabase.initialize();
      const newStatus = await noteDatabase.toggleFavorite(id);
      return newStatus;
    } catch (error) {
      console.error('[Note IPC] 切换收藏状态失败:', error);
      throw error;
    }
  });

  // 根据标题获取笔记
  ipcMain.handle('note:getByTitle', async (_event, title: string) => {
    try {
      await noteDatabase.initialize();
      const note = await noteDatabase.getNoteByTitle(title);
      return note;
    } catch (error) {
      console.error('[Note IPC] 根据标题获取笔记失败:', error);
      throw error;
    }
  });

  console.log('[Note IPC] 笔记 IPC 处理器已注册');
}
