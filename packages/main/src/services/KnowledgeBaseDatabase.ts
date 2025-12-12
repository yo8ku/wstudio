/**
 * KnowledgeBaseDatabase.ts
 * 知识库数据库服务，负责管理知识库元数据
 * 使用 sql.js 实现 SQLite 数据库存储
 */

import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 知识库项接口定义（与前端保持一致）
export interface KnowledgeBaseItem {
  id: string;
  title: string;
  type: 'file' | 'folder';
  group: 'created';
  path?: string;
  parentId?: string; // 父项ID（用于构建树形结构）
  metadata?: string; // JSON 字符串，存储 KnowledgeItemMetadata
  createdAt: number;
  updatedAt: number;
}

/**
 * 知识库数据库管理类
 */
export class KnowledgeBaseDatabase {
  private db: Database | null = null;
  private dbPath: string;
  private SQL: any = null;
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;

  constructor() {
    // 数据库文件路径：用户数据目录/knowledge-base.db
    this.dbPath = path.join(app.getPath('userData'), 'knowledge-base.db');
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
              console.log('[KnowledgeBaseDatabase] 找到 wasm 文件:', wasmPath);
              return wasmPath;
            }
          }

          console.warn('[KnowledgeBaseDatabase] 未找到 wasm 文件，使用默认路径');
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
      console.log('[KnowledgeBaseDatabase] 数据库初始化成功:', this.dbPath);
    } catch (error) {
      console.error('[KnowledgeBaseDatabase] 数据库初始化失败:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS knowledge_base_items (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('file', 'folder')),
        "group" TEXT NOT NULL DEFAULT 'created',
        path TEXT,
        parent_id TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES knowledge_base_items(id) ON DELETE CASCADE
      );
    `;

    this.db.run(createTableSQL);
  }

  /**
   * 创建索引提高查询性能
   */
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 为 parent_id 创建索引（用于查询子项）
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_parent_id ON knowledge_base_items(parent_id);`);
      
      // 为 type 创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_type ON knowledge_base_items(type);`);
      
      // 为 group 创建索引
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_group ON knowledge_base_items("group");`);
      
      this.save();
    } catch (error) {
      console.error('[KnowledgeBaseDatabase] 创建索引失败:', error);
    }
  }

  /**
   * 数据库迁移
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 检查是否需要从 electron-store 迁移数据
      const tableInfo = this.db.exec('PRAGMA table_info(knowledge_base_items)');
      
      if (tableInfo.length > 0) {
        // 表已存在，检查是否需要迁移
        const rowCount = this.db.exec('SELECT COUNT(*) as count FROM knowledge_base_items');
        if (rowCount.length > 0 && rowCount[0].values[0][0] === 0) {
          // 表为空，尝试从 electron-store 迁移数据
          await this.migrateFromElectronStore();
        }
      }
    } catch (error) {
      console.error('[KnowledgeBaseDatabase] 数据库迁移失败:', error);
    }
  }

  /**
   * 从 electron-store 迁移数据
   */
  private async migrateFromElectronStore(): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 尝试读取 electron-store 中的数据
      const StoreModule = await new Function('specifier', 'return import(specifier)')('electron-store');
      const Store = StoreModule.default || StoreModule;
      
      const store = new Store({
        name: 'knowledge-base',
        cwd: app.getPath('userData')
      });

      const oldData = store.get('knowledge-base') as any;
      
      if (oldData && oldData.spaces && Array.isArray(oldData.spaces)) {
        console.log('[KnowledgeBaseDatabase] 开始从 electron-store 迁移数据...');
        
        // 迁移知识库数据
        for (const space of oldData.spaces) {
          await this.migrateKnowledgeBaseItem(space, null);
        }
        
        this.save();
        console.log('[KnowledgeBaseDatabase] 数据迁移完成');
      }
    } catch (error) {
      console.warn('[KnowledgeBaseDatabase] 从 electron-store 迁移数据失败（可能没有旧数据）:', error);
    }
  }

  /**
   * 递归迁移知识库项
   */
  private async migrateKnowledgeBaseItem(item: any, parentId: string | null): Promise<void> {
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const metadata = item.metadata ? JSON.stringify(item.metadata) : null;
      
      // 插入当前项
      this.db.run(
        `INSERT OR IGNORE INTO knowledge_base_items (id, title, type, "group", path, parent_id, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.title || item.name,
          item.type || 'folder',
          'created',
          item.path || null,
          parentId,
          metadata,
          item.metadata?.createdAt ? (item.metadata.createdAt instanceof Date ? item.metadata.createdAt.getTime() : item.metadata.createdAt) : Date.now(),
          Date.now()
        ]
      );

      // 递归迁移子项
      if (item.children && Array.isArray(item.children)) {
        for (const child of item.children) {
          await this.migrateKnowledgeBaseItem(child, item.id);
        }
      }
    } catch (error) {
      console.error('[KnowledgeBaseDatabase] 迁移知识库项失败:', error);
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
      console.error('[KnowledgeBaseDatabase] 保存数据库失败:', error);
    }
  }

  /**
   * 添加知识库项
   */
  async addItem(item: KnowledgeBaseItem): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const metadata = item.metadata ? JSON.stringify(item.metadata) : null;
    
    this.db.run(
      `INSERT INTO knowledge_base_items (id, title, type, "group", path, parent_id, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.title,
        item.type,
        item.group,
        item.path || null,
        item.parentId || null,
        metadata,
        item.createdAt,
        item.updatedAt
      ]
    );

    this.save();
  }

  /**
   * 更新知识库项
   */
  async updateItem(itemId: string, updates: Partial<KnowledgeBaseItem>): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const setClauses: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      setClauses.push('title = ?');
      values.push(updates.title);
    }
    if (updates.path !== undefined) {
      setClauses.push('path = ?');
      values.push(updates.path);
    }
    if (updates.parentId !== undefined) {
      setClauses.push('parent_id = ?');
      values.push(updates.parentId);
    }
    if (updates.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(typeof updates.metadata === 'string' ? updates.metadata : JSON.stringify(updates.metadata));
    }
    
    setClauses.push('updated_at = ?');
    values.push(Date.now());
    
    values.push(itemId);

    if (setClauses.length === 0) {
      return false;
    }

    const sql = `UPDATE knowledge_base_items SET ${setClauses.join(', ')} WHERE id = ?`;
    this.db.run(sql, values);
    this.save();

    return true;
  }

  /**
   * 删除知识库项（级联删除子项）
   */
  async deleteItem(itemId: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    // 由于外键约束设置了 ON DELETE CASCADE，删除父项会自动删除子项
    this.db.run('DELETE FROM knowledge_base_items WHERE id = ?', [itemId]);
    this.save();

    return true;
  }

  /**
   * 根据ID查找知识库项
   */
  async getItem(itemId: string): Promise<KnowledgeBaseItem | null> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const result = this.db.exec('SELECT * FROM knowledge_base_items WHERE id = ?', [itemId]);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const row = result[0].values[0];
    const columns = result[0].columns;
    
    const item: any = {};
    columns.forEach((col: string, index: number) => {
      item[col] = row[index];
    });

    return {
      id: item.id,
      title: item.title,
      type: item.type as 'file' | 'folder',
      group: item.group as 'created',
      path: item.path || undefined,
      parentId: item.parent_id || undefined,
      metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at
    };
  }

  /**
   * 获取所有知识库项（构建树形结构）
   */
  async getAllItems(): Promise<KnowledgeBaseItem[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const result = this.db.exec('SELECT * FROM knowledge_base_items WHERE "group" = ? ORDER BY created_at ASC', ['created']);
    
    if (result.length === 0) {
      return [];
    }

    const items: KnowledgeBaseItem[] = [];
    const columns = result[0].columns;
    
    for (const row of result[0].values) {
      const item: any = {};
      columns.forEach((col: string, index: number) => {
        item[col] = row[index];
      });

      items.push({
        id: item.id,
        title: item.title,
        type: item.type as 'file' | 'folder',
        group: item.group as 'created',
        path: item.path || undefined,
        parentId: item.parent_id || undefined,
        metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      });
    }

    // 构建树形结构
    return this.buildTree(items);
  }

  /**
   * 构建树形结构
   */
  private buildTree(items: KnowledgeBaseItem[]): KnowledgeBaseItem[] {
    const itemMap = new Map<string, KnowledgeBaseItem & { children?: KnowledgeBaseItem[] }>();
    const roots: (KnowledgeBaseItem & { children?: KnowledgeBaseItem[] })[] = [];

    // 创建映射
    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // 构建树
    items.forEach(item => {
      const node = itemMap.get(item.id)!;
      if (item.parentId) {
        const parent = itemMap.get(item.parentId);
        if (parent) {
          if (!parent.children) {
            parent.children = [];
          }
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * 根据父ID获取子项
   */
  async getChildren(parentId: string | null): Promise<KnowledgeBaseItem[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const result = this.db.exec(
      'SELECT * FROM knowledge_base_items WHERE parent_id = ? ORDER BY created_at ASC',
      [parentId || null]
    );
    
    if (result.length === 0) {
      return [];
    }

    const items: KnowledgeBaseItem[] = [];
    const columns = result[0].columns;
    
    for (const row of result[0].values) {
      const item: any = {};
      columns.forEach((col: string, index: number) => {
        item[col] = row[index];
      });

      items.push({
        id: item.id,
        title: item.title,
        type: item.type as 'file' | 'folder',
        group: item.group as 'created',
        path: item.path || undefined,
        parentId: item.parent_id || undefined,
        metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      });
    }

    return items;
  }

  /**
   * 搜索知识库项
   */
  async searchItems(query: string): Promise<KnowledgeBaseItem[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    const searchQuery = `%${query}%`;
    const result = this.db.exec(
      'SELECT * FROM knowledge_base_items WHERE title LIKE ? ORDER BY updated_at DESC',
      [searchQuery]
    );
    
    if (result.length === 0) {
      return [];
    }

    const items: KnowledgeBaseItem[] = [];
    const columns = result[0].columns;
    
    for (const row of result[0].values) {
      const item: any = {};
      columns.forEach((col: string, index: number) => {
        item[col] = row[index];
      });

      items.push({
        id: item.id,
        title: item.title,
        type: item.type as 'file' | 'folder',
        group: item.group as 'created',
        path: item.path || undefined,
        parentId: item.parent_id || undefined,
        metadata: item.metadata ? JSON.parse(item.metadata) : undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      });
    }

    return items;
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    this.db.run('DELETE FROM knowledge_base_items');
    this.save();
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// 单例实例
let knowledgeBaseDatabase: KnowledgeBaseDatabase | null = null;

/**
 * 获取知识库数据库实例
 */
export function getKnowledgeBaseDatabase(): KnowledgeBaseDatabase {
  if (!knowledgeBaseDatabase) {
    knowledgeBaseDatabase = new KnowledgeBaseDatabase();
  }
  return knowledgeBaseDatabase;
}



