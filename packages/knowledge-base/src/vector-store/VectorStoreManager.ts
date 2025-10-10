/**
 * 向量存储管理器
 */

import { BaseVectorStore } from './BaseVectorStore';

export class VectorStoreManager {
  private static instance: VectorStoreManager;
  private stores: Map<string, BaseVectorStore> = new Map();

  private constructor() {}

  static getInstance(): VectorStoreManager {
    if (!VectorStoreManager.instance) {
      VectorStoreManager.instance = new VectorStoreManager();
    }
    return VectorStoreManager.instance;
  }

  /**
   * 注册向量存储
   */
  register(store: BaseVectorStore): void {
    this.stores.set(store.getName(), store);
  }

  /**
   * 获取向量存储
   */
  getStore(name: string): BaseVectorStore | undefined {
    return this.stores.get(name);
  }

  /**
   * 列出所有存储
   */
  listStores(): BaseVectorStore[] {
    return Array.from(this.stores.values());
  }

  /**
   * 注销存储
   */
  async unregister(name: string): Promise<void> {
    const store = this.stores.get(name);
    if (store) {
      await store.close();
      this.stores.delete(name);
    }
  }
}



















