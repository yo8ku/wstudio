/**
 * 文档存储
 */

import { Document } from '../core/types';

export class DocumentStore {
  private documents: Map<string, Document> = new Map();

  /**
   * 保存文档
   */
  async save(document: Document): Promise<void> {
    this.documents.set(document.id, document);
  }

  /**
   * 批量保存
   */
  async saveBatch(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
  }

  /**
   * 获取文档
   */
  async get(id: string): Promise<Document | null> {
    return this.documents.get(id) || null;
  }

  /**
   * 列出文档
   */
  async list(offset = 0, limit = 50): Promise<{ documents: Document[]; total: number }> {
    const all = Array.from(this.documents.values());
    const documents = all.slice(offset, offset + limit);
    
    return {
      documents,
      total: all.length,
    };
  }

  /**
   * 更新文档
   */
  async update(id: string, updates: Partial<Document>): Promise<Document | null> {
    const doc = this.documents.get(id);
    if (!doc) return null;

    const updated = { ...doc, ...updates, updatedAt: new Date() };
    this.documents.set(id, updated);
    return updated;
  }

  /**
   * 删除文档
   */
  async delete(id: string): Promise<void> {
    this.documents.delete(id);
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.documents.clear();
  }

  /**
   * 搜索文档
   */
  async search(query: string): Promise<Document[]> {
    const results: Document[] = [];
    
    for (const doc of this.documents.values()) {
      if (doc.title.includes(query) || doc.content.includes(query)) {
        results.push(doc);
      }
    }

    return results;
  }
}




































































