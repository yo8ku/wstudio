/**
 * 索引管理器
 */

import { FullTextIndex } from './FullTextIndex';
import { MetadataIndex } from './MetadataIndex';

export class IndexManager {
  private fullTextIndex: FullTextIndex;
  private metadataIndex: MetadataIndex;

  constructor() {
    this.fullTextIndex = new FullTextIndex();
    this.metadataIndex = new MetadataIndex();
  }

  /**
   * 添加文档到索引
   */
  async addDocument(id: string, content: string, metadata?: Record<string, any>): Promise<void> {
    await this.fullTextIndex.add(id, content);
    if (metadata) {
      await this.metadataIndex.add(id, metadata);
    }
  }

  /**
   * 全文搜索
   */
  async searchFullText(query: string, limit = 10): Promise<string[]> {
    return this.fullTextIndex.search(query, limit);
  }

  /**
   * 元数据搜索
   */
  async searchMetadata(filters: Record<string, any>): Promise<string[]> {
    return this.metadataIndex.search(filters);
  }

  /**
   * 删除文档索引
   */
  async deleteDocument(id: string): Promise<void> {
    await this.fullTextIndex.delete(id);
    await this.metadataIndex.delete(id);
  }

  /**
   * 清空所有索引
   */
  async clear(): Promise<void> {
    await this.fullTextIndex.clear();
    await this.metadataIndex.clear();
  }
}




























































