/**
 * 父子索引向量存储 - 持久化版本
 * 使用 SQLite 存储父块和子块数据
 * 
 * ⚠️ 注意：此模块只能在 Node.js 环境（main 进程）中使用
 * 不能在浏览器环境（renderer 进程）中使用
 * 
 * 表结构：
 * - parents: 存储父块内容
 * - children: 存储子块内容和向量
 */

import type Database from 'better-sqlite3';
import { generateUUID } from '../utils/uuid.js';
import {
  ParentDocument,
  ChildDocument,
  ParentChildSearchResult,
  AddParentChildDocumentsOptions,
  ParentChildSearchOptions,
} from './ParentChildVectorStore.js';

/**
 * 父子索引向量存储 - 持久化版本
 */
export class ParentChildVectorStorePersistent {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath: string = ':memory:') {
    this.dbPath = dbPath;
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 动态导入 better-sqlite3（只在 Node.js 环境中可用）
    try {
      const DatabaseModule = await import('better-sqlite3');
      const DatabaseConstructor = DatabaseModule.default;
      this.db = new DatabaseConstructor(this.dbPath) as Database.Database;

    // 创建父表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parents (
        parent_id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // 创建子表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS children (
        child_id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL,
        content TEXT NOT NULL,
        vector BLOB NOT NULL,
        chunk_index INTEGER NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES parents(parent_id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);
      CREATE INDEX IF NOT EXISTS idx_children_chunk_index ON children(chunk_index);
    `);

      console.log('[ParentChildVectorStorePersistent] 数据库初始化完成:', this.dbPath);
    } catch (error) {
      console.error('[ParentChildVectorStorePersistent] 数据库初始化失败:', error);
      throw new Error('ParentChildVectorStorePersistent 只能在 Node.js 环境中使用');
    }
  }

  /**
   * 添加父子文档
   */
  async addParentChildDocuments(
    parentContents: string[],
    childContents: string[][],
    childVectors: number[][][],
    options: AddParentChildDocumentsOptions = {}
  ): Promise<string[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const parentIds: string[] = [];
    const now = Date.now();

    // 验证输入
    if (parentContents.length !== childContents.length || parentContents.length !== childVectors.length) {
      throw new Error('父块、子块内容和向量数组长度不匹配');
    }

    // 使用事务提高性能
    const insertParent = this.db.prepare(`
      INSERT INTO parents (parent_id, content, metadata, created_at)
      VALUES (?, ?, ?, ?)
    `);

    const insertChild = this.db.prepare(`
      INSERT INTO children (child_id, parent_id, content, vector, chunk_index, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < parentContents.length; i++) {
        const parentContent = parentContents[i];
        const childContentArray = childContents[i];
        const childVectorArray = childVectors[i];

        // 验证子块和向量数量
        if (childContentArray.length !== childVectorArray.length) {
          throw new Error(`父块 ${i} 的子块内容和向量数量不匹配`);
        }

        // 生成父块ID
        const parentId = generateUUID();
        parentIds.push(parentId);

        // 插入父块
        const parentMetadata = {
          filePath: options.filePath,
          fileName: options.fileName,
          fileType: options.fileType,
          knowledgeBaseId: options.knowledgeBaseId,
          chunkIndex: i,
          ...options,
        };

        insertParent.run(
          parentId,
          parentContent,
          JSON.stringify(parentMetadata),
          now
        );

        // 插入子块
        for (let j = 0; j < childContentArray.length; j++) {
          const childId = generateUUID();
          const childMetadata = {
            ...parentMetadata,
            parentChunkIndex: i,
            childChunkIndex: j,
          };

          // 将向量转换为 Buffer
          const vectorBuffer = Buffer.from(new Float32Array(childVectorArray[j]).buffer);

          insertChild.run(
            childId,
            parentId,
            childContentArray[j],
            vectorBuffer,
            j,
            JSON.stringify(childMetadata),
            now
          );
        }
      }
    });

    transaction();

    console.log(
      `[ParentChildVectorStorePersistent] 添加了 ${parentIds.length} 个父块，` +
      `${childContents.flat().length} 个子块`
    );

    return parentIds;
  }

  /**
   * 搜索
   */
  async search(
    queryVector: number[],
    options: ParentChildSearchOptions = {}
  ): Promise<ParentChildSearchResult[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const { topK = 5, filterMetadata, deduplicateParents = false } = options;

    // 获取所有子块
    let query = 'SELECT * FROM children';
    const params: any[] = [];

    // 元数据过滤
    if (filterMetadata) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(filterMetadata)) {
        conditions.push(`json_extract(metadata, '$.${key}') = ?`);
        params.push(value);
      }
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }
    }

    const children = this.db.prepare(query).all(...params) as Array<{
      child_id: string;
      parent_id: string;
      content: string;
      vector: Buffer;
      chunk_index: number;
      metadata: string;
      created_at: number;
    }>;

    // 计算相似度
    const childResults = children.map((child) => {
      // 将 Buffer 转换回向量
      const vector = Array.from(new Float32Array(child.vector.buffer));
      const similarity = this.cosineSimilarity(queryVector, vector);

      return {
        child,
        score: similarity,
      };
    });

    // 排序
    childResults.sort((a, b) => b.score - a.score);

    // 获取 topK
    let topChildren = childResults.slice(0, topK);

    // 去重父块
    if (deduplicateParents) {
      const seenParents = new Set<string>();
      topChildren = topChildren.filter((result) => {
        if (seenParents.has(result.child.parent_id)) {
          return false;
        }
        seenParents.add(result.child.parent_id);
        return true;
      });
    }

    // 回溯到父块
    const results: ParentChildSearchResult[] = [];
    for (const { child, score } of topChildren) {
      const parent = this.db.prepare('SELECT * FROM parents WHERE parent_id = ?').get(child.parent_id) as {
        parent_id: string;
        content: string;
        metadata: string;
        created_at: number;
      } | undefined;

      if (!parent) {
        console.warn(`[ParentChildVectorStorePersistent] 找不到父块: ${child.parent_id}`);
        continue;
      }

      results.push({
        childId: child.child_id,
        parentId: child.parent_id,
        childContent: child.content,
        parentContent: parent.content,
        score,
        chunkIndex: child.chunk_index,
        metadata: JSON.parse(child.metadata),
      });
    }

    return results;
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
   * 根据父块ID获取父块
   */
  async getParentById(parentId: string): Promise<ParentDocument | null> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const row = this.db.prepare('SELECT * FROM parents WHERE parent_id = ?').get(parentId) as {
      parent_id: string;
      content: string;
      metadata: string;
      created_at: number;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      parentId: row.parent_id,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    };
  }

  /**
   * 根据父块ID获取所有子块
   */
  async getChildrenByParentId(parentId: string): Promise<ChildDocument[]> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const rows = this.db.prepare('SELECT * FROM children WHERE parent_id = ? ORDER BY chunk_index').all(parentId) as Array<{
      child_id: string;
      parent_id: string;
      content: string;
      vector: Buffer;
      chunk_index: number;
      metadata: string;
      created_at: number;
    }>;

    return rows.map((row) => ({
      childId: row.child_id,
      parentId: row.parent_id,
      content: row.content,
      vector: Array.from(new Float32Array(row.vector.buffer)),
      chunkIndex: row.chunk_index,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at,
    }));
  }

  /**
   * 删除父块（级联删除所有子块）
   */
  async deleteParent(parentId: string): Promise<boolean> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const result = this.db.prepare('DELETE FROM parents WHERE parent_id = ?').run(parentId);
    
    console.log(`[ParentChildVectorStorePersistent] 删除了父块 ${parentId}`);
    return result.changes > 0;
  }

  /**
   * 根据元数据删除文档
   */
  async deleteByMetadata(filterMetadata: Record<string, unknown>): Promise<number> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const conditions: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(filterMetadata)) {
      conditions.push(`json_extract(metadata, '$.${key}') = ?`);
      params.push(value);
    }

    if (conditions.length === 0) {
      return 0;
    }

    const query = `DELETE FROM parents WHERE ${conditions.join(' AND ')}`;
    const result = this.db.prepare(query).run(...params);

    console.log(`[ParentChildVectorStorePersistent] 根据元数据删除了 ${result.changes} 个父块`);
    return result.changes;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    parentCount: number;
    childCount: number;
    avgChildrenPerParent: number;
  } {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    const parentCount = (this.db.prepare('SELECT COUNT(*) as count FROM parents').get() as { count: number }).count;
    const childCount = (this.db.prepare('SELECT COUNT(*) as count FROM children').get() as { count: number }).count;
    const avgChildrenPerParent = parentCount > 0 ? childCount / parentCount : 0;

    return {
      parentCount,
      childCount,
      avgChildrenPerParent,
    };
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('数据库未初始化');
    }

    this.db.exec('DELETE FROM children');
    this.db.exec('DELETE FROM parents');
    console.log('[ParentChildVectorStorePersistent] 已清空所有数据');
  }

  /**
   * 关闭数据库
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[ParentChildVectorStorePersistent] 数据库已关闭');
    }
  }
}
