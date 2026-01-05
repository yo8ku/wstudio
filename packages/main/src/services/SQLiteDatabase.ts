/**
 * SQLiteDatabase.ts
 * 通用 SQLite 数据库封装类
 * 提供查询、删除、增加、更新等基础数据库操作功能
 * 使用 sql.js 实现 SQLite 数据库存储
 */

import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// 为 Node.js 环境提供全局对象模拟（防止 sql.js 访问 window 时出错）
if (typeof global !== 'undefined') {
  if (typeof (global as Record<string, unknown>).window === 'undefined') {
    (global as Record<string, unknown>).window = {};
  }
  // 确保 globalThis 也存在 window（某些版本的 sql.js 可能使用 globalThis）
  if (typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window === 'undefined') {
    (globalThis as Record<string, unknown>).window = (global as Record<string, unknown>).window;
  }
}

/**
 * 查询结果行类型
 */
export type QueryResultRow = Record<string, unknown>;

/**
 * 查询选项
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * 更新条件
 */
export interface UpdateCondition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
  value: unknown;
}

/**
 * 将 unknown[] 转换为 SqlValue[]
 * 确保类型安全
 */
function toSqlValues(values: unknown[]): SqlValue[] {
  return values.map(value => {
    // SqlValue 类型：string | number | null | Uint8Array
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      return value;
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    // 对于其他类型，转换为字符串
    return String(value);
  });
}

/**
 * 通用 SQLite 数据库封装类
 */
export class SQLiteDatabase {
  private SQL: SqlJsStatic | null = null;
  private db: Database | null = null;
  private dbPath: string;
  private initialized: boolean = false;
  private initializing: Promise<void> | null = null;

  /**
   * 构造函数
   * @param dbFileName 数据库文件名
   * @param customPath 自定义数据库文件路径（可选，默认使用用户数据目录）
   */
  constructor(dbFileName: string, customPath?: string) {
    if (customPath) {
      this.dbPath = path.join(customPath, dbFileName);
    } else {
      const userDataPath = app.getPath('userData');
      this.dbPath = path.join(userDataPath, dbFileName);
    }
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
      // 初始化 SQL.js
      this.SQL = await initSqlJs({
        locateFile: (file: string) => {
          // 在开发环境和打包环境中查找 wasm 文件
          const possiblePaths = [
            path.join(__dirname, '../../node_modules/sql.js/dist/', file),
            path.join(process.resourcesPath || '', 'node_modules/sql.js/dist/', file),
            path.join(__dirname, '../../../node_modules/sql.js/dist/', file),
            require.resolve(`sql.js/dist/${file}`)
          ];

          for (const wasmPath of possiblePaths) {
            if (fs.existsSync(wasmPath)) {
              console.log('[SQLiteDatabase] 找到 wasm 文件:', wasmPath);
              return wasmPath;
            }
          }

          console.warn('[SQLiteDatabase] 未找到 wasm 文件，使用默认路径');
          return file;
        }
      });

      // 检查数据库文件是否存在
      let dbData: Uint8Array | undefined;
      if (fs.existsSync(this.dbPath)) {
        dbData = fs.readFileSync(this.dbPath);
      }

      // 创建或打开数据库
      this.db = new this.SQL.Database(dbData);

      this.initialized = true;
      console.log('[SQLiteDatabase] 数据库初始化成功:', this.dbPath);
    } catch (error) {
      console.error('[SQLiteDatabase] 数据库初始化失败:', error);
      this.initialized = false;
      throw error;
    }
  }

  /**
   * 保存数据库到文件
   */
  private save(): void {
    if (!this.db) return;

    try {
      // 确保 window 对象存在（防止 sql.js 在导出时访问 window 出错）
      if (typeof global !== 'undefined' && typeof (global as Record<string, unknown>).window === 'undefined') {
        (global as Record<string, unknown>).window = {};
      }
      
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, data);
    } catch (error) {
      console.error('[SQLiteDatabase] 保存数据库失败:', error);
      throw error;
    }
  }

  /**
   * 执行 SQL 语句（不返回结果）
   * @param sql SQL 语句
   * @param params 参数数组
   */
  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run(sql, toSqlValues(params));
      this.save();
    } catch (error) {
      console.error('[SQLiteDatabase] 执行 SQL 失败:', error);
      throw error;
    }
  }

  /**
   * 查询数据
   * @param sql SQL 查询语句
   * @param params 参数数组
   * @returns 查询结果数组
   */
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      // 如果没有参数，直接使用 exec
      if (params.length === 0) {
        const result = this.db.exec(sql);
        
        if (result.length === 0) return [];

        const rows: T[] = [];
        const columns = result[0].columns;
        const values = result[0].values;

        for (const row of values) {
          const rowObj: Record<string, unknown> = {};
          columns.forEach((col, index) => {
            rowObj[col] = row[index];
          });
          rows.push(rowObj as T);
        }

        return rows;
      }

      // 有参数时，使用 prepare 进行参数化查询
      const stmt = this.db.prepare(sql);
      stmt.bind(toSqlValues(params));
      
      const rows: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        rows.push(row as T);
      }
      
      stmt.free();
      return rows;
    } catch (error) {
      console.error('[SQLiteDatabase] 查询失败:', error);
      console.error('[SQLiteDatabase] SQL:', sql);
      console.error('[SQLiteDatabase] 参数:', params);
      throw error;
    }
  }

  /**
   * 查询单条数据
   * @param sql SQL 查询语句
   * @param params 参数数组
   * @returns 查询结果的第一条记录，如果没有则返回 null
   */
  async queryOne<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * 插入数据
   * @param tableName 表名
   * @param data 要插入的数据对象
   * @returns 插入的行数
   */
  async insert(tableName: string, data: Record<string, unknown>): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map(() => '?').join(', ');
      const columns = keys.join(', ');

      const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;
      this.db.run(sql, toSqlValues(values));
      this.save();

      // 返回受影响的行数
      return this.db.getRowsModified();
    } catch (error) {
      console.error('[SQLiteDatabase] 插入数据失败:', error);
      throw error;
    }
  }

  /**
   * 批量插入数据
   * @param tableName 表名
   * @param dataArray 要插入的数据数组
   * @returns 插入的行数
   */
  async insertBatch(tableName: string, dataArray: Record<string, unknown>[]): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    if (dataArray.length === 0) return 0;

    try {
      const keys = Object.keys(dataArray[0]);
      const columns = keys.join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`;

      let totalRows = 0;
      for (const data of dataArray) {
        const values = keys.map(key => data[key]);
        this.db.run(sql, toSqlValues(values));
        totalRows += this.db.getRowsModified();
      }

      this.save();
      return totalRows;
    } catch (error) {
      console.error('[SQLiteDatabase] 批量插入数据失败:', error);
      throw error;
    }
  }

  /**
   * 更新数据
   * @param tableName 表名
   * @param data 要更新的数据对象
   * @param conditions 更新条件数组
   * @returns 受影响的行数
   */
  async update(
    tableName: string,
    data: Record<string, unknown>,
    conditions: UpdateCondition[]
  ): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    if (conditions.length === 0) {
      throw new Error('更新操作必须提供条件，防止误操作');
    }

    try {
      const setClause = Object.keys(data).map(key => `${key} = ?`).join(', ');
      const whereClause = conditions.map((cond, index) => {
        if (cond.operator === 'IN') {
          const placeholders = Array.isArray(cond.value) 
            ? cond.value.map(() => '?').join(', ')
            : '?';
          return `${cond.field} IN (${placeholders})`;
        }
        return `${cond.field} ${cond.operator} ?`;
      }).join(' AND ');

      const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
      
      const values: unknown[] = Object.values(data);
      const conditionValues: unknown[] = [];
      
      for (const cond of conditions) {
        if (cond.operator === 'IN' && Array.isArray(cond.value)) {
          conditionValues.push(...cond.value);
        } else {
          conditionValues.push(cond.value);
        }
      }

      this.db.run(sql, toSqlValues([...values, ...conditionValues]));
      this.save();

      return this.db.getRowsModified();
    } catch (error) {
      console.error('[SQLiteDatabase] 更新数据失败:', error);
      throw error;
    }
  }

  /**
   * 删除数据
   * @param tableName 表名
   * @param conditions 删除条件数组
   * @returns 受影响的行数
   */
  async delete(tableName: string, conditions: UpdateCondition[]): Promise<number> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    if (conditions.length === 0) {
      throw new Error('删除操作必须提供条件，防止误操作');
    }

    try {
      const whereClause = conditions.map((cond, index) => {
        if (cond.operator === 'IN') {
          const placeholders = Array.isArray(cond.value) 
            ? cond.value.map(() => '?').join(', ')
            : '?';
          return `${cond.field} IN (${placeholders})`;
        }
        return `${cond.field} ${cond.operator} ?`;
      }).join(' AND ');

      const sql = `DELETE FROM ${tableName} WHERE ${whereClause}`;
      
      const values: unknown[] = [];
      for (const cond of conditions) {
        if (cond.operator === 'IN' && Array.isArray(cond.value)) {
          values.push(...cond.value);
        } else {
          values.push(cond.value);
        }
      }

      console.log('[SQLiteDatabase] 执行删除 SQL:', sql, '参数:', values);
      this.db.run(sql, toSqlValues(values));
      const rowsModified = this.db.getRowsModified();
      console.log('[SQLiteDatabase] 删除影响行数:', rowsModified);
      this.save();

      return rowsModified;
    } catch (error) {
      console.error('[SQLiteDatabase] 删除数据失败:', error);
      throw error;
    }
  }

  /**
   * 执行事务
   * @param callback 事务回调函数
   */
  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.run('BEGIN TRANSACTION');
      const result = await callback();
      this.db.run('COMMIT');
      this.save();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      console.error('[SQLiteDatabase] 事务执行失败:', error);
      throw error;
    }
  }

  /**
   * 执行原始 SQL（用于创建表、索引等）
   * @param sql SQL 语句
   */
  async exec(sql: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.db) throw new Error('数据库未初始化');

    try {
      this.db.exec(sql);
      this.save();
    } catch (error) {
      console.error('[SQLiteDatabase] 执行 SQL 失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据库文件路径
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

