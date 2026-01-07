/**
 * FormDatabase.ts
 * 表单数据库服务
 * 功能：管理表单和分组的 SQLite 数据存储
 */

import { SQLiteDatabase } from './SQLiteDatabase';

/**
 * 分组数据接口
 */
export interface FormGroup {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  [key: string]: unknown;
}

/**
 * 表单数据接口
 */
export interface FormData {
  id: string;
  name: string;
  groupId: string | null;
  data: string; // JSON 字符串，包含 columns 和 rows
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

/**
 * 表单数据库管理类
 */
export class FormDatabase {
  private db: SQLiteDatabase;
  private initialized: boolean = false;

  constructor() {
    this.db = new SQLiteDatabase('forms.db');
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.db.initialize();
      await this.createTables();
      this.initialized = true;
      console.log('[FormDatabase] 数据库初始化成功');
    } catch (error) {
      console.error('[FormDatabase] 数据库初始化失败:', error);
      throw error;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 创建数据库表
   */
  private async createTables(): Promise<void> {
    // 创建分组表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS form_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        sortOrder INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL
      )
    `);

    // 创建表单表
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS forms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        groupId TEXT,
        data TEXT,
        sortOrder INTEGER DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `);

    // 创建索引
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_form_groups_parentId ON form_groups(parentId)
    `);
    await this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_forms_groupId ON forms(groupId)
    `);
  }

  // ==================== 分组操作 ====================

  /**
   * 创建分组
   */
  async createGroup(name: string, parentId: string | null = null): Promise<FormGroup> {
    await this.ensureInitialized();

    const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // 获取当前最大排序号
    const maxOrder = await this.db.queryOne<{ maxOrder: number }>(
      'SELECT MAX(sortOrder) as maxOrder FROM form_groups WHERE parentId IS ?',
      [parentId]
    );
    const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;

    const group: FormGroup = {
      id,
      name,
      parentId,
      sortOrder,
      createdAt: now,
    };

    await this.db.insert('form_groups', {
      id: group.id,
      name: group.name,
      parentId: group.parentId,
      sortOrder: group.sortOrder,
      createdAt: group.createdAt,
    });

    return group;
  }

  /**
   * 获取所有分组
   */
  async getAllGroups(): Promise<FormGroup[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormGroup>(
      'SELECT * FROM form_groups ORDER BY sortOrder ASC'
    );

    return rows;
  }

  /**
   * 获取指定父级下的分组
   */
  async getGroupsByParent(parentId: string | null): Promise<FormGroup[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormGroup>(
      'SELECT * FROM form_groups WHERE parentId IS ? ORDER BY sortOrder ASC',
      [parentId]
    );

    return rows;
  }

  /**
   * 更新分组
   */
  async updateGroup(id: string, updates: Partial<Pick<FormGroup, 'name' | 'parentId' | 'sortOrder'>>): Promise<boolean> {
    await this.ensureInitialized();

    // 构建 SET 子句
    const fields = Object.keys(updates);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(updates), id];

    // 使用 execute 直接执行 SQL
    await this.db.execute(
      `UPDATE form_groups SET ${setClause} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * 删除分组
   * 同时删除分组中的所有表单和子分组
   */
  async deleteGroup(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // 递归删除子分组
    const childGroups = await this.getGroupsByParent(id);
    for (const child of childGroups) {
      await this.deleteGroup(child.id);
    }

    // 删除该分组下的所有表单（使用原始SQL确保正确执行）
    await this.db.execute('DELETE FROM forms WHERE groupId = ?', [id]);

    // 删除分组（使用原始SQL确保正确执行）
    await this.db.execute('DELETE FROM form_groups WHERE id = ?', [id]);

    return true;
  }

  // ==================== 表单操作 ====================

  /**
   * 创建表单
   */
  async createForm(name: string, groupId: string | null = null, data: string = '{}'): Promise<FormData> {
    await this.ensureInitialized();

    const id = `form-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    // 获取当前最大排序号
    const maxOrder = await this.db.queryOne<{ maxOrder: number }>(
      'SELECT MAX(sortOrder) as maxOrder FROM forms WHERE groupId IS ?',
      [groupId]
    );
    const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;

    const form: FormData = {
      id,
      name,
      groupId,
      data,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert('forms', {
      id: form.id,
      name: form.name,
      groupId: form.groupId,
      data: form.data,
      sortOrder: form.sortOrder,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    });

    return form;
  }

  /**
   * 获取所有表单
   */
  async getAllForms(): Promise<FormData[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormData>(
      'SELECT * FROM forms ORDER BY sortOrder ASC'
    );

    return rows;
  }

  /**
   * 获取指定分组下的表单
   */
  async getFormsByGroup(groupId: string | null): Promise<FormData[]> {
    await this.ensureInitialized();

    const rows = await this.db.query<FormData>(
      'SELECT * FROM forms WHERE groupId IS ? ORDER BY sortOrder ASC',
      [groupId]
    );

    return rows;
  }

  /**
   * 根据ID获取表单
   */
  async getFormById(id: string): Promise<FormData | null> {
    await this.ensureInitialized();

    const row = await this.db.queryOne<FormData>(
      'SELECT * FROM forms WHERE id = ?',
      [id]
    );

    return row;
  }

  /**
   * 更新表单
   */
  async updateForm(id: string, updates: Partial<Pick<FormData, 'name' | 'groupId' | 'data' | 'sortOrder'>>): Promise<boolean> {
    await this.ensureInitialized();

    const updateData = {
      ...updates,
      updatedAt: Date.now(),
    };

    // 构建 SET 子句
    const fields = Object.keys(updateData);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(updateData), id];

    // 使用 execute 直接执行 SQL
    await this.db.execute(
      `UPDATE forms SET ${setClause} WHERE id = ?`,
      values
    );

    return true;
  }

  /**
   * 删除表单
   */
  async deleteForm(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // 使用原始SQL确保正确执行删除
    await this.db.execute('DELETE FROM forms WHERE id = ?', [id]);

    return true;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    this.initialized = false;
  }
}

// 单例实例
let formDatabase: FormDatabase | null = null;

/**
 * 获取表单数据库实例
 */
export function getFormDatabase(): FormDatabase {
  if (!formDatabase) {
    formDatabase = new FormDatabase();
  }
  return formDatabase;
}
