/**
 * 数据库视图类型定义
 * 功能：定义数据库表格的列类型、行数据等接口
 */

/** 列类型枚举 */
export type ColumnType = 
  | 'text'      // 文本
  | 'number'    // 数字
  | 'date'      // 日期
  | 'checkbox'  // 复选框
  | 'select'    // 单选
  | 'multiselect' // 多选
  | 'url';      // 链接

/** 列配置 */
export interface DatabaseColumn {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
  options?: string[]; // 用于 select 和 multiselect 类型
}

/** 单元格值类型 */
export type CellValue = string | number | boolean | string[] | null;

/** 行数据 */
export interface DatabaseRow {
  id: string;
  cells: Record<string, CellValue>;
}

/** 数据库配置 */
export interface DatabaseConfig {
  id: string;
  name: string;
  columns: DatabaseColumn[];
  rows: DatabaseRow[];
  createdAt: number;
  updatedAt: number;
}

/** 列类型信息 */
export interface ColumnTypeInfo {
  type: ColumnType;
  label: string;
  icon: string;
}

/** 所有列类型 */
export const COLUMN_TYPES: ColumnTypeInfo[] = [
  { type: 'text', label: '文本', icon: 'text' },
  { type: 'number', label: '数字', icon: 'number' },
  { type: 'date', label: '日期', icon: 'calendar' },
  { type: 'checkbox', label: '复选框', icon: 'checkbox' },
  { type: 'select', label: '单选', icon: 'select' },
  { type: 'multiselect', label: '多选', icon: 'multiselect' },
  { type: 'url', label: '链接', icon: 'link' },
];

/** 数据库连接类型 */
export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb' | 'mssql';

/** 数据库连接配置 */
export interface DbConnectionConfig {
  name: string;
  type: DatabaseType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  filename?: string; // SQLite
  uri?: string; // MongoDB
  server?: string; // MSSQL
}

/** 数据库表信息 */
export interface DbTableInfo {
  name: string;
  schema?: string;
  type: 'table' | 'view';
  rowCount?: number;
}

/** 数据库列信息 */
export interface DbColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string;
  comment?: string;
}

/** 查询结果 */
export interface DbQueryResult {
  rows: Record<string, unknown>[];
  affectedRows?: number;
  executionTime?: number;
}

/** 连接状态 */
export interface DbConnectionStatus {
  connected: boolean;
  connectedAt?: Date;
  error?: string;
  version?: string;
}

/** 支持的数据库类型信息 */
export interface DbTypeInfo {
  type: string;
  name: string;
  description: string;
}

/** 已保存的数据库连接信息 */
export interface SavedConnection {
  id: string;
  name: string;
  type: DatabaseType;
  config: DbConnectionConfig;
  status: DbConnectionStatus;
  tables?: DbTableInfo[];
}
