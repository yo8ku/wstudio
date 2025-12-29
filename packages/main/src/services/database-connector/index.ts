/**
 * 数据库连接器模块
 * 功能：提供多类型数据库连接支持
 * 支持：MySQL、PostgreSQL、SQLite、MongoDB、SQL Server
 */

export * from './types';
export { BaseConnector } from './BaseConnector';
export { ConnectorFactory } from './ConnectorFactory';
export { ConnectionManager } from './ConnectionManager';
export type { ConnectionInfo } from './ConnectionManager';

// 导出各个连接器
export {
  MySQLConnector,
  PostgreSQLConnector,
  SQLiteConnector,
  MongoDBConnector,
  MSSQLConnector
} from './connectors';
