/**
 * 向量缓存
 */

import { createHash } from 'crypto';
import { EmbeddingResult } from './types';

export class EmbeddingCache {
  private cache: Map<string, EmbeddingResult> = new Map();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * 生成缓存键
   */
  private generateKey(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * 获取缓存
   */
  async get(text: string): Promise<EmbeddingResult | null> {
    const key = this.generateKey(text);
    return this.cache.get(key) || null;
  }

  /**
   * 设置缓存
   */
  async set(text: string, result: EmbeddingResult): Promise<void> {
    const key = this.generateKey(text);

    if (this.cache.size >= this.maxSize) {
      // 删除最早的条目（简单 LRU）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, result);
  }

  /**
   * 检查是否存在
   */
  async has(text: string): Promise<boolean> {
    const key = this.generateKey(text);
    return this.cache.has(key);
  }

  /**
   * 删除缓存
   */
  async delete(text: string): Promise<void> {
    const key = this.generateKey(text);
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  getSize(): number {
    return this.cache.size;
  }

  /**
   * 获取命中率统计
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: (this.cache.size / this.maxSize) * 100,
    };
  }
}



















