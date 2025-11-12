/**
 * SnippetDatabase.ts
 * 片段数据库服务，负责管理用户自定义的代码片段
 * 使用 sql.js 实现 SQLite 数据库存储
 */

import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 片段接口定义
export interface Snippet {
  id?: number;
  name: string;          // 片段名称，用于显示和区分片段
  prefix: string;        // 触发前缀（必填），用于自动补全，应该是独一无二的
  body: string;
  description?: string;
  language?: string;
  tags?: string;
}

// 查询选项
export interface SnippetQuery {
  prefix?: string;
  language?: string;
  tags?: string[];
  limit?: number;
}

/**
 * 片段数据库管理类
 */
export class SnippetDatabase {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;

  constructor() {
    // 数据库文件路径：用户数据目录/snippets.db
    this.dbPath = path.join(app.getPath('userData'), 'snippets.db');
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    try {
      // 初始化 sql.js
      this.SQL = await initSqlJs();

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
      
      // 执行数据库迁移
      await this.migrate();
    } catch (error) {
      console.error('[SnippetDatabase] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS snippets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        body TEXT NOT NULL,
        description TEXT,
        language TEXT,
        tags TEXT
      );
    `;

    this.db.run(createTableSQL);
  }

  /**
   * 创建索引提高查询性能
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 为 prefix 创建索引（最常用的搜索字段）
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_prefix ON snippets(prefix);`);
      
      // 为 language 创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_language ON snippets(language);`);
      
      this.save();
    } catch (error) {
      console.error('[SnippetDatabase] Failed to create indexes:', error);
    }
  }

  /**
   * 数据库迁移
   */
  private async migrate(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // 检查是否需要添加 name 字段
      const tableInfo = this.db.exec('PRAGMA table_info(snippets)');
      
      if (tableInfo.length > 0) {
        const columns = tableInfo[0].values.map(row => row[1] as string);
        const hasNameColumn = columns.includes('name');
        
        if (!hasNameColumn) {
          console.log('[SnippetDatabase] 迁移: 添加 name 字段...');
          
          // 添加 name 字段
          this.db.run('ALTER TABLE snippets ADD COLUMN name TEXT');
          
          // 为现有记录设置 name 值（使用 prefix 作为初始值，如果 prefix 为空则使用 "Untitled"）
          this.db.run(`UPDATE snippets SET name = COALESCE(NULLIF(prefix, ''), 'Untitled') WHERE name IS NULL`);
          
          this.save();
          console.log('[SnippetDatabase]  成功添加 name 字段并迁移现有数据');
        }
      }
    } catch (error) {
      console.error('[SnippetDatabase] 数据库迁移失败:', error);
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
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('[SnippetDatabase] Failed to save database:', error);
    }
  }

  /**
   * 添加片段
   */
  async addSnippet(snippet: Snippet): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const stmt = this.db.prepare(
        'INSERT INTO snippets (name, prefix, body, description, language, tags) VALUES (?, ?, ?, ?, ?, ?)'
      );

      stmt.run([
        snippet.name,
        snippet.prefix || null,  // prefix 现在是可选的，可以为空
        snippet.body,
        snippet.description || null,
        snippet.language || null,
        snippet.tags || null,
      ]);

      stmt.free();
      this.save();

      // 获取插入的 ID
      const result = this.db.exec('SELECT last_insert_rowid() as id');
      return result[0].values[0][0] as number;
    } catch (error) {
      console.error('[SnippetDatabase] Failed to add snippet:', error);
      throw error;
    }
  }

  /**
   * 更新片段
   */
  async updateSnippet(id: number, snippet: Partial<Snippet>): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (snippet.name !== undefined) {
        updates.push('name = ?');
        values.push(snippet.name);
      }
      if (snippet.prefix !== undefined) {
        updates.push('prefix = ?');
        values.push(snippet.prefix);
      }
      if (snippet.body !== undefined) {
        updates.push('body = ?');
        values.push(snippet.body);
      }
      if (snippet.description !== undefined) {
        updates.push('description = ?');
        values.push(snippet.description);
      }
      if (snippet.language !== undefined) {
        updates.push('language = ?');
        values.push(snippet.language);
      }
      if (snippet.tags !== undefined) {
        updates.push('tags = ?');
        values.push(snippet.tags);
      }

      if (updates.length === 0) return false;

      values.push(id);
      const sql = `UPDATE snippets SET ${updates.join(', ')} WHERE id = ?`;
      
      this.db.run(sql, values);
      this.save();

      return true;
    } catch (error) {
      console.error('[SnippetDatabase] Failed to update snippet:', error);
      throw error;
    }
  }

  /**
   * 删除片段
   */
  async deleteSnippet(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('DELETE FROM snippets WHERE id = ?', [id]);
      this.save();
      return true;
    } catch (error) {
      console.error('[SnippetDatabase] Failed to delete snippet:', error);
      throw error;
    }
  }

  /**
   * 根据 ID 获取片段
   */
  async getSnippet(id: number): Promise<Snippet | null> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = this.db.exec('SELECT * FROM snippets WHERE id = ?', [id]);
      
      if (!result.length || !result[0].values.length) {
        return null;
      }

      const row = result[0].values[0];
      return this.rowToSnippet(result[0].columns, row);
    } catch (error) {
      console.error('[SnippetDatabase] Failed to get snippet:', error);
      return null;
    }
  }

  /**
   * 查询片段
   */
  async querySnippets(query: SnippetQuery = {}): Promise<Snippet[]> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const conditions: string[] = [];
      const values: any[] = [];

      // 按 prefix 搜索（模糊匹配）
      if (query.prefix) {
        conditions.push('prefix LIKE ?');
        values.push(`%${query.prefix}%`);
      }

      // 按 language 过滤（精确匹配）
      if (query.language) {
        conditions.push('language = ?');
        values.push(query.language);
      }

      // 按 tags 过滤（包含匹配）
      if (query.tags && query.tags.length > 0) {
        const tagConditions = query.tags.map(() => 'tags LIKE ?');
        conditions.push(`(${tagConditions.join(' OR ')})`);
        query.tags.forEach(tag => values.push(`%${tag}%`));
      }

      // 构建 SQL
      let sql = 'SELECT * FROM snippets';
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY prefix ASC';

      // 限制返回数量
      if (query.limit && query.limit > 0) {
        sql += ` LIMIT ${query.limit}`;
      }

      const result = this.db.exec(sql, values);

      if (!result.length) return [];

      return result[0].values.map(row => 
        this.rowToSnippet(result[0].columns, row)
      );
    } catch (error) {
      console.error('[SnippetDatabase] Failed to query snippets:', error);
      return [];
    }
  }

  /**
   * 获取所有片段
   */
  async getAllSnippets(limit?: number): Promise<Snippet[]> {
    return this.querySnippets({ limit });
  }

  /**
   * 批量导入片段
   */
  async importSnippets(snippets: Snippet[]): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    let count = 0;

    try {
      for (const snippet of snippets) {
        await this.addSnippet(snippet);
        count++;
      }
      return count;
    } catch (error) {
      console.error('[SnippetDatabase] Failed to import snippets:', error);
      throw error;
    }
  }

  /**
   * 清空所有片段
   */
  async clearAll(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run('DELETE FROM snippets');
      this.save();
    } catch (error) {
      console.error('[SnippetDatabase] Failed to clear snippets:', error);
      throw error;
    }
  }

  /**
   * 将数据库行转换为 Snippet 对象
   */
  private rowToSnippet(columns: string[], row: any[]): Snippet {
    const snippet: any = {};
    columns.forEach((col, index) => {
      snippet[col] = row[index];
    });
    return snippet as Snippet;
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}

// 单例模式
let instance: SnippetDatabase | null = null;

export function getSnippetDatabase(): SnippetDatabase {
  if (!instance) {
    instance = new SnippetDatabase();
  }
  return instance;
}

