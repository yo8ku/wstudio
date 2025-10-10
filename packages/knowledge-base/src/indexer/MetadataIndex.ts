/**
 * 元数据索引
 */

export class MetadataIndex {
  private index: Map<string, Record<string, any>> = new Map();

  /**
   * 添加元数据
   */
  async add(id: string, metadata: Record<string, any>): Promise<void> {
    this.index.set(id, metadata);
  }

  /**
   * 搜索
   */
  async search(filters: Record<string, any>): Promise<string[]> {
    const results: string[] = [];

    for (const [id, metadata] of this.index.entries()) {
      if (this.matchesFilters(metadata, filters)) {
        results.push(id);
      }
    }

    return results;
  }

  /**
   * 删除元数据
   */
  async delete(id: string): Promise<void> {
    this.index.delete(id);
  }

  /**
   * 清空索引
   */
  async clear(): Promise<void> {
    this.index.clear();
  }

  /**
   * 检查元数据是否匹配过滤条件
   */
  private matchesFilters(metadata: Record<string, any>, filters: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filters)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}




























































