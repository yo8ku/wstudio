/**
 * 元数据管理器
 */

export class MetadataManager {
  private metadata: Map<string, Record<string, any>> = new Map();

  /**
   * 设置元数据
   */
  set(id: string, metadata: Record<string, any>): void {
    this.metadata.set(id, metadata);
  }

  /**
   * 获取元数据
   */
  get(id: string): Record<string, any> | undefined {
    return this.metadata.get(id);
  }

  /**
   * 更新元数据
   */
  update(id: string, updates: Record<string, any>): void {
    const existing = this.metadata.get(id) || {};
    this.metadata.set(id, { ...existing, ...updates });
  }

  /**
   * 删除元数据
   */
  delete(id: string): void {
    this.metadata.delete(id);
  }

  /**
   * 查询元数据
   */
  query(predicate: (metadata: Record<string, any>) => boolean): Array<{ id: string; metadata: Record<string, any> }> {
    const results: Array<{ id: string; metadata: Record<string, any> }> = [];
    
    for (const [id, metadata] of this.metadata.entries()) {
      if (predicate(metadata)) {
        results.push({ id, metadata });
      }
    }

    return results;
  }

  /**
   * 清空所有元数据
   */
  clear(): void {
    this.metadata.clear();
  }

  /**
   * 获取元数据数量
   */
  size(): number {
    return this.metadata.size;
  }
}




























































