/**
 * ChromaDB 向量存储实现
 */

import { ChromaClient } from 'chromadb';
import { BaseVectorStore } from '../BaseVectorStore';
import { VectorRecord, VectorSearchOptions, VectorSearchResult } from '../types';

export class ChromaDBStore extends BaseVectorStore {
  private client?: ChromaClient;
  private collection?: any;

  constructor(config: { host?: string; port?: number; collectionName: string; dimensions?: number }) {
    super({
      name: 'chromadb',
      collectionName: config.collectionName,
      dimensions: config.dimensions || 1536,
      ...config,
    });
  }

  async initialize(): Promise<void> {
    this.client = new ChromaClient({
      path: this.config.connectionString || 'http://localhost:8000',
    });

    this.collection = await this.client.getOrCreateCollection({
      name: this.config.collectionName!,
    });
  }

  async insert(record: VectorRecord): Promise<void> {
    await this.collection?.add({
      ids: [record.id],
      embeddings: [record.vector],
      metadatas: record.metadata ? [record.metadata] : undefined,
    });
  }

  async insertBatch(records: VectorRecord[]): Promise<void> {
    await this.collection?.add({
      ids: records.map((r) => r.id),
      embeddings: records.map((r) => r.vector),
      metadatas: records.map((r) => r.metadata),
    });
  }

  async search(vector: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]> {
    const results = await this.collection?.query({
      queryEmbeddings: [vector],
      nResults: options?.topK || 10,
      where: options?.filter,
    });

    if (!results || !results.ids || !results.distances) {
      return [];
    }

    return results.ids[0].map((id: string, index: number) => ({
      id,
      score: 1 - (results.distances![0][index] || 0), // 转换为相似度分数
      metadata: results.metadatas?.[0]?.[index],
    }));
  }

  async delete(id: string): Promise<void> {
    await this.collection?.delete({
      ids: [id],
    });
  }

  async deleteBatch(ids: string[]): Promise<void> {
    await this.collection?.delete({
      ids,
    });
  }

  async update(id: string, record: Partial<VectorRecord>): Promise<void> {
    await this.collection?.update({
      ids: [id],
      embeddings: record.vector ? [record.vector] : undefined,
      metadatas: record.metadata ? [record.metadata] : undefined,
    });
  }

  async get(id: string): Promise<VectorRecord | null> {
    const result = await this.collection?.get({
      ids: [id],
    });

    if (!result || !result.ids || result.ids.length === 0) {
      return null;
    }

    return {
      id: result.ids[0],
      vector: result.embeddings?.[0] || [],
      metadata: result.metadatas?.[0],
    };
  }

  async clear(): Promise<void> {
    await this.client?.deleteCollection({
      name: this.config.collectionName!,
    });
    await this.initialize();
  }

  async getStats(): Promise<{ totalVectors: number; dimensions: number }> {
    const count = await this.collection?.count();
    return {
      totalVectors: count || 0,
      dimensions: this.config.dimensions || 1536,
    };
  }

  async close(): Promise<void> {
    this.client = undefined;
    this.collection = undefined;
  }
}



















