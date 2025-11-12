/**
 * inlineChatHistoryHandlers.ts
 * 内联聊天历史IPC处理器
 */

import { ipcMain } from 'electron';
import { inlineChatHistoryDatabase, InlineChatMessage, InlineChatSession, InlineChatQuery } from '../services/InlineChatHistoryDatabase';

// 防止重复注册的标志
let isRegistered = false;

/**
 * 注册内联聊天历史相关的IPC处理器
 */
export function registerInlineChatHistoryHandlers(): void {
  // 防止重复注册
  if (isRegistered) {
    console.log('[IPC] 内联聊天历史处理器已注册，跳过重复注册');
    return;
  }

  console.log('[IPC] 注册内联聊天历史处理器...');

  // 清理旧的处理器
  const handlersToRemove = [
    'inline-chat-history:init',
    'inline-chat-history:create-session',
    'inline-chat-history:get-session',
    'inline-chat-history:query-sessions',
    'inline-chat-history:update-session',
    'inline-chat-history:delete-session',
    'inline-chat-history:add-message',
    'inline-chat-history:get-messages',
    'inline-chat-history:delete-message',
    'inline-chat-history:clear-file-history',
    'inline-chat-history:get-statistics'
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
  ipcMain.handle('inline-chat-history:init', async () => {
    try {
      await inlineChatHistoryDatabase.initialize();
      return { success: true };
    } catch (error) {
      console.error('[IPC] 初始化内联聊天历史数据库失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 创建新会话
  ipcMain.handle('inline-chat-history:create-session', async (event, session: Omit<InlineChatSession, 'createdAt' | 'updatedAt' | 'messageCount'>) => {
    try {
      const newSession = await inlineChatHistoryDatabase.createSession(session);
      return { success: true, data: newSession };
    } catch (error) {
      console.error('[IPC] 创建内联聊天会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取会话详情
  ipcMain.handle('inline-chat-history:get-session', async (event, sessionId: string) => {
    try {
      const session = await inlineChatHistoryDatabase.getSession(sessionId);
      return { success: true, data: session };
    } catch (error) {
      console.error('[IPC] 获取内联聊天会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 查询会话列表
  ipcMain.handle('inline-chat-history:query-sessions', async (event, query: InlineChatQuery = {}) => {
    try {
      const sessions = await inlineChatHistoryDatabase.querySessions(query);
      return { success: true, data: sessions };
    } catch (error) {
      console.error('[IPC] 查询内联聊天会话列表失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 更新会话
  ipcMain.handle('inline-chat-history:update-session', async (event, sessionId: string, updates: Partial<Pick<InlineChatSession, 'title' | 'context'>>) => {
    try {
      await inlineChatHistoryDatabase.updateSession(sessionId, updates);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 更新内联聊天会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 删除会话
  ipcMain.handle('inline-chat-history:delete-session', async (event, sessionId: string) => {
    try {
      await inlineChatHistoryDatabase.deleteSession(sessionId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 删除内联聊天会话失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 添加消息
  ipcMain.handle('inline-chat-history:add-message', async (event, message: Omit<InlineChatMessage, 'timestamp'>) => {
    try {
      const newMessage = await inlineChatHistoryDatabase.addMessage(message);
      return { success: true, data: newMessage };
    } catch (error) {
      console.error('[IPC] 添加内联聊天消息失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取会话消息
  ipcMain.handle('inline-chat-history:get-messages', async (event, sessionId: string, limit?: number, offset?: number) => {
    try {
      const messages = await inlineChatHistoryDatabase.getMessages(sessionId, limit, offset);
      return { success: true, data: messages };
    } catch (error) {
      console.error('[IPC] 获取内联聊天消息列表失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 删除消息
  ipcMain.handle('inline-chat-history:delete-message', async (event, messageId: string) => {
    try {
      await inlineChatHistoryDatabase.deleteMessage(messageId);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 删除内联聊天消息失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 清空指定文件的所有会话历史
  ipcMain.handle('inline-chat-history:clear-file-history', async (event, fileUri: string) => {
    try {
      await inlineChatHistoryDatabase.clearFileHistory(fileUri);
      return { success: true };
    } catch (error) {
      console.error('[IPC] 清空文件内联聊天历史失败:', error);
      return { success: false, error: String(error) };
    }
  });

  // 获取数据库统计信息
  ipcMain.handle('inline-chat-history:get-statistics', async () => {
    try {
      const statistics = await inlineChatHistoryDatabase.getStatistics();
      return { success: true, data: statistics };
    } catch (error) {
      console.error('[IPC] 获取内联聊天历史统计信息失败:', error);
      return { success: false, error: String(error) };
    }
  });

  console.log('[IPC] 内联聊天历史处理器注册完成');
}
