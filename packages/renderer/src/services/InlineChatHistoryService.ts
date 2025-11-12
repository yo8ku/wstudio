/**
 * InlineChatHistoryService.ts
 * 内联聊天历史服务
 * 封装与主进程的 IPC 通信，管理内联聊天历史数据
 */

/**
 * 内联聊天消息接口
 */
export interface InlineChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string;
}

/**
 * 内联聊天会话接口
 */
export interface InlineChatSession {
  id: string;
  fileUri: string;
  lineNumber: number;
  title: string;
  context?: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

/**
 * 查询选项
 */
export interface InlineChatQuery {
  sessionId?: string;
  fileUri?: string;
  lineNumber?: number;
  limit?: number;
  offset?: number;
}

/**
 * IPC 响应接口
 */
interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 内联聊天历史服务类
 */
class InlineChatHistoryService {
  private static instance: InlineChatHistoryService;
  private initialized = false;

  private constructor() {}

  /**
   * 获取服务单例实例
   */
  public static getInstance(): InlineChatHistoryService {
    if (!InlineChatHistoryService.instance) {
      InlineChatHistoryService.instance = new InlineChatHistoryService();
    }
    return InlineChatHistoryService.instance;
  }

  /**
   * 获取 IPC Renderer
   */
  private getIPC() {
    const ipc = (window as Window & { electron?: { ipcRenderer: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> } } }).electron?.ipcRenderer;
    if (!ipc) {
      throw new Error('IPC Renderer 不可用');
    }
    return ipc;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[InlineChatHistoryService] 数据库已初始化，跳过');
      return;
    }

    try {
      console.log('[InlineChatHistoryService] 开始初始化数据库...');
      const ipc = this.getIPC();
      console.log('[InlineChatHistoryService] IPC 可用，调用 inline-chat-history:init');
      
      const response = await ipc.invoke('inline-chat-history:init') as IPCResponse;
      console.log('[InlineChatHistoryService] 收到响应:', response);
      
      if (!response.success) {
        const errorMsg = response.error || '初始化失败';
        console.error('[InlineChatHistoryService] 初始化失败，响应:', response);
        throw new Error(errorMsg);
      }
      
      this.initialized = true;
      console.log('[InlineChatHistoryService] 数据库初始化成功');
    } catch (error) {
      console.error('[InlineChatHistoryService] 初始化失败:', error);
      console.error('[InlineChatHistoryService] 错误详情:', error instanceof Error ? error.message : String(error));
      console.error('[InlineChatHistoryService] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
      throw error;
    }
  }

  /**
   * 创建新会话
   */
  async createSession(
    session: Omit<InlineChatSession, 'createdAt' | 'updatedAt' | 'messageCount'>
  ): Promise<InlineChatSession> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:create-session', session) as IPCResponse<InlineChatSession>;
      
      if (!response.success || !response.data) {
        throw new Error(response.error || '创建会话失败');
      }
      
      return response.data;
    } catch (error) {
      console.error('[InlineChatHistoryService] 创建会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话详情
   */
  async getSession(sessionId: string): Promise<InlineChatSession | null> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:get-session', sessionId) as IPCResponse<InlineChatSession | null>;
      
      if (!response.success) {
        throw new Error(response.error || '获取会话失败');
      }
      
      return response.data || null;
    } catch (error) {
      console.error('[InlineChatHistoryService] 获取会话失败:', error);
      throw error;
    }
  }

  /**
   * 查询会话列表
   */
  async querySessions(query: InlineChatQuery = {}): Promise<InlineChatSession[]> {
    try {
      console.log('[InlineChatHistoryService] 开始查询会话列表，参数:', query);
      
      if (!this.initialized) {
        console.warn('[InlineChatHistoryService] 数据库未初始化，先执行初始化');
        await this.initialize();
      }
      
      const ipc = this.getIPC();
      console.log('[InlineChatHistoryService] 调用 inline-chat-history:query-sessions');
      
      const response = await ipc.invoke('inline-chat-history:query-sessions', query) as IPCResponse<InlineChatSession[]>;
      console.log('[InlineChatHistoryService] 收到响应:', response);
      
      if (!response.success) {
        const errorMsg = response.error || '查询会话列表失败';
        console.error('[InlineChatHistoryService] 查询失败，响应:', response);
        throw new Error(errorMsg);
      }
      
      const sessions = response.data || [];
      console.log('[InlineChatHistoryService] 查询成功，返回', sessions.length, '个会话');
      return sessions;
    } catch (error) {
      console.error('[InlineChatHistoryService] 查询会话列表失败:', error);
      console.error('[InlineChatHistoryService] 错误详情:', error instanceof Error ? error.message : String(error));
      console.error('[InlineChatHistoryService] 错误堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
      throw error;
    }
  }

  /**
   * 更新会话
   */
  async updateSession(
    sessionId: string,
    updates: Partial<Pick<InlineChatSession, 'title' | 'context'>>
  ): Promise<void> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:update-session', sessionId, updates) as IPCResponse;
      
      if (!response.success) {
        throw new Error(response.error || '更新会话失败');
      }
    } catch (error) {
      console.error('[InlineChatHistoryService] 更新会话失败:', error);
      throw error;
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:delete-session', sessionId) as IPCResponse;
      
      if (!response.success) {
        throw new Error(response.error || '删除会话失败');
      }
    } catch (error) {
      console.error('[InlineChatHistoryService] 删除会话失败:', error);
      throw error;
    }
  }

  /**
   * 添加消息到会话
   */
  async addMessage(message: Omit<InlineChatMessage, 'timestamp'>): Promise<InlineChatMessage> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:add-message', message) as IPCResponse<InlineChatMessage>;
      
      if (!response.success || !response.data) {
        throw new Error(response.error || '添加消息失败');
      }
      
      return response.data;
    } catch (error) {
      console.error('[InlineChatHistoryService] 添加消息失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话的消息列表
   */
  async getMessages(sessionId: string, limit?: number, offset?: number): Promise<InlineChatMessage[]> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:get-messages', sessionId, limit, offset) as IPCResponse<InlineChatMessage[]>;
      
      if (!response.success) {
        throw new Error(response.error || '获取消息列表失败');
      }
      
      return response.data || [];
    } catch (error) {
      console.error('[InlineChatHistoryService] 获取消息列表失败:', error);
      throw error;
    }
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageId: string): Promise<void> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:delete-message', messageId) as IPCResponse;
      
      if (!response.success) {
        throw new Error(response.error || '删除消息失败');
      }
    } catch (error) {
      console.error('[InlineChatHistoryService] 删除消息失败:', error);
      throw error;
    }
  }

  /**
   * 清空指定文件的所有会话历史
   */
  async clearFileHistory(fileUri: string): Promise<void> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:clear-file-history', fileUri) as IPCResponse;
      
      if (!response.success) {
        throw new Error(response.error || '清空文件历史失败');
      }
    } catch (error) {
      console.error('[InlineChatHistoryService] 清空文件历史失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{ totalSessions: number; totalMessages: number }> {
    try {
      const ipc = this.getIPC();
      const response = await ipc.invoke('inline-chat-history:get-statistics') as IPCResponse<{ totalSessions: number; totalMessages: number }>;
      
      if (!response.success || !response.data) {
        throw new Error(response.error || '获取统计信息失败');
      }
      
      return response.data;
    } catch (error) {
      console.error('[InlineChatHistoryService] 获取统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 生成会话ID（基于文件URI和时间戳）
   */
  generateSessionId(fileUri: string): string {
    return `inline-chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成消息ID
   */
  generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 格式化会话标题（基于文件名和行号）
   */
  formatSessionTitle(fileUri: string, lineNumber: number): string {
    const fileName = fileUri.split('/').pop() || fileUri.split('\\').pop() || 'unknown';
    return `${fileName} (Line ${lineNumber})`;
  }
}

// 导出单例实例
export const inlineChatHistoryService = InlineChatHistoryService.getInstance();



