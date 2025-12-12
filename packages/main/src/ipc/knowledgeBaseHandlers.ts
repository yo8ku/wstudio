/**
 * knowledgeBaseHandlers.ts
 * IPC 处理器 - 处理渲染进程的知识库数据库请求
 */

import { ipcMain } from 'electron';
import { getKnowledgeBaseDatabase, KnowledgeBaseItem } from '../services/KnowledgeBaseDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册知识库相关的 IPC 处理器
 */
export function registerKnowledgeBaseHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }
  
  // 移除可能存在的旧处理器（防止热重载时重复注册）
  const handlersToRemove = [
    'knowledge-base:initialize',
    'knowledge-base:add-item',
    'knowledge-base:update-item',
    'knowledge-base:delete-item',
    'knowledge-base:get-item',
    'knowledge-base:get-all-items',
    'knowledge-base:get-children',
    'knowledge-base:search-items',
    'knowledge-base:clear',
    'knowledge-base:close'
  ];
  
  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }
  
  isRegistered = true;
  
  const db = getKnowledgeBaseDatabase();

  // 初始化数据库
  ipcMain.handle('knowledge-base:initialize', async () => {
    try {
      await db.initialize();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 初始化知识库数据库失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 添加知识库项
  ipcMain.handle('knowledge-base:add-item', async (_event, item: KnowledgeBaseItem) => {
    try {
      await db.addItem(item);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 添加知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 更新知识库项
  ipcMain.handle('knowledge-base:update-item', async (_event, itemId: string, updates: Partial<KnowledgeBaseItem>) => {
    try {
      const success = await db.updateItem(itemId, updates);
      return { success, data: success };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 更新知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 删除知识库项
  ipcMain.handle('knowledge-base:delete-item', async (_event, itemId: string) => {
    try {
      const success = await db.deleteItem(itemId);
      return { success, data: success };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 删除知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取知识库项
  ipcMain.handle('knowledge-base:get-item', async (_event, itemId: string) => {
    try {
      const item = await db.getItem(itemId);
      return { success: true, data: item };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 获取知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取所有知识库项
  ipcMain.handle('knowledge-base:get-all-items', async () => {
    try {
      const items = await db.getAllItems();
      return { success: true, data: items };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 获取所有知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 获取子项
  ipcMain.handle('knowledge-base:get-children', async (_event, parentId: string | null) => {
    try {
      const items = await db.getChildren(parentId);
      return { success: true, data: items };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 获取子项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 搜索知识库项
  ipcMain.handle('knowledge-base:search-items', async (_event, query: string) => {
    try {
      const items = await db.searchItems(query);
      return { success: true, data: items };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 搜索知识库项失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 清空所有数据
  ipcMain.handle('knowledge-base:clear', async () => {
    try {
      await db.clear();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 清空知识库失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  // 关闭数据库
  ipcMain.handle('knowledge-base:close', async () => {
    try {
      await db.close();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[IPC] 关闭知识库数据库失败:', error);
      return { success: false, error: errorMessage };
    }
  });

  console.log('[IPC] 知识库 IPC 处理器注册完成');
}











