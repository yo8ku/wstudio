/**
 * 分块存储
 */

import { DocumentChunk } from '../core/types';

export class ChunkStore {
  private chunks: Map<string, DocumentChunk> = new Map();

  /**
   * 保存分块
   */
  async save(chunk: DocumentChunk): Promise<void> {
    this.chunks.set(chunk.id, chunk);
  }

  /**
   * 批量保存
   */
  async saveBatch(chunks: DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      this.chunks.set(chunk.id, chunk);
    }
  }

  /**
   * 获取分块
   */
  async get(id: string): Promise<DocumentChunk | null> {
    return this.chunks.get(id) || null;
  }

  /**
   * 根据文档ID获取所有分块
   */
  async getByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    const results: DocumentChunk[] = [];
    
    for (const chunk of this.chunks.values()) {
      if (chunk.documentId === documentId) {
        results.push(chunk);
      }
    }

    return results.sort((a, b) => a.position - b.position);
  }

  /**
   * 删除分块
   */
  async delete(id: string): Promise<void> {
    this.chunks.delete(id);
  }

  /**
   * 删除文档的所有分块
   */
  async deleteByDocumentId(documentId: string): Promise<void> {
    const toDelete: string[] = [];
    
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.documentId === documentId) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.chunks.delete(id);
    }
  }

  /**
   * 清空存储
   */
  async clear(): Promise<void> {
    this.chunks.clear();
  }

  /**
   * 获取分块总数
   */
  async count(): Promise<number> {
    return this.chunks.size;
  }
}




































































