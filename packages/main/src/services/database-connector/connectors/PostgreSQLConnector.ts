/**
 * PostgreSQL 数据库连接器
 * 功能：提供 PostgreSQL 数据库的连接、查询和表结构获取功能
 * 依赖：需要安装 pg 包 (pnpm add pg @types/pg)
 */

import { BaseConnector } from '../BaseConnector';
import type {
  PostgreSQLConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult
} from '../types';

interface PgPool {
  connect(): Promise<PgClient>;
  end(): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
}

interface PgClient {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  release(): void;
}

interface PgModule {
  Pool: new (config: Record<string, unknown>) => PgPool;
  Client: new (config: Record<string, unknown>) => PgClient & { connect(): Promise<void>; end(): Promise<void> };
}

export class PostgreSQLConnector extends BaseConnector {
  private pool: PgPool | null = null;

  constructor(config: PostgreSQLConnectionConfig) {
    super(config);
  }

  private getTypedConfig(): PostgreSQLConnectionConfig {
    return this.config as PostgreSQLConnectionConfig;
  }

  async connect(): Promise<void> {
    try {
      let pg: PgModule;
      try {
        pg = await import('pg') as unknown as PgModule;
      } catch {
        throw new Error('PostgreSQL 驱动未安装。请运行: pnpm add pg @types/pg');
      }
      
      const { Pool } = pg;
      const config = this.getTypedConfig();

      this.pool = new Pool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        max: config.max || 10,
        ssl: config.ssl
      }) as unknown as PgPool;

      // 测试连接
      const client = await this.pool.connect();
      client.release();

      // 获取版本信息
      const result = await this.pool.query<{ version: string }>('SELECT version()');
      const version = result.rows[0]?.version;

      this.updateStatus({
        connected: true,
        connectedAt: new Date(),
        version,
        error: undefined
      });

      console.log(`[PostgreSQL] 连接成功: ${config.name}`);
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
      let pg: PgModule;
      try {
        pg = await import('pg') as unknown as PgModule;
      } catch {
        return false;
      }
      
      const { Client } = pg;
      const config = this.getTypedConfig();

      const client = new Client({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: config.ssl
      });

      await client.connect();
      await client.end();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const result = await this.pool.query<{
      table_name: string;
      table_schema: string;
      table_type: string;
    }>(`
      SELECT table_name, table_schema, table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    // 获取每个表的行数估计
    const tables: TableInfo[] = [];
    for (const row of result.rows) {
      let rowCount: number | undefined;
      try {
        const countResult = await this.pool.query<{ estimate: string }>(`
          SELECT reltuples::bigint AS estimate
          FROM pg_class
          WHERE relname = $1
        `, [row.table_name]);
        rowCount = parseInt(countResult.rows[0]?.estimate || '0', 10);
      } catch {
        // 忽略行数获取错误
      }

      tables.push({
        name: row.table_name,
        schema: row.table_schema,
        type: row.table_type === 'VIEW' ? 'view' : 'table',
        rowCount
      });
    }

    return tables;
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const result = await this.pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      is_primary: boolean;
    }>(`
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `, [tableName]);

    return result.rows.map(row => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === 'YES',
      isPrimaryKey: row.is_primary,
      defaultValue: row.column_default ?? undefined
    }));
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const result = await this.pool.query<T>(sql, params);
    const executionTime = Date.now() - startTime;

    return {
      rows: result.rows,
      executionTime
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();
    const result = await this.pool.query(sql, params);
    const executionTime = Date.now() - startTime;

    return {
      rows: [],
      affectedRows: result.rowCount,
      executionTime
    };
  }
}
