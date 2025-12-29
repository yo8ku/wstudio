/**
 * MySQL 数据库连接器
 * 功能：提供 MySQL 数据库的连接、查询和表结构获取功能
 * 依赖：需要安装 mysql2 包 (pnpm add mysql2)
 */

import { BaseConnector } from '../BaseConnector';
import type {
  MySQLConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult
} from '../types';

interface MySQLRowDataPacket {
  [key: string]: unknown;
}

interface MySQLPool {
  getConnection(): Promise<MySQLConnection>;
  end(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<[MySQLRowDataPacket[], unknown]>;
}

interface MySQLConnection {
  query(sql: string, params?: unknown[]): Promise<[MySQLRowDataPacket[], unknown]>;
  release(): void;
  ping(): Promise<void>;
  end(): Promise<void>;
}

interface MySQLModule {
  createPool(config: Record<string, unknown>): MySQLPool;
  createConnection(config: Record<string, unknown>): Promise<MySQLConnection>;
}

export class MySQLConnector extends BaseConnector {
  private pool: MySQLPool | null = null;

  constructor(config: MySQLConnectionConfig) {
    super(config);
  }

  private getTypedConfig(): MySQLConnectionConfig {
    return this.config as MySQLConnectionConfig;
  }

  async connect(): Promise<void> {
    try {
      let mysql: MySQLModule;
      try {
        mysql = await import('mysql2/promise') as unknown as MySQLModule;
      } catch {
        throw new Error('MySQL 驱动未安装。请运行: pnpm add mysql2');
      }

      const config = this.getTypedConfig();

      this.pool = mysql.createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: config.connectionLimit || 10,
        ssl: config.ssl
      });

      // 测试连接
      const connection = await this.pool.getConnection();
      connection.release();

      // 获取版本信息
      const [rows] = await this.pool.query('SELECT VERSION() as version');
      const versionRow = rows[0] as { version?: string } | undefined;
      const version = versionRow?.version;

      this.updateStatus({
        connected: true,
        connectedAt: new Date(),
        version,
        error: undefined
      });

      console.log(`[MySQL] 连接成功: ${config.name}`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.updateStatus({
        connected: false,
        connectedAt: undefined
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      let mysql: MySQLModule;
      try {
        mysql = await import('mysql2/promise') as unknown as MySQLModule;
      } catch {
        return false;
      }

      const config = this.getTypedConfig();

      const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl
      });

      await connection.ping();
      await connection.end();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const config = this.getTypedConfig();
    const [rows] = await this.pool.query(`
      SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
    `, [config.database]);

    return (rows as MySQLRowDataPacket[]).map(row => ({
      name: row.TABLE_NAME as string,
      schema: config.database,
      type: row.TABLE_TYPE === 'VIEW' ? 'view' as const : 'table' as const,
      rowCount: row.TABLE_ROWS as number
    }));
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const config = this.getTypedConfig();
    const [rows] = await this.pool.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [config.database, tableName]);

    return (rows as MySQLRowDataPacket[]).map(row => ({
      name: row.COLUMN_NAME as string,
      dataType: row.DATA_TYPE as string,
      nullable: row.IS_NULLABLE === 'YES',
      isPrimaryKey: row.COLUMN_KEY === 'PRI',
      defaultValue: (row.COLUMN_DEFAULT as string | null) ?? undefined,
      comment: (row.COLUMN_COMMENT as string) || undefined
    }));
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const [rows] = await this.pool.query(sql, params);
    const executionTime = Date.now() - startTime;

    return {
      rows: rows as T[],
      executionTime
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const [result] = await this.pool.query(sql, params);
    const executionTime = Date.now() - startTime;
    const resultObj = result as { affectedRows?: number };

    return {
      rows: [],
      affectedRows: resultObj.affectedRows,
      executionTime
    };
  }
}
