/**
 * SQLite 数据库连接器
 * 功能：提供 SQLite 数据库的连接、查询和表结构获取功能
 * 使用 sql.js 纯 JavaScript 实现，无需原生编译
 */

import { BaseConnector } from '../BaseConnector';
import type {
  SQLiteConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';

export class SQLiteConnector extends BaseConnector {
  private db: SqlJsDatabase | null = null;
  private SQL: SqlJsStatic | null = null;

  constructor(config: SQLiteConnectionConfig) {
    super(config);
  }

  private getTypedConfig(): SQLiteConnectionConfig {
    return this.config as SQLiteConnectionConfig;
  }

  async connect(): Promise<void> {
    try {
      // 动态导入 sql.js
      const initSqlJs = (await import('sql.js')).default;
      this.SQL = await initSqlJs();
      
      const config = this.getTypedConfig();
      
      // 读取数据库文件
      if (fs.existsSync(config.filename)) {
        const fileBuffer = fs.readFileSync(config.filename);
        this.db = new this.SQL.Database(fileBuffer);
      } else {
        // 创建新数据库
        this.db = new this.SQL.Database();
      }

      // 获取版本信息
      const versionResult = this.db.exec('SELECT sqlite_version() as version');
      const version = versionResult[0]?.values[0]?.[0] as string || 'unknown';

      this.updateStatus({
        connected: true,
        connectedAt: new Date(),
        version: `SQLite ${version}`,
        error: undefined
      });

      console.log(`[SQLite] 连接成功: ${config.name}`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      // 保存更改到文件
      await this.saveToFile();
      this.db.close();
      this.db = null;
      this.updateStatus({
        connected: false,
        connectedAt: undefined
      });
    }
  }

  private async saveToFile(): Promise<void> {
    if (!this.db) return;
    
    const config = this.getTypedConfig();
    const data = this.db.export();
    const buffer = Buffer.from(data);
    
    // 确保目录存在
    const dir = path.dirname(config.filename);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(config.filename, buffer);
  }

  async testConnection(): Promise<boolean> {
    try {
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      
      const config = this.getTypedConfig();
      
      if (fs.existsSync(config.filename)) {
        const fileBuffer = fs.readFileSync(config.filename);
        const db = new SQL.Database(fileBuffer);
        db.exec('SELECT 1');
        db.close();
      } else {
        // 文件不存在，但可以创建新数据库
        const db = new SQL.Database();
        db.exec('SELECT 1');
        db.close();
      }
      
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const result = this.db.exec(`
      SELECT name, type
      FROM sqlite_master
      WHERE type IN ('table', 'view')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    if (!result[0]) {
      return [];
    }

    const tables: TableInfo[] = [];
    for (const row of result[0].values) {
      const name = row[0] as string;
      const type = row[1] as string;
      
      let rowCount: number | undefined;
      if (type === 'table') {
        try {
          const countResult = this.db.exec(`SELECT COUNT(*) as count FROM "${name}"`);
          rowCount = countResult[0]?.values[0]?.[0] as number;
        } catch {
          // 忽略行数获取错误
        }
      }

      tables.push({
        name,
        type: type === 'view' ? 'view' : 'table',
        rowCount
      });
    }

    return tables;
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const result = this.db.exec(`PRAGMA table_info("${tableName}")`);
    
    if (!result[0]) {
      return [];
    }

    // PRAGMA table_info 返回: cid, name, type, notnull, dflt_value, pk
    return result[0].values.map(row => ({
      name: row[1] as string,
      dataType: row[2] as string,
      nullable: (row[3] as number) === 0,
      isPrimaryKey: (row[5] as number) === 1,
      defaultValue: row[4] as string | undefined
    }));
  }

  async query<T = Record<string, unknown>>(sql: string, _params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const result = this.db.exec(sql);
    const executionTime = Date.now() - startTime;

    if (!result[0]) {
      return {
        rows: [],
        executionTime
      };
    }

    // 将结果转换为对象数组
    const columns = result[0].columns;
    const rows = result[0].values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj as T;
    });

    return {
      rows,
      executionTime
    };
  }

  async execute(sql: string, _params?: unknown[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    this.db.run(sql);
    const executionTime = Date.now() - startTime;

    // 保存更改
    await this.saveToFile();

    return {
      rows: [],
      affectedRows: 0, // sql.js 不直接提供 affected rows
      executionTime
    };
  }
}
