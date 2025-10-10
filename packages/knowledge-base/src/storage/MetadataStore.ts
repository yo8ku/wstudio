/**
 * 元数据存储
 */

export class MetadataStore {
  private metadata: Map<string, Record<string, any>> = new Map();

  /**
   * 保存元数据
   */
  async save(id: string, metadata: Record<string, any>): Promise<void> {
    this.metadata.set(id, metadata);
  }

  /**
   * 批量保存
   */
  async saveBatch(items: Array<{ id: string; metadata: Record<string, any> }>): Promise<void> {
    for (const item of items) {
      this.metadata.set(item.id, item.metadata);
    }
  }

  /**
   * 获取元数据
   */
  async get(id: string): Promise<Record<string, any> | null> {
    return this.metadata.get(id) || null;
  }

  /**
   * 更新元数据
   */
  async update(id: string, updates: Record<string, any>): Promise<void> {
    const existing = this.metadata.get(id) || {};
    this.metadata.set(id, { ...existing, ...updates });
  }

  /**
   * 删除元数据
   */
  async delete(id: string): Promise<void> {
    this.metadata.delete(id);
  }

  /**
   * 查询元数据
   */
  async query(predicate: (metadata: Record<string, any>) => boolean): Promise<Array<{ id: string; metadata: Record<string, any> }>> {
    const results: Array<{ id: string; metadata: Record<string, any> }> = [];
    
    for (const [id, metadata] of this.metadata.entries()) {
      if (predicate(metadata)) {
        results.push({ id, metadata });
      }
    }

    return results;
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.metadata.clear();
  }
}




























































