/**
 * chatHistoryHandlers.ts
 * AI聊天历史IPC处理器
 */

import { ipcMain } from 'electron';
import { getChatHistoryDatabase, ChatMessage, ChatSession } from '../services/ChatHistoryDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册聊天历史相关的IPC处理器
 */
export function registerChatHistoryHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    return;
  }

  // 清理旧的处理器
  const handlersToRemove = [
    'chat-history:init',
    'chat-history:create-session',
    'chat-history:update-session',
    'chat-history:delete-session',
    'chat-history:get-sessions',
    'chat-history:add-message',
    'chat-history:get-messages',
    'chat-history:clear-all'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  isRegistered = true;

  // 初始化数据库
  ipcMain.handle('chat-history:init', async () => {
    try {
      const db = getChatHistoryDatabase();
      await db.initialize();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 初始化聊天历史数据库失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 创建新会话
  ipcMain.handle('chat-history:create-session', async (event, session: Omit<ChatSession, 'messageCount'>) => {
    try {
      const db = getChatHistoryDatabase();
      await db.createSession(session);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 创建会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 更新会话
  ipcMain.handle('chat-history:update-session', async (event, id: string, title: string) => {
    try {
      const db = getChatHistoryDatabase();
      await db.updateSession(id, title);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 更新会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 删除会话
  ipcMain.handle('chat-history:delete-session', async (event, id: string) => {
    try {
      const db = getChatHistoryDatabase();
      await db.deleteSession(id);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 删除会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取所有会话
  ipcMain.handle('chat-history:get-sessions', async () => {
    try {
      const db = getChatHistoryDatabase();
      const sessions = await db.getSessions();
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[IPC] 获取会话列表失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 添加消息
  ipcMain.handle('chat-history:add-message', async (event, message: ChatMessage) => {
    try {
      const db = getChatHistoryDatabase();
      await db.addMessage(message);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 添加消息失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取会话消息
  ipcMain.handle('chat-history:get-messages', async (event, sessionId: string) => {
    try {
      const db = getChatHistoryDatabase();
      const messages = await db.getMessages(sessionId);
      return { success: true, data: messages };
    } catch (error) {
      console.error('[IPC] 获取消息失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 清空所有数据
  ipcMain.handle('chat-history:clear-all', async () => {
    try {
      const db = getChatHistoryDatabase();
      await db.clearAll();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 清空数据失败:', error);
      return { success: false, error: String(error) };
    }
  });

}








