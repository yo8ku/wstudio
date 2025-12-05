/**
 * snippetHandlers.ts
 * IPC 处理器 - 处理渲染进程的片段数据库请求
 */

import { ipcMain } from 'electron';
import { getSnippetDatabase, Snippet, SnippetQuery } from '../services/SnippetDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册片段相关的 IPC 处理器
 */
export function registerSnippetHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'snippet:initialize', 'snippet:add', 'snippet:update', 'snippet:delete',
    'snippet:get', 'snippet:getAll', 'snippet:query', 'snippet:close'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }
  
  isRegistered = true;
  
  const db = getSnippetDatabase();

  // 初始化数据库
  ipcMain.handle('snippet:initialize', async () => {
    try {
      await db.initialize();
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to initialize snippet database:', error);
      return { success: false, error: error.message };
    }
  });

  // 添加片段
  ipcMain.handle('snippet:add', async (_event, snippet: Snippet) => {
    try {
      const id = await db.addSnippet(snippet);
      return { success: true, data: id };
    } catch (error: any) {
      console.error('[IPC] Failed to add snippet:', error);
      return { success: false, error: error.message };
    }
  });

  // 更新片段
  ipcMain.handle('snippet:update', async (_event, id: number, snippet: Partial<Snippet>) => {
    try {
      const success = await db.updateSnippet(id, snippet);
      return { success, data: success };
    } catch (error: any) {
      console.error('[IPC] Failed to update snippet:', error);
      return { success: false, error: error.message };
    }
  });

  // 删除片段
  ipcMain.handle('snippet:delete', async (_event, id: number) => {
    try {
      const success = await db.deleteSnippet(id);
      return { success, data: success };
    } catch (error: any) {
      console.error('[IPC] Failed to delete snippet:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取单个片段
  ipcMain.handle('snippet:get', async (_event, id: number) => {
    try {
      const snippet = await db.getSnippet(id);
      return { success: true, data: snippet };
    } catch (error: any) {
      console.error('[IPC] Failed to get snippet:', error);
      return { success: false, error: error.message };
    }
  });

  // 查询片段
  ipcMain.handle('snippet:query', async (_event, query: SnippetQuery) => {
    try {
      const snippets = await db.querySnippets(query);
      return { success: true, data: snippets };
    } catch (error: any) {
      console.error('[IPC] Failed to query snippets:', error);
      return { success: false, error: error.message };
    }
  });

  // 获取所有片段
  ipcMain.handle('snippet:getAll', async (_event, limit?: number) => {
    try {
      const snippets = await db.getAllSnippets(limit);
      return { success: true, data: snippets };
    } catch (error: any) {
      console.error('[IPC] Failed to get all snippets:', error);
      return { success: false, error: error.message };
    }
  });

  // 批量导入片段
  ipcMain.handle('snippet:import', async (_event, snippets: Snippet[]) => {
    try {
      const count = await db.importSnippets(snippets);
      return { success: true, data: count };
    } catch (error: any) {
      console.error('[IPC] Failed to import snippets:', error);
      return { success: false, error: error.message };
    }
  });

  // 清空所有片段
  ipcMain.handle('snippet:clearAll', async () => {
    try {
      await db.clearAll();
      return { success: true };
    } catch (error: any) {
      console.error('[IPC] Failed to clear snippets:', error);
      return { success: false, error: error.message };
    }
  });
  
  console.log('[Snippet IPC]  所有片段 IPC 处理器已注册');
}

