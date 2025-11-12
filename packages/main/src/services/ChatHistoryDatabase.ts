/**
 * ChatHistoryDatabase.ts
 * AI聊天历史数据库服务
 * 使用 sql.js 实现 SQLite 数据库存储
 */

import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 聊天消息接口定义
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: number;
  reasoning?: string; // 深度推理内容（仅 assistant 角色）
}

// 聊天会话接口定义
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
}

// 查询选项
export interface ChatQuery {
  sessionId?: string;
  limit?: number;
  offset?: number;
}

/**
 * 聊天历史数据库管理类
 */
export class ChatHistoryDatabase {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;

  constructor() {
    // 数据库文件路径：用户数据目录/chat-history.db
    this.dbPath = path.join(app.getPath('userData'), 'chat-history.db');
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) return this.initializing;
    
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
              console.log('[ChatHistoryDatabase] 找到 wasm 文件:', wasmPath);
              return wasmPath;
            }
          }

          console.warn('[ChatHistoryDatabase] 未找到 wasm 文件，使用默认路径');
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
      console.log('[ChatHistoryDatabase] 数据库初始化成功:', this.dbPath);
    } catch (error) {
      console.error('[ChatHistoryDatabase] 数据库初始化失败:', error);
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
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // 创建消息表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        timestamp INTEGER NOT NULL,
        reasoning TEXT,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );
    `);

    console.log('[ChatHistoryDatabase] 数据库表创建成功');
  }

  /**
   * 运行数据库迁移（添加新列等）
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 检查 reasoning 列是否存在
      const result = this.db.exec("PRAGMA table_info(chat_messages)");
      const columns = result[0]?.values.map((row: any[]) => row[1]) || [];
      
      if (!columns.includes('reasoning')) {
        console.log('[ChatHistoryDatabase] 迁移：添加 reasoning 列');
        this.db.run('ALTER TABLE chat_messages ADD COLUMN reasoning TEXT');
        this.save();
      }
    } catch (error) {
      console.error('[ChatHistoryDatabase] 数据库迁移失败:', error);
    }
  }

  /**
   * 创建索引提高查询性能
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_session_id ON chat_messages(session_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON chat_messages(timestamp)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON chat_sessions(updated_at)');
    } catch (error) {
      console.error('[ChatHistoryDatabase] 创建索引失败:', error);
    }
  }

  /**
   * 保存数据库到文件
   */
  private save(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, data);
    } catch (error) {
      console.error('[ChatHistoryDatabase] 保存数据库失败:', error);
    }
  }

  /**
   * 创建新会话
   */
  async createSession(session: Omit<ChatSession, 'messageCount'>): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run(
        'INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [session.id, session.title, session.createdAt, session.updatedAt]
      );
      this.save();
    } catch (error) {
      console.error('[ChatHistoryDatabase] 创建会话失败:', error);
      throw error;
    }
  }

  /**
   * 更新会话
   */
  async updateSession(id: string, title: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const now = Date.now();
      this.db.run(
        'UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?',
        [title, now, id]
      );
      this.save();
    } catch (error) {
      console.error('[ChatHistoryDatabase] 更新会话失败:', error);
      throw error;
    }
  }

  /**
   * 删除会话（会自动删除关联的消息）
   */
  async deleteSession(id: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('DELETE FROM chat_sessions WHERE id = ?', [id]);
      this.save();
    } catch (error) {
      console.error('[ChatHistoryDatabase] 删除会话失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有会话列表
   */
  async getSessions(): Promise<ChatSession[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const result = this.db.exec(`
        SELECT 
          s.id,
          s.title,
          s.created_at,
          s.updated_at,
          COUNT(m.id) as message_count
        FROM chat_sessions s
        LEFT JOIN chat_messages m ON s.id = m.session_id
        GROUP BY s.id
        ORDER BY s.updated_at DESC
      `);

      if (result.length === 0) return [];

      const sessions: ChatSession[] = [];
      const columns = result[0].columns;
      const values = result[0].values;

      for (const row of values) {
        const session: ChatSession = {
          id: row[columns.indexOf('id')] as string,
          title: row[columns.indexOf('title')] as string,
          createdAt: row[columns.indexOf('created_at')] as number,
          updatedAt: row[columns.indexOf('updated_at')] as number,
          messageCount: row[columns.indexOf('message_count')] as number,
        };
        sessions.push(session);
      }

      return sessions;
    } catch (error) {
      console.error('[ChatHistoryDatabase] 获取会话列表失败:', error);
      return [];
    }
  }

  /**
   * 添加消息到会话
   */
  async addMessage(message: ChatMessage): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run(
        'INSERT INTO chat_messages (id, session_id, role, content, model, timestamp, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [message.id, message.sessionId, message.role, message.content, message.model || null, message.timestamp, message.reasoning || null]
      );

      // 更新会话的 updated_at 时间
      this.db.run(
        'UPDATE chat_sessions SET updated_at = ? WHERE id = ?',
        [message.timestamp, message.sessionId]
      );

      this.save();
    } catch (error) {
      console.error('[ChatHistoryDatabase] 添加消息失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话的所有消息
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const result = this.db.exec(
        'SELECT id, session_id, role, content, model, timestamp, reasoning FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC',
        [sessionId]
      );

      if (result.length === 0) return [];

      const messages: ChatMessage[] = [];
      const columns = result[0].columns;
      const values = result[0].values;

      for (const row of values) {
        const message: ChatMessage = {
          id: row[columns.indexOf('id')] as string,
          sessionId: row[columns.indexOf('session_id')] as string,
          role: row[columns.indexOf('role')] as 'user' | 'assistant',
          content: row[columns.indexOf('content')] as string,
          model: row[columns.indexOf('model')] as string | undefined,
          timestamp: row[columns.indexOf('timestamp')] as number,
          reasoning: row[columns.indexOf('reasoning')] as string | undefined,
        };
        messages.push(message);
      }

      return messages;
    } catch (error) {
      console.error('[ChatHistoryDatabase] 获取消息失败:', error);
      return [];
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('DELETE FROM chat_messages');
      this.db.run('DELETE FROM chat_sessions');
      this.save();
    } catch (error) {
      console.error('[ChatHistoryDatabase] 清空数据失败:', error);
      throw error;
    }
  }
}

// 单例模式
let instance: ChatHistoryDatabase | null = null;

export function getChatHistoryDatabase(): ChatHistoryDatabase {
  if (!instance) {
    instance = new ChatHistoryDatabase();
  }
  return instance;
}

