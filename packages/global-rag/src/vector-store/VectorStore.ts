/**
 * 向量存储管理器
 * 使用本地实现，不依赖 Python
 */

import { DocumentMetadata, SearchResult, AddDocumentsOptions, SearchOptions } from '../types.js';

export class VectorStore {
  private documents: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata: DocumentMetadata;
  }> = [];
  private nextId = 1;

  constructor() {}

  /**
   * 初始化向量存储管理器
   */
  async initialize(): Promise<void> {
    // 本地实现，无需初始化
    console.log('[VectorStore] 本地向量存储已初始化');
  }

  /**
   * 添加文档到向量存储
   * 注意：此方法需要外部提供向量，不再自动生成
   */
  async addDocuments(
    texts: string[],
    metadatas: DocumentMetadata[],
    embeddings: number[][],
    options: AddDocumentsOptions = {}
  ): Promise<string[]> {
    const ids: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const id = `doc_${this.nextId++}`;
      this.documents.push({
        id,
        text: texts[i],
        embedding: embeddings[i],
        metadata: metadatas[i] || {},
      });
      ids.push(id);
    }

    console.log(`[VectorStore] 添加了 ${texts.length} 个文档`);
    return ids;
  }

  /**
   * 搜索向量存储
   * 使用余弦相似度进行搜索
   */
  async search(
    query: string,
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const { topK = 5, filterMetadata } = options;

    // 过滤文档
    let filteredDocs = this.documents;
    if (filterMetadata) {
      filteredDocs = this.documents.filter((doc) => {
        return Object.entries(filterMetadata).every(
          ([key, value]) => doc.metadata[key] === value
        );
      });
    }

    // 计算余弦相似度
    const results = filteredDocs.map((doc) => {
      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      return {
        id: doc.id,
        text: doc.text,
        metadata: doc.metadata,
        score: similarity,
      };
    });

    // 排序并返回 topK
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * 删除文档
   */
  async deleteDocuments(ids: string[]): Promise<boolean> {
    const idsSet = new Set(ids);
    const beforeCount = this.documents.length;
    this.documents = this.documents.filter((doc) => !idsSet.has(doc.id));
    const deletedCount = beforeCount - this.documents.length;
    console.log(`[VectorStore] 删除了 ${deletedCount} 个文档`);
    return deletedCount > 0;
  }

  /**
   * 根据元数据查询文档ID
   */
  async getIdsByMetadata(
    filterMetadata: Record<string, unknown>
  ): Promise<string[]> {
    const filteredDocs = this.documents.filter((doc) => {
      return Object.entries(filterMetadata).every(
        ([key, value]) => doc.metadata[key] === value
      );
    });
    return filteredDocs.map((doc) => doc.id);
  }

  /**
   * 获取所有文档数量
   */
  getDocumentCount(): number {
    return this.documents.length;
  }

  /**
   * 清空所有文档
   */
  async clear(): Promise<void> {
    this.documents = [];
    this.nextId = 1;
    console.log('[VectorStore] 已清空所有文档');
  }

  /**
   * 关闭管理器
   */
  async close(): Promise<void> {
    // 本地实现，无需关闭
    console.log('[VectorStore] 向量存储已关闭');
  }
}
