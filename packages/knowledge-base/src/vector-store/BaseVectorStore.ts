/**
 * 向量存储基类
 */

import { VectorStoreConfig, VectorRecord, VectorSearchOptions, VectorSearchResult } from './types';

export abstract class BaseVectorStore {
  protected config: VectorStoreConfig;

  constructor(config: VectorStoreConfig) {
    this.config = config;
  }

  /**
   * 初始化存储
   */
  abstract initialize(): Promise<void>;

  /**
   * 插入向量
   */
  abstract insert(record: VectorRecord): Promise<void>;

  /**
   * 批量插入向量
   */
  abstract insertBatch(records: VectorRecord[]): Promise<void>;

  /**
   * 搜索相似向量
   */
  abstract search(vector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;

  /**
   * 删除向量
   */
  abstract delete(id: string): Promise<void>;

  /**
   * 批量删除
   */
  abstract deleteBatch(ids: string[]): Promise<void>;

  /**
   * 更新向量
   */
  abstract update(id: string, record: Partial<VectorRecord>): Promise<void>;

  /**
   * 获取向量
   */
  abstract get(id: string): Promise<VectorRecord | null>;

  /**
   * 清空集合
   */
  abstract clear(): Promise<void>;

  /**
   * 获取存储统计
   */
  abstract getStats(): Promise<{
    totalVectors: number;
    dimensions: number;
    [key: string]: any;
  }>;

  /**
   * 关闭连接
   */
  abstract close(): Promise<void>;

  /**
   * 获取存储名称
   */
  getName(): string {
    return this.config.name;
  }
}



















