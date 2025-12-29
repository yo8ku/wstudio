/**
 * 数据库连接器基类
 * 功能：提供数据库连接器的基础实现
 */

import type {
  ConnectionConfig,
  ConnectionStatus,
  IDatabaseConnector,
  TableInfo,
  ColumnInfo,
  QueryResult
} from './types';

export abstract class BaseConnector implements IDatabaseConnector {
  protected config: ConnectionConfig;
  protected status: ConnectionStatus = {
    connected: false
  };

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  getConfig(): ConnectionConfig {
    return this.config;
  }

  getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract testConnection(): Promise<boolean>;
  abstract getTables(): Promise<TableInfo[]>;
  abstract getColumns(tableName: string): Promise<ColumnInfo[]>;
  abstract query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  abstract execute(sql: string, params?: unknown[]): Promise<QueryResult>;

  /** 更新连接状态 */
  protected updateStatus(updates: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...updates };
  }

  /** 记录错误并更新状态 */
  protected handleError(error: Error): void {
    console.error(`[${this.config.type}] 数据库错误:`, error.message);
    this.updateStatus({
      connected: false,
      error: error.message
    });
  }
}
