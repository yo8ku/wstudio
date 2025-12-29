/**
 * SQL Server 数据库连接器
 * 功能：提供 SQL Server 数据库的连接、查询和表结构获取功能
 * 依赖：需要安装 mssql 包 (pnpm add mssql)
 */

import { BaseConnector } from '../BaseConnector';
import type {
  MSSQLConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult
} from '../types';

interface MSSQLConnectionPool {
  connect(): Promise<MSSQLConnectionPool>;
  close(): Promise<void>;
  request(): MSSQLRequest;
  connected: boolean;
}

interface MSSQLRequest {
  query<T>(sql: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
  input(name: string, value: unknown): MSSQLRequest;
}

interface MSSQLModule {
  ConnectionPool: new (config: Record<string, unknown>) => MSSQLConnectionPool;
}

export class MSSQLConnector extends BaseConnector {
  private pool: MSSQLConnectionPool | null = null;
  private mssql: MSSQLModule | null = null;

  constructor(config: MSSQLConnectionConfig) {
    super(config);
  }

  private getTypedConfig(): MSSQLConnectionConfig {
    return this.config as MSSQLConnectionConfig;
  }

  async connect(): Promise<void> {
    try {
      try {
        this.mssql = await import('mssql') as unknown as MSSQLModule;
      } catch {
        throw new Error('SQL Server 驱动未安装。请运行: pnpm add mssql');
      }
      
      const config = this.getTypedConfig();

      this.pool = new this.mssql.ConnectionPool({
        server: config.server,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        options: {
          trustServerCertificate: config.trustServerCertificate ?? true,
          encrypt: config.encrypt ?? false
        }
      });

      await this.pool.connect();

      // 获取版本信息
      const result = await this.pool.request().query<{ version: string }>('SELECT @@VERSION as version');
      const version = result.recordset[0]?.version?.split('\n')[0] || 'SQL Server';

      this.updateStatus({
        connected: true,
        connectedAt: new Date(),
        version,
        error: undefined
      });

      console.log(`[MSSQL] 连接成功: ${config.name}`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.updateStatus({
        connected: false,
        connectedAt: undefined
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      let mssql: MSSQLModule;
      try {
        mssql = await import('mssql') as unknown as MSSQLModule;
      } catch {
        return false;
      }
      
      const config = this.getTypedConfig();

      const pool = new mssql.ConnectionPool({
        server: config.server,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        options: {
          trustServerCertificate: config.trustServerCertificate ?? true,
          encrypt: config.encrypt ?? false
        }
      });

      await pool.connect();
      await pool.close();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const result = await this.pool.request().query<{
      TABLE_NAME: string;
      TABLE_SCHEMA: string;
      TABLE_TYPE: string;
    }>(`
      SELECT TABLE_NAME, TABLE_SCHEMA, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    const tables: TableInfo[] = [];
    for (const row of result.recordset) {
      let rowCount: number | undefined;
      if (row.TABLE_TYPE === 'BASE TABLE') {
        try {
          const countResult = await this.pool.request().query<{ rows: number }>(`
            SELECT SUM(p.rows) as rows
            FROM sys.partitions p
            JOIN sys.tables t ON p.object_id = t.object_id
            WHERE t.name = '${row.TABLE_NAME}'
              AND p.index_id IN (0, 1)
          `);
          rowCount = countResult.recordset[0]?.rows;
        } catch {
          // 忽略行数获取错误
        }
      }

      tables.push({
        name: row.TABLE_NAME,
        schema: row.TABLE_SCHEMA,
        type: row.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
        rowCount
      });
    }

    return tables;
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const result = await this.pool.request().query<{
      COLUMN_NAME: string;
      DATA_TYPE: string;
      IS_NULLABLE: string;
      COLUMN_DEFAULT: string | null;
      IS_PRIMARY: number;
    }>(`
      SELECT 
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.IS_NULLABLE,
        c.COLUMN_DEFAULT,
        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as IS_PRIMARY
      FROM INFORMATION_SCHEMA.COLUMNS c
      LEFT JOIN (
        SELECT ku.COLUMN_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
          ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
          AND tc.TABLE_NAME = '${tableName}'
      ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
      WHERE c.TABLE_NAME = '${tableName}'
      ORDER BY c.ORDINAL_POSITION
    `);

    return result.recordset.map(row => ({
      name: row.COLUMN_NAME,
      dataType: row.DATA_TYPE,
      nullable: row.IS_NULLABLE === 'YES',
      isPrimaryKey: row.IS_PRIMARY === 1,
      defaultValue: row.COLUMN_DEFAULT ?? undefined
    }));
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const request = this.pool.request();

    // 添加参数
    if (params) {
      params.forEach((param, index) => {
        request.input(`p${index}`, param);
      });
    }

    const result = await request.query<T>(sql);
    const executionTime = Date.now() - startTime;

    return {
      rows: result.recordset,
      executionTime
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const request = this.pool.request();

    // 添加参数
    if (params) {
      params.forEach((param, index) => {
        request.input(`p${index}`, param);
      });
    }

    const result = await request.query(sql);
    const executionTime = Date.now() - startTime;

    return {
      rows: [],
      affectedRows: result.rowsAffected.reduce((a, b) => a + b, 0),
      executionTime
    };
  }
}
