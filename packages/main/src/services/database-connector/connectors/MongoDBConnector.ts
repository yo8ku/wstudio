/**
 * MongoDB 数据库连接器
 * 功能：提供 MongoDB 数据库的连接、查询和集合结构获取功能
 * 依赖：需要安装 mongodb 包 (pnpm add mongodb)
 */

import { BaseConnector } from '../BaseConnector';
import type {
  MongoDBConnectionConfig,
  TableInfo,
  ColumnInfo,
  QueryResult
} from '../types';

interface MongoClient {
  connect(): Promise<void>;
  close(): Promise<void>;
  db(name?: string): MongoDb;
}

interface MongoDb {
  listCollections(): { toArray(): Promise<{ name: string; type: string }[]> };
  collection(name: string): MongoCollection;
  command(command: Record<string, unknown>): Promise<{ version?: string }>;
}

interface MongoCollection {
  find(query?: Record<string, unknown>): { toArray(): Promise<Record<string, unknown>[]>; limit(n: number): { toArray(): Promise<Record<string, unknown>[]> } };
  findOne(query?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
  insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
  insertMany(docs: Record<string, unknown>[]): Promise<{ insertedCount: number }>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
  countDocuments(query?: Record<string, unknown>): Promise<number>;
  aggregate(pipeline: Record<string, unknown>[]): { toArray(): Promise<Record<string, unknown>[]> };
}

interface MongoDBModule {
  MongoClient: new (uri: string) => MongoClient;
}

export class MongoDBConnector extends BaseConnector {
  private client: MongoClient | null = null;
  private db: MongoDb | null = null;

  constructor(config: MongoDBConnectionConfig) {
    super(config);
  }

  private getTypedConfig(): MongoDBConnectionConfig {
    return this.config as MongoDBConnectionConfig;
  }

  async connect(): Promise<void> {
    try {
      let mongodb: MongoDBModule;
      try {
        mongodb = await import('mongodb') as unknown as MongoDBModule;
      } catch {
        throw new Error('MongoDB 驱动未安装。请运行: pnpm add mongodb');
      }
      
      const { MongoClient } = mongodb;
      const config = this.getTypedConfig();

      this.client = new MongoClient(config.uri) as unknown as MongoClient;
      await this.client.connect();
      this.db = this.client.db(config.database);

      // 获取版本信息
      const adminDb = this.client.db('admin');
      const serverInfo = await adminDb.command({ buildInfo: 1 });
      const version = `MongoDB ${serverInfo.version || 'unknown'}`;

      this.updateStatus({
        connected: true,
        connectedAt: new Date(),
        version,
        error: undefined
      });

      console.log(`[MongoDB] 连接成功: ${config.name}`);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.updateStatus({
        connected: false,
        connectedAt: undefined
      });
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      let mongodb: MongoDBModule;
      try {
        mongodb = await import('mongodb') as unknown as MongoDBModule;
      } catch {
        return false;
      }
      
      const { MongoClient } = mongodb;
      const config = this.getTypedConfig();

      const client = new MongoClient(config.uri) as unknown as MongoClient;
      await client.connect();
      await client.close();
      return true;
    } catch {
      return false;
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const collections = await this.db.listCollections().toArray();
    const tables: TableInfo[] = [];

    for (const col of collections) {
      let rowCount: number | undefined;
      try {
        rowCount = await this.db.collection(col.name).countDocuments();
      } catch {
        // 忽略行数获取错误
      }

      tables.push({
        name: col.name,
        type: col.type === 'view' ? 'view' : 'table',
        rowCount
      });
    }

    return tables;
  }

  async getColumns(tableName: string): Promise<ColumnInfo[]> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    // MongoDB 是无模式的，通过采样文档来推断字段结构
    const collection = this.db.collection(tableName);
    const sampleDocs = await collection.find().limit(100).toArray();

    if (sampleDocs.length === 0) {
      return [];
    }

    // 收集所有字段
    const fieldMap = new Map<string, { types: Set<string>; count: number }>();

    for (const doc of sampleDocs) {
      this.extractFields(doc, '', fieldMap, sampleDocs.length);
    }

    // 转换为 ColumnInfo
    const columns: ColumnInfo[] = [];
    for (const [name, info] of fieldMap) {
      columns.push({
        name,
        dataType: Array.from(info.types).join(' | '),
        nullable: info.count < sampleDocs.length,
        isPrimaryKey: name === '_id'
      });
    }

    return columns.sort((a, b) => {
      // _id 排在最前面
      if (a.name === '_id') return -1;
      if (b.name === '_id') return 1;
      return a.name.localeCompare(b.name);
    });
  }

  private extractFields(
    obj: Record<string, unknown>,
    prefix: string,
    fieldMap: Map<string, { types: Set<string>; count: number }>,
    _totalDocs: number
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;
      const fieldType = this.getMongoType(value);

      if (!fieldMap.has(fieldName)) {
        fieldMap.set(fieldName, { types: new Set(), count: 0 });
      }

      const fieldInfo = fieldMap.get(fieldName)!;
      fieldInfo.types.add(fieldType);
      fieldInfo.count++;

      // 递归处理嵌套对象（但不递归数组）
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        this.extractFields(value as Record<string, unknown>, fieldName, fieldMap, _totalDocs);
      }
    }
  }

  private getMongoType(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object' && value !== null && '_bsontype' in value) {
      return (value as { _bsontype: string })._bsontype.toLowerCase();
    }
    return typeof value;
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();

    // 解析简单的查询语法：collection.find({...}) 或 collection.aggregate([...])
    const match = sql.match(/^(\w+)\.(find|aggregate|findOne)\((.*)\)$/s);
    if (!match) {
      throw new Error('不支持的查询语法。请使用: collection.find({}) 或 collection.aggregate([])');
    }

    const [, collectionName, method, argsStr] = match;
    const collection = this.db.collection(collectionName);

    let rows: T[] = [];
    try {
      const args = argsStr.trim() ? JSON.parse(argsStr) : (method === 'aggregate' ? [] : {});

      if (method === 'find') {
        rows = await collection.find(args).toArray() as T[];
      } else if (method === 'findOne') {
        const doc = await collection.findOne(args);
        rows = doc ? [doc as T] : [];
      } else if (method === 'aggregate') {
        rows = await collection.aggregate(args).toArray() as T[];
      }
    } catch (parseError) {
      // 如果 JSON 解析失败，尝试使用 params
      if (params && params.length > 0) {
        if (method === 'find') {
          rows = await collection.find(params[0] as Record<string, unknown>).toArray() as T[];
        } else if (method === 'aggregate') {
          rows = await collection.aggregate(params as Record<string, unknown>[]).toArray() as T[];
        }
      } else {
        throw parseError;
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      rows,
      executionTime
    };
  }

  async execute(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.db) {
      throw new Error('数据库未连接');
    }

    const startTime = Date.now();

    // 解析操作语法：collection.insertOne/insertMany/updateOne/updateMany/deleteOne/deleteMany
    const match = sql.match(/^(\w+)\.(insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany)\((.*)\)$/s);
    if (!match) {
      throw new Error('不支持的操作语法');
    }

    const [, collectionName, method, argsStr] = match;
    const collection = this.db.collection(collectionName);

    let affectedRows = 0;
    const args = argsStr.trim() ? JSON.parse(argsStr) : (params || {});

    switch (method) {
      case 'insertOne': {
        await collection.insertOne(args as Record<string, unknown>);
        affectedRows = 1;
        break;
      }
      case 'insertMany': {
        const result = await collection.insertMany(args as Record<string, unknown>[]);
        affectedRows = result.insertedCount;
        break;
      }
      case 'updateOne': {
        const [filter, update] = Array.isArray(args) ? args : [args, params?.[0]];
        const result = await collection.updateOne(
          filter as Record<string, unknown>,
          update as Record<string, unknown>
        );
        affectedRows = result.modifiedCount;
        break;
      }
      case 'updateMany': {
        const [filter, update] = Array.isArray(args) ? args : [args, params?.[0]];
        const result = await collection.updateMany(
          filter as Record<string, unknown>,
          update as Record<string, unknown>
        );
        affectedRows = result.modifiedCount;
        break;
      }
      case 'deleteOne': {
        const result = await collection.deleteOne(args as Record<string, unknown>);
        affectedRows = result.deletedCount;
        break;
      }
      case 'deleteMany': {
        const result = await collection.deleteMany(args as Record<string, unknown>);
        affectedRows = result.deletedCount;
        break;
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      rows: [],
      affectedRows,
      executionTime
    };
  }
}
