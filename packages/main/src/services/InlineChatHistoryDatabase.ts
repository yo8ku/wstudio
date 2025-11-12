/**
 * InlineChatHistoryDatabase.ts
 * 内联聊天历史数据库服务
 * 管理编辑器内联 AI 聊天的历史对话记录
 * 使用 sql.js 实现 SQLite 数据库存储
 */

import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 内联聊天消息接口定义
 */
export interface InlineChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string; // 深度推理内容（仅 assistant 角色）
}

/**
 * 内联聊天会话接口定义
 */
export interface InlineChatSession {
  id: string;
  fileUri: string; // 文件路径/URI
  lineNumber: number; // 触发聊天的行号
  title: string; // 会话标题（可选，默认为文件名+行号）
  context?: string; // 上下文代码片段
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
 * 内联聊天历史数据库管理类
 */
export class InlineChatHistoryDatabase {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;

  constructor() {
    // 数据库文件路径：用户数据目录/inline-chat-history.db
    const userDataPath = app.getPath('userData');
    this.dbPath = path.join(userDataPath, 'inline-chat-history.db');
    console.log('[InlineChatHistoryDatabase] 数据库路径:', this.dbPath);
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }
    this.initializing = this.initialize();
    await this.initializing;
    this.initializing = null;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // 初始化 sql.js
      this.SQL = await initSqlJs({
        locateFile: (file) => {
          // 在开发环境和打包环境中查找 wasm 文件
          const possiblePaths = [
            path.join(__dirname, '../../node_modules/sql.js/dist/', file),
            path.join(process.resourcesPath || '', 'node_modules/sql.js/dist/', file),
            path.join(__dirname, '../../../node_modules/sql.js/dist/', file),
          ];

          for (const wasmPath of possiblePaths) {
            if (fs.existsSync(wasmPath)) {
              console.log('[InlineChatHistoryDatabase] 找到 wasm 文件:', wasmPath);
              return wasmPath;
            }
          }

          console.warn('[InlineChatHistoryDatabase] 未找到 wasm 文件，使用默认路径');
          return file;
        }
      });

      // 检查数据库文件是否存在
      const dbExists = fs.existsSync(this.dbPath);

      if (dbExists) {
        // 加载现有数据库
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        // 创建新数据库
        this.db = new this.SQL.Database();
        await this.createTables();
        this.save();
      }

      // 创建索引提高查询性能
      await this.createIndexes();

      // 运行数据库迁移
      await this.runMigrations();

      this.initialized = true;
      console.log('[InlineChatHistoryDatabase] 数据库初始化成功:', this.dbPath);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 数据库初始化失败:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    // 创建会话表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS inline_chat_sessions (
        id TEXT PRIMARY KEY,
        fileUri TEXT NOT NULL,
        lineNumber INTEGER NOT NULL,
        title TEXT NOT NULL,
        context TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // 创建消息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS inline_chat_messages (
        id TEXT PRIMARY KEY,
        sessionId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        model TEXT,
        timestamp INTEGER NOT NULL,
        reasoning TEXT,
        FOREIGN KEY (sessionId) REFERENCES inline_chat_sessions(id) ON DELETE CASCADE
      )
    `);

    this.save();
    console.log('[InlineChatHistoryDatabase] 数据表创建成功');
  }

  /**
   * 创建索引
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 为会话表创建索引
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_fileUri ON inline_chat_sessions(fileUri)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_updatedAt ON inline_chat_sessions(updatedAt)');
      
      // 为消息表创建索引
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_sessionId ON inline_chat_messages(sessionId)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON inline_chat_messages(timestamp)');
      
      this.save();
      console.log('[InlineChatHistoryDatabase] 索引创建成功');
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 索引创建失败:', error);
    }
  }

  /**
   * 运行数据库迁移
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 检查是否存在版本表
      const versionTableExists = this.db.exec(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='db_version'
      `);

      if (versionTableExists.length === 0) {
        // 创建版本表
        this.db.run(`
          CREATE TABLE db_version (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
          )
        `);
        // 插入初始版本
        this.db.run('INSERT INTO db_version (version, applied_at) VALUES (1, ?)', [Date.now()]);
        this.save();
      }

      // 获取当前版本
      const result = this.db.exec('SELECT MAX(version) as version FROM db_version');
      const currentVersion = result[0]?.values[0]?.[0] as number || 0;

      console.log('[InlineChatHistoryDatabase] 当前数据库版本:', currentVersion);

      // 未来可以在这里添加版本迁移逻辑
      // if (currentVersion < 2) {
      //   // 执行版本 2 的迁移
      // }
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 数据库迁移失败:', error);
    }
  }

  /**
   * 保存数据库到文件
   */
  private save(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      
      // 确保目录存在
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 保存数据库失败:', error);
      throw error;
    }
  }

  /**
   * 创建新会话
   */
  async createSession(session: Omit<InlineChatSession, 'createdAt' | 'updatedAt' | 'messageCount'>): Promise<InlineChatSession> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const now = Date.now();
    const newSession: InlineChatSession = {
      ...session,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };

    try {
      this.db.run(
        `INSERT INTO inline_chat_sessions (id, fileUri, lineNumber, title, context, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newSession.id, newSession.fileUri, newSession.lineNumber, newSession.title, newSession.context || null, newSession.createdAt, newSession.updatedAt]
      );
      
      this.save();
      console.log('[InlineChatHistoryDatabase] 创建会话成功:', newSession.id);
      return newSession;
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 创建会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话详情
   */
  async getSession(sessionId: string): Promise<InlineChatSession | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const result = this.db.exec(
        `SELECT s.*, COUNT(m.id) as messageCount
         FROM inline_chat_sessions s
         LEFT JOIN inline_chat_messages m ON s.id = m.sessionId
         WHERE s.id = ?
         GROUP BY s.id`,
        [sessionId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return null;
      }

      const row = result[0].values[0];
      const columns = result[0].columns;

      return {
        id: row[columns.indexOf('id')] as string,
        fileUri: row[columns.indexOf('fileUri')] as string,
        lineNumber: row[columns.indexOf('lineNumber')] as number,
        title: row[columns.indexOf('title')] as string,
        context: row[columns.indexOf('context')] as string | undefined,
        createdAt: row[columns.indexOf('createdAt')] as number,
        updatedAt: row[columns.indexOf('updatedAt')] as number,
        messageCount: row[columns.indexOf('messageCount')] as number,
      };
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 获取会话失败:', error);
      throw error;
    }
  }

  /**
   * 查询会话列表
   */
  async querySessions(query: InlineChatQuery = {}): Promise<InlineChatSession[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      let sql = `
        SELECT s.*, COUNT(m.id) as messageCount
        FROM inline_chat_sessions s
        LEFT JOIN inline_chat_messages m ON s.id = m.sessionId
      `;
      const params: (string | number)[] = [];

      // 添加过滤条件
      const conditions: string[] = [];
      if (query.fileUri) {
        conditions.push('s.fileUri = ?');
        params.push(query.fileUri);
      }
      if (query.lineNumber !== undefined) {
        conditions.push('s.lineNumber = ?');
        params.push(query.lineNumber);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' GROUP BY s.id ORDER BY s.updatedAt DESC';

      // 添加分页
      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }
      if (query.offset) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }

      const result = this.db.exec(sql, params);

      if (result.length === 0) {
        return [];
      }

      const columns = result[0].columns;
      return result[0].values.map(row => ({
        id: row[columns.indexOf('id')] as string,
        fileUri: row[columns.indexOf('fileUri')] as string,
        lineNumber: row[columns.indexOf('lineNumber')] as number,
        title: row[columns.indexOf('title')] as string,
        context: row[columns.indexOf('context')] as string | undefined,
        createdAt: row[columns.indexOf('createdAt')] as number,
        updatedAt: row[columns.indexOf('updatedAt')] as number,
        messageCount: row[columns.indexOf('messageCount')] as number,
      }));
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 查询会话列表失败:', error);
      throw error;
    }
  }

  /**
   * 更新会话
   */
  async updateSession(sessionId: string, updates: Partial<Pick<InlineChatSession, 'title' | 'context'>>): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const setClauses: string[] = [];
      const params: (string | number)[] = [];

      if (updates.title !== undefined) {
        setClauses.push('title = ?');
        params.push(updates.title);
      }
      if (updates.context !== undefined) {
        setClauses.push('context = ?');
        params.push(updates.context);
      }

      if (setClauses.length === 0) {
        return;
      }

      setClauses.push('updatedAt = ?');
      params.push(Date.now());
      params.push(sessionId);

      this.db.run(
        `UPDATE inline_chat_sessions SET ${setClauses.join(', ')} WHERE id = ?`,
        params
      );

      this.save();
      console.log('[InlineChatHistoryDatabase] 更新会话成功:', sessionId);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 更新会话失败:', error);
      throw error;
    }
  }

  /**
   * 删除会话（同时删除关联的消息）
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('DELETE FROM inline_chat_sessions WHERE id = ?', [sessionId]);
      this.save();
      console.log('[InlineChatHistoryDatabase] 删除会话成功:', sessionId);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 删除会话失败:', error);
      throw error;
    }
  }

  /**
   * 添加消息到会话
   */
  async addMessage(message: Omit<InlineChatMessage, 'timestamp'>): Promise<InlineChatMessage> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const now = Date.now();
    const newMessage: InlineChatMessage = {
      ...message,
      timestamp: now,
    };

    try {
      this.db.run(
        `INSERT INTO inline_chat_messages (id, sessionId, role, content, model, timestamp, reasoning)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newMessage.id, newMessage.sessionId, newMessage.role, newMessage.content, newMessage.model || null, newMessage.timestamp, newMessage.reasoning || null]
      );

      // 更新会话的 updatedAt
      this.db.run(
        'UPDATE inline_chat_sessions SET updatedAt = ? WHERE id = ?',
        [now, message.sessionId]
      );

      this.save();
      console.log('[InlineChatHistoryDatabase] 添加消息成功:', newMessage.id);
      return newMessage;
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 添加消息失败:', error);
      throw error;
    }
  }

  /**
   * 查询会话的消息列表
   */
  async getMessages(sessionId: string, limit?: number, offset?: number): Promise<InlineChatMessage[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      let sql = `
        SELECT * FROM inline_chat_messages
        WHERE sessionId = ?
        ORDER BY timestamp ASC
      `;
      const params: (string | number)[] = [sessionId];

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }
      if (offset) {
        sql += ' OFFSET ?';
        params.push(offset);
      }

      const result = this.db.exec(sql, params);

      if (result.length === 0) {
        return [];
      }

      const columns = result[0].columns;
      return result[0].values.map(row => ({
        id: row[columns.indexOf('id')] as string,
        sessionId: row[columns.indexOf('sessionId')] as string,
        role: row[columns.indexOf('role')] as 'user' | 'assistant',
        content: row[columns.indexOf('content')] as string,
        model: row[columns.indexOf('model')] as string | undefined,
        timestamp: row[columns.indexOf('timestamp')] as number,
        reasoning: row[columns.indexOf('reasoning')] as string | undefined,
      }));
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 获取消息列表失败:', error);
      throw error;
    }
  }

  /**
   * 删除消息
   */
  async deleteMessage(messageId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('DELETE FROM inline_chat_messages WHERE id = ?', [messageId]);
      this.save();
      console.log('[InlineChatHistoryDatabase] 删除消息成功:', messageId);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 删除消息失败:', error);
      throw error;
    }
  }

  /**
   * 清空指定文件的所有会话
   */
  async clearFileHistory(fileUri: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('DELETE FROM inline_chat_sessions WHERE fileUri = ?', [fileUri]);
      this.save();
      console.log('[InlineChatHistoryDatabase] 清空文件历史成功:', fileUri);
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 清空文件历史失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStatistics(): Promise<{ totalSessions: number; totalMessages: number }> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const sessionResult = this.db.exec('SELECT COUNT(*) as count FROM inline_chat_sessions');
      const messageResult = this.db.exec('SELECT COUNT(*) as count FROM inline_chat_messages');

      const totalSessions = sessionResult[0]?.values[0]?.[0] as number || 0;
      const totalMessages = messageResult[0]?.values[0]?.[0] as number || 0;

      return {
        totalSessions,
        totalMessages,
      };
    } catch (error) {
      console.error('[InlineChatHistoryDatabase] 获取统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[InlineChatHistoryDatabase] 数据库连接已关闭');
    }
  }
}

// 导出单例实例
export const inlineChatHistoryDatabase = new InlineChatHistoryDatabase();

