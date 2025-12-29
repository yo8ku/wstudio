/**
 * 数据库连接器类型定义
 * 功能：定义多类型数据库连接的接口和类型
 */

/** 支持的数据库类型 */
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb' | 'mssql';

/** 数据库连接配置基础接口 */
export interface BaseConnectionConfig {
  /** 连接名称（用于标识） */
  name: string;
  /** 数据库类型 */
  type: DatabaseType;
}

/** MySQL 连接配置 */
export interface MySQLConnectionConfig extends BaseConnectionConfig {
  type: 'mysql';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** 连接池大小 */
  connectionLimit?: number;
  /** SSL 配置 */
  ssl?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
}

/** PostgreSQL 连接配置 */
export interface PostgreSQLConnectionConfig extends BaseConnectionConfig {
  type: 'postgresql';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** 连接池大小 */
  max?: number;
  /** SSL 模式 */
  ssl?: boolean | {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
}

/** SQLite 连接配置 */
export interface SQLiteConnectionConfig extends BaseConnectionConfig {
  type: 'sqlite';
  /** 数据库文件路径 */
  filename: string;
  /** 是否只读 */
  readonly?: boolean;
}

/** MongoDB 连接配置 */
export interface MongoDBConnectionConfig extends BaseConnectionConfig {
  type: 'mongodb';
  /** 连接 URI */
  uri: string;
  /** 数据库名称 */
  database: string;
}

/** SQL Server 连接配置 */
export interface MSSQLConnectionConfig extends BaseConnectionConfig {
  type: 'mssql';
  server: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** 是否信任服务器证书 */
  trustServerCertificate?: boolean;
  /** 加密连接 */
  encrypt?: boolean;
}

/** 所有连接配置的联合类型 */
export type ConnectionConfig =
  | MySQLConnectionConfig
  | PostgreSQLConnectionConfig
  | SQLiteConnectionConfig
  | MongoDBConnectionConfig
  | MSSQLConnectionConfig;

/** 数据库表信息 */
export interface TableInfo {
  /** 表名 */
  name: string;
  /** 模式/数据库名 */
  schema?: string;
  /** 表类型（表/视图） */
  type: 'table' | 'view';
  /** 行数估计 */
  rowCount?: number;
}

/** 列信息 */
export interface ColumnInfo {
  /** 列名 */
  name: string;
  /** 数据类型 */
  dataType: string;
  /** 是否可为空 */
  nullable: boolean;
  /** 是否为主键 */
  isPrimaryKey: boolean;
  /** 默认值 */
  defaultValue?: string;
  /** 列注释 */
  comment?: string;
}

/** 查询结果 */
export interface QueryResult<T = Record<string, unknown>> {
  /** 结果行 */
  rows: T[];
  /** 影响的行数 */
  affectedRows?: number;
  /** 列信息 */
  fields?: ColumnInfo[];
  /** 执行时间（毫秒） */
  executionTime?: number;
}

/** 连接状态 */
export interface ConnectionStatus {
  /** 是否已连接 */
  connected: boolean;
  /** 连接时间 */
  connectedAt?: Date;
  /** 错误信息 */
  error?: string;
  /** 数据库版本 */
  version?: string;
}

/** 数据库连接器接口 */
export interface IDatabaseConnector {
  /** 获取连接配置 */
  getConfig(): ConnectionConfig;
  
  /** 连接数据库 */
  connect(): Promise<void>;
  
  /** 断开连接 */
  disconnect(): Promise<void>;
  
  /** 获取连接状态 */
  getStatus(): ConnectionStatus;
  
  /** 测试连接 */
  testConnection(): Promise<boolean>;
  
  /** 获取所有表 */
  getTables(): Promise<TableInfo[]>;
  
  /** 获取表的列信息 */
  getColumns(tableName: string): Promise<ColumnInfo[]>;
  
  /** 执行查询 */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  
  /** 执行非查询语句（INSERT/UPDATE/DELETE） */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
}
