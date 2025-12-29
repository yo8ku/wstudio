/**
 * 可选数据库驱动类型声明
 * 功能：为可选安装的数据库驱动提供类型声明
 */

declare module 'mysql2/promise' {
  export interface RowDataPacket {
    [key: string]: unknown;
  }
  
  export interface Pool {
    getConnection(): Promise<PoolConnection>;
    end(): Promise<void>;
    query(sql: string, params?: unknown[]): Promise<[RowDataPacket[], unknown]>;
  }
  
  export interface PoolConnection {
    query(sql: string, params?: unknown[]): Promise<[RowDataPacket[], unknown]>;
    release(): void;
    ping(): Promise<void>;
    end(): Promise<void>;
  }
  
  export function createPool(config: Record<string, unknown>): Pool;
  export function createConnection(config: Record<string, unknown>): Promise<PoolConnection>;
}

declare module 'pg' {
  export class Pool {
    constructor(config: Record<string, unknown>);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  }
  
  export class Client {
    constructor(config: Record<string, unknown>);
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  }
  
  export interface PoolClient {
    query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
    release(): void;
  }
}

declare module 'mongodb' {
  export class MongoClient {
    constructor(uri: string);
    connect(): Promise<void>;
    close(): Promise<void>;
    db(name?: string): Db;
  }
  
  export interface Db {
    listCollections(): { toArray(): Promise<{ name: string; type: string }[]> };
    collection(name: string): Collection;
    command(command: Record<string, unknown>): Promise<Record<string, unknown>>;
  }
  
  export interface Collection {
    find(query?: Record<string, unknown>): FindCursor;
    findOne(query?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    insertOne(doc: Record<string, unknown>): Promise<{ insertedId: unknown }>;
    insertMany(docs: Record<string, unknown>[]): Promise<{ insertedCount: number }>;
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
    updateMany(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ modifiedCount: number }>;
    deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
    deleteMany(filter: Record<string, unknown>): Promise<{ deletedCount: number }>;
    countDocuments(query?: Record<string, unknown>): Promise<number>;
    aggregate(pipeline: Record<string, unknown>[]): AggregationCursor;
  }
  
  export interface FindCursor {
    toArray(): Promise<Record<string, unknown>[]>;
    limit(n: number): FindCursor;
  }
  
  export interface AggregationCursor {
    toArray(): Promise<Record<string, unknown>[]>;
  }
}

declare module 'mssql' {
  export class ConnectionPool {
    constructor(config: Record<string, unknown>);
    connect(): Promise<ConnectionPool>;
    close(): Promise<void>;
    request(): Request;
    connected: boolean;
  }
  
  export interface Request {
    query<T>(sql: string): Promise<{ recordset: T[]; rowsAffected: number[] }>;
    input(name: string, value: unknown): Request;
  }
}
