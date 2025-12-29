/**
 * 数据库连接管理器
 * 功能：管理多个数据库连接，提供连接的创建、获取、删除等操作
 */

import type {
  ConnectionConfig,
  IDatabaseConnector,
  ConnectionStatus,
  TableInfo,
  ColumnInfo,
  QueryResult
} from './types';
import { ConnectorFactory } from './ConnectorFactory';

/** 连接信息 */
export interface ConnectionInfo {
  id: string;
  config: ConnectionConfig;
  status: ConnectionStatus;
}

export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, IDatabaseConnector> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * 创建新连接
   * @param id 连接ID
   * @param config 连接配置
   * @param autoConnect 是否自动连接
   */
  async createConnection(
    id: string,
    config: ConnectionConfig,
    autoConnect = true
  ): Promise<IDatabaseConnector> {
    // 如果已存在同ID连接，先断开
    if (this.connections.has(id)) {
      await this.removeConnection(id);
    }

    const connector = ConnectorFactory.create(config);
    this.connections.set(id, connector);

    if (autoConnect) {
      await connector.connect();
    }

    console.log(`[ConnectionManager] 创建连接: ${id} (${config.type})`);
    return connector;
  }

  /**
   * 获取连接
   * @param id 连接ID
   */
  getConnection(id: string): IDatabaseConnector | undefined {
    return this.connections.get(id);
  }

  /**
   * 获取所有连接信息
   */
  getAllConnections(): ConnectionInfo[] {
    const result: ConnectionInfo[] = [];
    for (const [id, connector] of this.connections) {
      result.push({
        id,
        config: connector.getConfig(),
        status: connector.getStatus()
      });
    }
    return result;
  }

  /**
   * 移除连接
   * @param id 连接ID
   */
  async removeConnection(id: string): Promise<boolean> {
    const connector = this.connections.get(id);
    if (!connector) {
      return false;
    }

    try {
      await connector.disconnect();
    } catch (error) {
      console.error(`[ConnectionManager] 断开连接失败: ${id}`, error);
    }

    this.connections.delete(id);
    console.log(`[ConnectionManager] 移除连接: ${id}`);
    return true;
  }

  /**
   * 移除所有连接
   */
  async removeAllConnections(): Promise<void> {
    const ids = Array.from(this.connections.keys());
    for (const id of ids) {
      await this.removeConnection(id);
    }
  }

  /**
   * 测试连接
   * @param config 连接配置
   */
  async testConnection(config: ConnectionConfig): Promise<{ success: boolean; error?: string; version?: string }> {
    const connector = ConnectorFactory.create(config);
    try {
      await connector.connect();
      const status = connector.getStatus();
      await connector.disconnect();
      return {
        success: true,
        version: status.version
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * 获取连接状态
   * @param id 连接ID
   */
  getConnectionStatus(id: string): ConnectionStatus | undefined {
    return this.connections.get(id)?.getStatus();
  }

  /**
   * 重新连接
   * @param id 连接ID
   */
  async reconnect(id: string): Promise<boolean> {
    const connector = this.connections.get(id);
    if (!connector) {
      return false;
    }

    try {
      await connector.disconnect();
      await connector.connect();
      return true;
    } catch (error) {
      console.error(`[ConnectionManager] 重新连接失败: ${id}`, error);
      return false;
    }
  }

  /**
   * 获取表列表
   * @param id 连接ID
   */
  async getTables(id: string): Promise<TableInfo[]> {
    const connector = this.connections.get(id);
    if (!connector) {
      throw new Error(`连接不存在: ${id}`);
    }
    return connector.getTables();
  }

  /**
   * 获取表的列信息
   * @param id 连接ID
   * @param tableName 表名
   */
  async getColumns(id: string, tableName: string): Promise<ColumnInfo[]> {
    const connector = this.connections.get(id);
    if (!connector) {
      throw new Error(`连接不存在: ${id}`);
    }
    return connector.getColumns(tableName);
  }

  /**
   * 执行查询
   * @param id 连接ID
   * @param sql SQL语句
   * @param params 参数
   */
  async query<T = Record<string, unknown>>(
    id: string,
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const connector = this.connections.get(id);
    if (!connector) {
      throw new Error(`连接不存在: ${id}`);
    }
    return connector.query<T>(sql, params);
  }

  /**
   * 执行非查询语句
   * @param id 连接ID
   * @param sql SQL语句
   * @param params 参数
   */
  async execute(id: string, sql: string, params?: unknown[]): Promise<QueryResult> {
    const connector = this.connections.get(id);
    if (!connector) {
      throw new Error(`连接不存在: ${id}`);
    }
    return connector.execute(sql, params);
  }
}
