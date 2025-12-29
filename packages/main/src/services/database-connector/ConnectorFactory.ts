/**
 * 数据库连接器工厂
 * 功能：根据配置创建对应类型的数据库连接器
 */

import type { ConnectionConfig, IDatabaseConnector } from './types';
import { MySQLConnector } from './connectors/MySQLConnector';
import { PostgreSQLConnector } from './connectors/PostgreSQLConnector';
import { SQLiteConnector } from './connectors/SQLiteConnector';
import { MongoDBConnector } from './connectors/MongoDBConnector';
import { MSSQLConnector } from './connectors/MSSQLConnector';

export class ConnectorFactory {
  /**
   * 创建数据库连接器
   * @param config 连接配置
   * @returns 数据库连接器实例
   */
  static create(config: ConnectionConfig): IDatabaseConnector {
    switch (config.type) {
      case 'mysql':
        return new MySQLConnector(config);
      case 'postgresql':
        return new PostgreSQLConnector(config);
      case 'sqlite':
        return new SQLiteConnector(config);
      case 'mongodb':
        return new MongoDBConnector(config);
      case 'mssql':
        return new MSSQLConnector(config);
      default:
        throw new Error(`不支持的数据库类型: ${(config as ConnectionConfig).type}`);
    }
  }

  /**
   * 获取支持的数据库类型列表
   */
  static getSupportedTypes(): { type: string; name: string; description: string }[] {
    return [
      {
        type: 'mysql',
        name: 'MySQL',
        description: 'MySQL 数据库，支持 5.7+ 和 8.0+'
      },
      {
        type: 'postgresql',
        name: 'PostgreSQL',
        description: 'PostgreSQL 数据库，支持 9.6+'
      },
      {
        type: 'sqlite',
        name: 'SQLite',
        description: 'SQLite 本地数据库文件'
      },
      {
        type: 'mongodb',
        name: 'MongoDB',
        description: 'MongoDB NoSQL 数据库'
      },
      {
        type: 'mssql',
        name: 'SQL Server',
        description: 'Microsoft SQL Server 数据库'
      }
    ];
  }
}
