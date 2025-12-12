/**
 * 父子索引向量存储
 * 实现两表模式：父表存文本，子表存向量
 * 
 * 核心设计：
 * - 父表（parents）：存储完整的父块内容（1500字符），不做向量索引
 * - 子表（children）：存储子块向量（200字符），用于搜索
 * - 通过 parent_id 关联父子关系
 */

import { generateUUID } from '../utils/uuid.js';

/**
 * 父块数据结构
 */
export interface ParentDocument {
  /** 父块唯一标识（主键） */
  parentId: string;
  /** 父块完整内容（1500字符左右） */
  content: string;
  /** 父块元数据 */
  metadata: {
    /** 文件路径 */
    filePath?: string;
    /** 文件名 */
    fileName?: string;
    /** 文件类型 */
    fileType?: string;
    /** 知识库ID */
    knowledgeBaseId?: string;
    /** 父块索引 */
    chunkIndex?: number;
    /** 父块标签（如果使用标签切分） */
    tags?: string[];
    /** 切分方式 */
    chunkMethod?: 'tag' | 'token';
    /** 其他元数据 */
    [key: string]: unknown;
  };
  /** 创建时间 */
  createdAt: number;
}

/**
 * 子块数据结构
 */
export interface ChildDocument {
  /** 子块唯一标识（主键） */
  childId: string;
  /** 父块ID（外键，关键字段） */
  parentId: string;
  /** 子块内容（200字符左右） */
  content: string;
  /** 子块向量（768维） */
  vector: number[];
  /** 子块在父块中的索引 */
  chunkIndex: number;
  /** 子块元数据 */
  metadata: {
    /** 继承父块的元数据 */
    [key: string]: unknown;
  };
  /** 创建时间 */
  createdAt: number;
}

/**
 * 搜索结果
 */
export interface ParentChildSearchResult {
  /** 子块ID */
  childId: string;
  /** 父块ID */
  parentId: string;
  /** 子块内容 */
  childContent: string;
  /** 父块内容（完整上下文） */
  parentContent: string;
  /** 相似度分数 */
  score: number;
  /** 子块索引 */
  chunkIndex: number;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/**
 * 添加文档选项
 */
export interface AddParentChildDocumentsOptions {
  /** 知识库ID */
  knowledgeBaseId?: string;
  /** 文件路径 */
  filePath?: string;
  /** 文件名 */
  fileName?: string;
  /** 文件类型 */
  fileType?: string;
  /** 其他元数据 */
  [key: string]: unknown;
}

/**
 * 搜索选项
 */
export interface ParentChildSearchOptions {
  /** 返回结果数量 */
  topK?: number;
  /** 元数据过滤 */
  filterMetadata?: Record<string, unknown>;
  /** 是否去重父块（多个子块属于同一父块时只返回一次） */
  deduplicateParents?: boolean;
}

/**
 * 父子索引向量存储
 */
export class ParentChildVectorStore {
  /** 父表：存储父块内容 */
  private parents: Map<string, ParentDocument> = new Map();
  
  /** 子表：存储子块向量 */
  private children: Map<string, ChildDocument> = new Map();
  
  /** 父块ID索引：快速查找某个父块的所有子块 */
  private parentToChildren: Map<string, Set<string>> = new Map();

  constructor() {}

  /**
   * 初始化向量存储
   */
  async initialize(): Promise<void> {
    console.log('[ParentChildVectorStore] 父子索引向量存储已初始化');
  }

  /**
   * 添加父子文档
   * 
   * @param parentContents 父块内容数组
   * @param childContents 子块内容数组（二维数组，每个父块对应多个子块）
   * @param childVectors 子块向量数组（二维数组）
   * @param options 选项
   * @returns 父块ID数组
   */
  async addParentChildDocuments(
    parentContents: string[],
    childContents: string[][],
    childVectors: number[][][],
    options: AddParentChildDocumentsOptions = {}
  ): Promise<string[]> {
    const parentIds: string[] = [];
    const now = Date.now();

    // 验证输入
    if (parentContents.length !== childContents.length || parentContents.length !== childVectors.length) {
      throw new Error('父块、子块内容和向量数组长度不匹配');
    }

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

      // 存储父块
      const parentDoc: ParentDocument = {
        parentId,
        content: parentContent,
        metadata: {
          filePath: options.filePath,
          fileName: options.fileName,
          fileType: options.fileType,
          knowledgeBaseId: options.knowledgeBaseId,
          chunkIndex: i,
          ...options,
        },
        createdAt: now,
      };
      this.parents.set(parentId, parentDoc);

      // 初始化父块的子块集合
      this.parentToChildren.set(parentId, new Set());

      // 存储子块
      for (let j = 0; j < childContentArray.length; j++) {
        const childId = generateUUID();
        const childDoc: ChildDocument = {
          childId,
          parentId,
          content: childContentArray[j],
          vector: childVectorArray[j],
          chunkIndex: j,
          metadata: {
            ...parentDoc.metadata,
            parentChunkIndex: i,
            childChunkIndex: j,
          },
          createdAt: now,
        };

        this.children.set(childId, childDoc);
        this.parentToChildren.get(parentId)!.add(childId);
      }
    }

    console.log(
      `[ParentChildVectorStore] 添加了 ${parentIds.length} 个父块，` +
      `${childContents.flat().length} 个子块`
    );

    return parentIds;
  }

  /**
   * 搜索（核心功能）
   * 
   * 流程：
   * 1. 在子表中进行向量相似度搜索
   * 2. 获取匹配的子块
   * 3. 通过 parent_id 回溯到父块
   * 4. 返回父块的完整内容
   * 
   * @param queryVector 查询向量
   * @param options 搜索选项
   * @returns 搜索结果（包含父块完整内容）
   */
  async search(
    queryVector: number[],
    options: ParentChildSearchOptions = {}
  ): Promise<ParentChildSearchResult[]> {
    const { topK = 5, filterMetadata, deduplicateParents = false } = options;

    // 步骤 1：过滤子块
    let filteredChildren = Array.from(this.children.values());
    if (filterMetadata) {
      filteredChildren = filteredChildren.filter((child) => {
        return Object.entries(filterMetadata).every(
          ([key, value]) => child.metadata[key] === value
        );
      });
    }

    // 步骤 2：计算相似度
    const childResults = filteredChildren.map((child) => {
      const similarity = this.cosineSimilarity(queryVector, child.vector);
      return {
        child,
        score: similarity,
      };
    });

    // 步骤 3：排序
    childResults.sort((a, b) => b.score - a.score);

    // 步骤 4：获取 topK 子块
    let topChildren = childResults.slice(0, topK);

    // 步骤 5：去重父块（可选）
    if (deduplicateParents) {
      const seenParents = new Set<string>();
      topChildren = topChildren.filter((result) => {
        if (seenParents.has(result.child.parentId)) {
          return false;
        }
        seenParents.add(result.child.parentId);
        return true;
      });
    }

    // 步骤 6：回溯到父块，构建结果
    const results: ParentChildSearchResult[] = [];
    for (const { child, score } of topChildren) {
      const parent = this.parents.get(child.parentId);
      if (!parent) {
        console.warn(`[ParentChildVectorStore] 找不到父块: ${child.parentId}`);
        continue;
      }

      results.push({
        childId: child.childId,
        parentId: child.parentId,
        childContent: child.content,
        parentContent: parent.content, // 返回完整的父块内容
        score,
        chunkIndex: child.chunkIndex,
        metadata: child.metadata,
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
    return this.parents.get(parentId) || null;
  }

  /**
   * 根据父块ID获取所有子块
   */
  async getChildrenByParentId(parentId: string): Promise<ChildDocument[]> {
    const childIds = this.parentToChildren.get(parentId);
    if (!childIds) {
      return [];
    }

    const children: ChildDocument[] = [];
    for (const childId of childIds) {
      const child = this.children.get(childId);
      if (child) {
        children.push(child);
      }
    }

    return children.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * 删除父块（级联删除所有子块）
   */
  async deleteParent(parentId: string): Promise<boolean> {
    const parent = this.parents.get(parentId);
    if (!parent) {
      return false;
    }

    // 删除所有子块
    const childIds = this.parentToChildren.get(parentId);
    if (childIds) {
      for (const childId of childIds) {
        this.children.delete(childId);
      }
      this.parentToChildren.delete(parentId);
    }

    // 删除父块
    this.parents.delete(parentId);

    console.log(`[ParentChildVectorStore] 删除了父块 ${parentId} 及其所有子块`);
    return true;
  }

  /**
   * 根据元数据删除文档
   */
  async deleteByMetadata(filterMetadata: Record<string, unknown>): Promise<number> {
    const parentsToDelete: string[] = [];

    // 查找匹配的父块
    for (const [parentId, parent] of this.parents) {
      const matches = Object.entries(filterMetadata).every(
        ([key, value]) => parent.metadata[key] === value
      );
      if (matches) {
        parentsToDelete.push(parentId);
      }
    }

    // 删除父块及其子块
    for (const parentId of parentsToDelete) {
      await this.deleteParent(parentId);
    }

    console.log(`[ParentChildVectorStore] 根据元数据删除了 ${parentsToDelete.length} 个父块`);
    return parentsToDelete.length;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    parentCount: number;
    childCount: number;
    avgChildrenPerParent: number;
  } {
    const parentCount = this.parents.size;
    const childCount = this.children.size;
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
    this.parents.clear();
    this.children.clear();
    this.parentToChildren.clear();
    console.log('[ParentChildVectorStore] 已清空所有数据');
  }

  /**
   * 关闭存储
   */
  async close(): Promise<void> {
    console.log('[ParentChildVectorStore] 父子索引向量存储已关闭');
  }
}
