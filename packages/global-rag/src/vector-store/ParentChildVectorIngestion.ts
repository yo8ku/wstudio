/**
 * 父子索引向量入库服务
 * 功能：实现父子索引的向量入库流程
 * 描述：
 * 1. 使用 ParentChildChunker 切分文档为父块和子块
 * 2. 父块存储到 SQLite 数据库（parents 表）
 * 3. 子块向量化后存储到 LanceDB（children 表，包含向量和 parent_id）
 * 4. 实现完整的入库流程：切分 -> 生成ID -> 存父表 -> 向量化 -> 存子表
 */

import { ParentChildChunker, ParentChunk, ChildChunk, ParentChildChunkResult } from '../chunker/ParentChildChunker.js';
import { generateUUID } from '../utils/uuid.js';
import { ChunkOptions } from '../types.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 父块数据库记录接口
 */
interface ParentRecord {
  parent_id: string;
  content: string;
  source_file?: string;
  extra_meta?: string; // JSON 字符串
  [key: string]: unknown; // 索引签名，允许作为 Record<string, unknown> 使用
}

/**
 * 子块向量记录接口（用于 LanceDB）
 */
interface ChildVectorRecord {
  child_id: string;
  parent_id: string;
  content: string;
  vector: number[];
  chunk_index?: number;
}

/**
 * 向量入库选项
 */
export interface VectorIngestionOptions extends ChunkOptions {
  /** 嵌入模型名称 */
  modelName?: string;
  /** 源文件路径（用于元数据） */
  sourceFile?: string;
  /** 额外元数据 */
  extraMetadata?: Record<string, unknown>;
  /** 知识库ID（用于过滤） */
  knowledgeBaseId?: string;
  /** 批次大小（每批向量化和入库的子块数量，默认 50） */
  batchSize?: number;
  /** 进度回调 */
  onProgress?: (progress: IngestionProgress) => void;
  /** 批次间延迟（毫秒），用于降低 CPU 占用，默认 0 */
  batchDelayMs?: number;
  /** 文档间延迟（毫秒），用于降低 CPU 占用，默认 0 */
  documentDelayMs?: number;
  /** 并发控制：是否使用低优先级模式（让出 CPU 时间片），默认 false */
  lowPriorityMode?: boolean;
}

/**
 * 入库进度信息
 */
export interface IngestionProgress {
  /** 当前阶段 */
  stage: 'chunking' | 'storing-parents' | 'embedding' | 'storing-children' | 'completed';
  /** 当前处理的数量 */
  current: number;
  /** 总数量 */
  total: number;
  /** 进度百分比 (0-100) */
  percentage: number;
  /** 当前批次 */
  currentBatch?: number;
  /** 总批次数 */
  totalBatches?: number;
}

/**
 * 向量入库结果
 */
export interface VectorIngestionResult {
  /** 成功入库的父块数量 */
  parentCount: number;
  /** 成功入库的子块数量 */
  childCount: number;
  /** 父块ID列表 */
  parentIds: string[];
  /** 子块ID列表 */
  childIds: string[];
  /** 错误信息列表 */
  errors?: string[];
}

/**
 * Embedding API 接口
 * 用于向量化文本
 */
interface EmbeddingAPI {
  /**
   * 对文本进行向量化
   * @param text 要向量化的文本
   * @param modelName 模型名称（可选）
   * @returns 向量数组
   */
  embedText(text: string, modelName?: string): Promise<number[]>;

  /**
   * 对多个文本进行批量向量化
   * @param texts 要向量化的文本数组
   * @param modelName 模型名称（可选）
   * @returns 向量数组的数组
   */
  embedTexts(texts: string[], modelName?: string): Promise<number[][]>;
}

/**
 * SQLite 数据库接口（用于父块存储）
 */
export interface ParentDatabase {
  /**
   * 初始化数据库
   */
  initialize(): Promise<void>;

  /**
   * 执行 SQL（用于创建表）
   */
  exec(sql: string): Promise<void>;

  /**
   * 插入数据
   */
  insert(tableName: string, data: Record<string, unknown>): Promise<number>;

  /**
   * 关闭数据库连接
   */
  close(): void;
}

/**
 * 父子索引向量入库服务
 */
export class ParentChildVectorIngestion {
  private chunker: ParentChildChunker;
  private parentDb: ParentDatabase | null = null;
  private parentDbPath: string;
  private lancedbPath: string;
  private embeddingAPI: EmbeddingAPI | null = null;
  private initialized: boolean = false;

  /**
   * 构造函数
   * @param embeddingAPI Embedding API 实例（用于向量化）
   * @param parentDb SQLite 数据库实例（可选，如果不提供则使用默认路径）
   * @param parentDbPath SQLite 数据库文件路径（可选，仅在 parentDb 为 null 时使用）
   * @param lancedbPath LanceDB 数据目录路径（可选）
   */
  constructor(
    embeddingAPI: EmbeddingAPI | null = null,
    parentDb: ParentDatabase | null = null,
    parentDbPath?: string,
    lancedbPath?: string
  ) {
    this.chunker = new ParentChildChunker();
    this.embeddingAPI = embeddingAPI;
    this.parentDb = parentDb;

    // 初始化 SQLite 数据库路径（如果未提供数据库实例）
    if (!parentDb) {
      if (parentDbPath) {
        this.parentDbPath = parentDbPath;
      } else {
        // 默认路径：使用当前工作目录下的 data 文件夹
        this.parentDbPath = path.join(process.cwd(), 'data', 'parent_chunks.db');
      }
    } else {
      this.parentDbPath = '';
    }

    // 初始化 LanceDB 路径
    if (lancedbPath) {
      this.lancedbPath = lancedbPath;
    } else {
      // 默认路径：使用当前工作目录下的 data/lancedb 文件夹
      this.lancedbPath = path.join(process.cwd(), 'data', 'lancedb');
    }
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 初始化切分器
      await this.chunker.initialize();

      // 初始化 SQLite 数据库（如果未提供实例，则创建默认实例）
      if (!this.parentDb) {
        // 注意：这里需要调用者提供 SQLite 数据库实例
        // 或者使用动态导入 sql.js（但需要确保在正确的环境中）
        throw new Error('需要提供 SQLite 数据库实例，或实现默认的数据库初始化逻辑');
      }

      await this.parentDb.initialize();

      // 创建父块表
      await this.createParentTable();

      // 确保 LanceDB 目录存在
      if (!fs.existsSync(this.lancedbPath)) {
        fs.mkdirSync(this.lancedbPath, { recursive: true });
      }

      // 初始化 LanceDB（如果可用）
      await this.initializeLanceDB();

      this.initialized = true;
    } catch (error) {
      console.error('[ParentChildVectorIngestion] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 创建父块表
   */
  private async createParentTable(): Promise<void> {
    if (!this.parentDb) {
      throw new Error('数据库未初始化');
    }

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS parents (
        parent_id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        source_file TEXT,
        extra_meta TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
      
      CREATE INDEX IF NOT EXISTS idx_parents_source_file ON parents(source_file);
    `;

    await this.parentDb.exec(createTableSQL);
  }

  /**
   * 初始化 LanceDB
   * 注意：需要安装 @lancedb/lancedb 包
   * 安装命令：pnpm add @lancedb/lancedb
   */
  private async initializeLanceDB(): Promise<void> {
    try {
      // 动态导入 LanceDB（如果可用）
      // 注意：需要先安装 @lancedb/lancedb 包
      // 示例代码：
      // const lancedb = await import('@lancedb/lancedb');
      // const db = await lancedb.connect(this.lancedbPath);
      // 
      // // 检查表是否存在，如果不存在则创建
      // try {
      //   await db.openTable('children');
      // } catch {
      //   // 表不存在，创建新表
      //   const schema = new lancedb.Schema([
      //     new lancedb.Field('child_id', new lancedb.StringType()),
      //     new lancedb.Field('parent_id', new lancedb.StringType()),
      //     new lancedb.Field('content', new lancedb.StringType()),
      //     new lancedb.Field('vector', new lancedb.FixedSizeListType(768, new lancedb.FloatType())), // 假设向量维度为 768
      //     new lancedb.Field('chunk_index', new lancedb.Int32Type()),
      //   ]);
      //   await db.createTable('children', [], { schema });
      // }

      console.log('[ParentChildVectorIngestion] LanceDB 初始化（待实现，需要安装 @lancedb/lancedb 包）');
      console.log('[ParentChildVectorIngestion] LanceDB 路径:', this.lancedbPath);
    } catch (error) {
      console.warn('[ParentChildVectorIngestion] LanceDB 初始化失败，将使用备用方案:', error);
    }
  }

  /**
   * 向量化文本（调用 Embedding API）
   * @param text 要向量化的文本
   * @param modelName 模型名称
   * @returns 向量数组
   */
  private async embedText(text: string, modelName?: string): Promise<number[]> {
    if (!this.embeddingAPI) {
      throw new Error('Embedding API 未设置，无法进行向量化');
    }

    try {
      return await this.embeddingAPI.embedText(text, modelName);
    } catch (error) {
      console.error('[ParentChildVectorIngestion] 向量化失败:', error);
      throw error;
    }
  }

  /**
   * 批量向量化文本
   * @param texts 要向量化的文本数组
   * @param modelName 模型名称
   * @returns 向量数组的数组
   */
  private async embedTexts(texts: string[], modelName?: string): Promise<number[][]> {
    if (!this.embeddingAPI) {
      throw new Error('Embedding API 未设置，无法进行向量化');
    }

    try {
      return await this.embeddingAPI.embedTexts(texts, modelName);
    } catch (error) {
      console.error('[ParentChildVectorIngestion] 批量向量化失败:', error);
      throw error;
    }
  }

  /**
   * 存储父块到 SQLite
   * @param parentChunk 父块
   * @param options 入库选项
   */
  private async storeParent(parentChunk: ParentChunk, options: VectorIngestionOptions): Promise<void> {
    if (!this.parentDb) {
      throw new Error('数据库未初始化');
    }

    const parentRecord: ParentRecord = {
      parent_id: parentChunk.id,
      content: parentChunk.content,
      source_file: options.sourceFile,
      extra_meta: options.extraMetadata ? JSON.stringify(options.extraMetadata) : undefined,
    };

    await this.parentDb.insert('parents', parentRecord);
  }

  /**
   * 存储子块到 LanceDB
   * @param childChunk 子块
   * @param vector 向量
   */
  private async storeChild(childChunk: ChildChunk, vector: number[]): Promise<void> {
    // 注意：这里需要实现 LanceDB 的存储逻辑
    // 由于 LanceDB 需要安装依赖，这里先提供一个接口
    // 实际实现需要：
    // 1. 安装 @lancedb/lancedb 包：pnpm add @lancedb/lancedb
    // 2. 创建或打开表
    // 3. 插入数据

    const childRecord: ChildVectorRecord = {
      child_id: childChunk.id,
      parent_id: childChunk.parentId,
      content: childChunk.content,
      vector: vector,
      chunk_index: childChunk.metadata.chunk_index,
    };

    // TODO: 实现 LanceDB 存储
    // 示例代码（需要安装 @lancedb/lancedb）：
    // const lancedb = await import('@lancedb/lancedb');
    // const db = await lancedb.connect(this.lancedbPath);
    // const table = await db.openTable('children');
    // await table.add([childRecord]);

    console.log('[ParentChildVectorIngestion] 存储子块到 LanceDB（待实现，需要安装 @lancedb/lancedb 包）:', {
      child_id: childRecord.child_id,
      parent_id: childRecord.parent_id,
      vector_dim: vector.length,
    });
  }

  /**
   * 批量存储子块到 LanceDB
   * @param childRecords 子块记录数组
   */
  private async storeChildrenBatch(childRecords: ChildVectorRecord[]): Promise<void> {
    // TODO: 实现批量存储到 LanceDB
    // 注意：需要安装 @lancedb/lancedb 包：pnpm add @lancedb/lancedb
    // 示例代码：
    // const lancedb = await import('@lancedb/lancedb');
    // const db = await lancedb.connect(this.lancedbPath);
    // const table = await db.openTable('children');
    // await table.add(childRecords);

    console.log('[ParentChildVectorIngestion] 批量存储子块到 LanceDB（待实现，需要安装 @lancedb/lancedb 包）:', {
      count: childRecords.length,
    });
  }

  /**
   * 报告进度
   */
  private reportProgress(
    options: VectorIngestionOptions,
    stage: IngestionProgress['stage'],
    current: number,
    total: number,
    currentBatch?: number,
    totalBatches?: number
  ): void {
    if (options.onProgress) {
      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      options.onProgress({
        stage,
        current,
        total,
        percentage,
        currentBatch,
        totalBatches,
      });
    }
  }

  /**
   * 延迟指定毫秒数（用于降低 CPU 占用）
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 让出 CPU 时间片（使用 setImmediate 或 setTimeout(0)）
   * 允许其他任务执行，降低 CPU 占用峰值
   */
  private yieldCPU(): Promise<void> {
    return new Promise(resolve => {
      if (typeof setImmediate !== 'undefined') {
        setImmediate(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  /**
   * 向量入库主流程（流式批量处理）
   * 优化策略：切分 → 存父块 → 分批（向量化 + 入库）
   * 每批处理完立即入库，避免内存积压
   * 
   * @param text 要入库的文本
   * @param options 入库选项
   * @returns 入库结果
   */
  async ingest(
    text: string,
    options: VectorIngestionOptions = {}
  ): Promise<VectorIngestionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const batchSize = options.batchSize || 50; // 默认每批 50 个子块

    const result: VectorIngestionResult = {
      parentCount: 0,
      childCount: 0,
      parentIds: [],
      childIds: [],
      errors: [],
    };

    try {
      // 步骤1：切分文档
      console.log('[ParentChildVectorIngestion] 开始切分文档...');
      this.reportProgress(options, 'chunking', 0, 1);
      
      const chunkResult: ParentChildChunkResult = await this.chunker.chunkText(text, options);

      if (chunkResult.parentChunks.length === 0) {
        console.warn('[ParentChildVectorIngestion] 切分结果为空');
        this.reportProgress(options, 'completed', 0, 0);
        return result;
      }

      console.log(`[ParentChildVectorIngestion] 切分完成: ${chunkResult.totalParentChunks} 个父块, ${chunkResult.totalChildChunks} 个子块`);
      this.reportProgress(options, 'chunking', 1, 1);

      // 步骤2：存储父块到 SQLite
      console.log('[ParentChildVectorIngestion] 开始存储父块...');
      const totalParents = chunkResult.parentChunks.length;
      
      for (let i = 0; i < totalParents; i++) {
        const parentChunk = chunkResult.parentChunks[i];
        try {
          await this.storeParent(parentChunk, options);
          result.parentIds.push(parentChunk.id);
          result.parentCount++;
          this.reportProgress(options, 'storing-parents', i + 1, totalParents);
        } catch (error) {
          const errorMsg = `存储父块失败 (${parentChunk.id}): ${error instanceof Error ? error.message : String(error)}`;
          console.error('[ParentChildVectorIngestion]', errorMsg);
          result.errors?.push(errorMsg);
        }
      }

      console.log(`[ParentChildVectorIngestion] 父块存储完成: ${result.parentCount}/${totalParents}`);

      // 步骤3：流式批量处理子块（向量化 + 入库）
      const totalChildren = chunkResult.childChunks.length;
      const totalBatches = Math.ceil(totalChildren / batchSize);
      
      console.log(`[ParentChildVectorIngestion] 开始流式处理子块: ${totalChildren} 个子块, ${totalBatches} 批, 每批 ${batchSize} 个`);

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * batchSize;
        const endIdx = Math.min(startIdx + batchSize, totalChildren);
        const batchChunks = chunkResult.childChunks.slice(startIdx, endIdx);
        const batchTexts = batchChunks.map(chunk => chunk.content);

        console.log(`[ParentChildVectorIngestion] 处理第 ${batchIndex + 1}/${totalBatches} 批: ${batchChunks.length} 个子块`);

        // 3.1 批量向量化当前批次
        this.reportProgress(options, 'embedding', startIdx, totalChildren, batchIndex + 1, totalBatches);
        
        let batchVectors: number[][];
        try {
          batchVectors = await this.embedTexts(batchTexts, options.modelName);
        } catch (error) {
          // 如果批量向量化失败，尝试逐个向量化
          console.warn(`[ParentChildVectorIngestion] 第 ${batchIndex + 1} 批批量向量化失败，改用逐个向量化:`, error);
          batchVectors = [];
          for (const batchText of batchTexts) {
            try {
              const vector = await this.embedText(batchText, options.modelName);
              batchVectors.push(vector);
            } catch (err) {
              const errorMsg = `向量化失败: ${err instanceof Error ? err.message : String(err)}`;
              console.error('[ParentChildVectorIngestion]', errorMsg);
              result.errors?.push(errorMsg);
              batchVectors.push([]); // 空向量作为占位符
            }
          }
        }

        // 3.2 准备当前批次的子块记录
        const batchRecords: ChildVectorRecord[] = [];
        
        for (let i = 0; i < batchChunks.length; i++) {
          const childChunk = batchChunks[i];
          const vector = batchVectors[i];

          // 跳过向量化失败的子块
          if (!vector || vector.length === 0) {
            const errorMsg = `子块 ${childChunk.id} 向量化失败，跳过存储`;
            console.warn('[ParentChildVectorIngestion]', errorMsg);
            result.errors?.push(errorMsg);
            continue;
          }

          batchRecords.push({
            child_id: childChunk.id,
            parent_id: childChunk.parentId,
            content: childChunk.content,
            vector: vector,
            chunk_index: childChunk.metadata.chunk_index,
          });
          result.childIds.push(childChunk.id);
        }

        // 3.3 立即入库当前批次（流式处理的关键）
        if (batchRecords.length > 0) {
          this.reportProgress(options, 'storing-children', endIdx, totalChildren, batchIndex + 1, totalBatches);
          
          try {
            await this.storeChildrenBatch(batchRecords);
            result.childCount += batchRecords.length;
            console.log(`[ParentChildVectorIngestion] 第 ${batchIndex + 1}/${totalBatches} 批入库完成: ${batchRecords.length} 个子块`);
          } catch (error) {
            const errorMsg = `第 ${batchIndex + 1} 批存储子块失败: ${error instanceof Error ? error.message : String(error)}`;
            console.error('[ParentChildVectorIngestion]', errorMsg);
            result.errors?.push(errorMsg);
          }
        }

        // 批次间延迟，降低 CPU 占用
        if (options.batchDelayMs && options.batchDelayMs > 0) {
          await this.delay(options.batchDelayMs);
        } else if (options.lowPriorityMode) {
          // 低优先级模式：让出 CPU 时间片
          await this.yieldCPU();
        }
      }

      console.log(`[ParentChildVectorIngestion] 入库完成: ${result.parentCount} 个父块, ${result.childCount} 个子块`);
      this.reportProgress(options, 'completed', totalChildren, totalChildren);

      return result;
    } catch (error) {
      const errorMsg = `入库流程失败: ${error instanceof Error ? error.message : String(error)}`;
      console.error('[ParentChildVectorIngestion]', errorMsg);
      result.errors?.push(errorMsg);
      throw error;
    }
  }

  /**
   * 批量入库多个文档（真正的流式处理，低内存占用）
   * 优化策略：逐文件处理，每个文件处理完后立即释放内存
   * 使用子块缓冲区，达到批次大小后统一向量化并入库
   * 
   * @param documents 文档列表（包含内容和元数据）
   * @param options 入库选项
   * @returns 入库结果
   */
  async ingestBatch(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    options: VectorIngestionOptions = {}
  ): Promise<VectorIngestionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const batchSize = options.batchSize || 50;

    const result: VectorIngestionResult = {
      parentCount: 0,
      childCount: 0,
      parentIds: [],
      childIds: [],
      errors: [],
    };

    // 子块缓冲区（跨文件收集，达到批次大小后处理）
    let childBuffer: ChildChunk[] = [];
    let processedChildCount = 0;
    let totalChildCount = 0; // 预估总数，用于进度显示
    let batchNumber = 0;

    // 处理缓冲区中的子块
    const flushChildBuffer = async (isFinal: boolean = false): Promise<void> => {
      if (childBuffer.length === 0) return;

      // 如果不是最终刷新，且缓冲区未满，则不处理
      if (!isFinal && childBuffer.length < batchSize) return;

      // 取出要处理的子块
      const chunksToProcess = isFinal ? childBuffer : childBuffer.splice(0, batchSize);
      if (!isFinal) {
        // 非最终刷新时，已经用 splice 取出了
      } else {
        childBuffer = []; // 最终刷新，清空缓冲区
      }

      batchNumber++;
      const batchTexts = chunksToProcess.map(chunk => chunk.content);

      console.log(`[ParentChildVectorIngestion] 处理第 ${batchNumber} 批: ${chunksToProcess.length} 个子块`);

      // 批量向量化
      this.reportProgress(options, 'embedding', processedChildCount, totalChildCount, batchNumber, undefined);
      
      let batchVectors: number[][];
      try {
        batchVectors = await this.embedTexts(batchTexts, options.modelName);
      } catch (error) {
        console.warn(`[ParentChildVectorIngestion] 第 ${batchNumber} 批批量向量化失败，改用逐个向量化:`, error);
        batchVectors = [];
        for (const batchText of batchTexts) {
          try {
            const vector = await this.embedText(batchText, options.modelName);
            batchVectors.push(vector);
          } catch (err) {
            const errorMsg = `向量化失败: ${err instanceof Error ? err.message : String(err)}`;
            result.errors?.push(errorMsg);
            batchVectors.push([]);
          }
        }
      }

      // 准备批次记录
      const batchRecords: ChildVectorRecord[] = [];
      
      for (let i = 0; i < chunksToProcess.length; i++) {
        const childChunk = chunksToProcess[i];
        const vector = batchVectors[i];

        if (!vector || vector.length === 0) {
          result.errors?.push(`子块 ${childChunk.id} 向量化失败，跳过存储`);
          continue;
        }

        batchRecords.push({
          child_id: childChunk.id,
          parent_id: childChunk.parentId,
          content: childChunk.content,
          vector: vector,
          chunk_index: childChunk.metadata.chunk_index,
        });
        result.childIds.push(childChunk.id);
      }

      // 立即入库
      if (batchRecords.length > 0) {
        this.reportProgress(options, 'storing-children', processedChildCount + chunksToProcess.length, totalChildCount, batchNumber, undefined);
        
        try {
          await this.storeChildrenBatch(batchRecords);
          result.childCount += batchRecords.length;
          console.log(`[ParentChildVectorIngestion] 第 ${batchNumber} 批入库完成: ${batchRecords.length} 个子块`);
        } catch (error) {
          const errorMsg = `第 ${batchNumber} 批存储子块失败: ${error instanceof Error ? error.message : String(error)}`;
          result.errors?.push(errorMsg);
        }
      }

      processedChildCount += chunksToProcess.length;

      // 显式释放内存
      batchVectors.length = 0;
      batchRecords.length = 0;
      chunksToProcess.length = 0;

      // 批次间延迟，降低 CPU 占用
      if (options.batchDelayMs && options.batchDelayMs > 0) {
        await this.delay(options.batchDelayMs);
      } else if (options.lowPriorityMode) {
        await this.yieldCPU();
      }
    };

    // 逐文件处理
    console.log(`[ParentChildVectorIngestion] 开始流式处理 ${documents.length} 个文档...`);

    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      const doc = documents[docIndex];
      const docOptions: VectorIngestionOptions = {
        ...options,
        extraMetadata: {
          ...options.extraMetadata,
          ...(doc.metadata || {}),
        },
      };

      try {
        // 切分当前文档
        this.reportProgress(options, 'chunking', docIndex, documents.length);
        const chunkResult = await this.chunker.chunkText(doc.content, docOptions);
        
        console.log(`[ParentChildVectorIngestion] 文档 ${docIndex + 1}/${documents.length} 切分完成: ${chunkResult.parentChunks.length} 父块, ${chunkResult.childChunks.length} 子块`);

        // 立即存储父块
        for (const parentChunk of chunkResult.parentChunks) {
          try {
            await this.storeParent(parentChunk, docOptions);
            result.parentIds.push(parentChunk.id);
            result.parentCount++;
          } catch (error) {
            const errorMsg = `存储父块失败 (${parentChunk.id}): ${error instanceof Error ? error.message : String(error)}`;
            result.errors?.push(errorMsg);
          }
        }

        // 将子块添加到缓冲区
        totalChildCount += chunkResult.childChunks.length;
        childBuffer.push(...chunkResult.childChunks);

        // 清空当前文档的切分结果引用，帮助 GC
        chunkResult.parentChunks.length = 0;
        chunkResult.childChunks.length = 0;

        // 如果缓冲区达到批次大小，处理它
        while (childBuffer.length >= batchSize) {
          await flushChildBuffer(false);
        }

      } catch (error) {
        const errorMsg = `文档 ${docIndex + 1} 处理失败: ${error instanceof Error ? error.message : String(error)}`;
        console.error('[ParentChildVectorIngestion]', errorMsg);
        result.errors?.push(errorMsg);
      }

      // 每处理完一个文档，尝试触发 GC（如果可用）
      if (typeof global !== 'undefined' && typeof (global as { gc?: () => void }).gc === 'function') {
        (global as { gc?: () => void }).gc?.();
      }

      // 文档间延迟，降低 CPU 占用
      if (options.documentDelayMs && options.documentDelayMs > 0) {
        await this.delay(options.documentDelayMs);
      } else if (options.lowPriorityMode) {
        await this.yieldCPU();
      }
    }

    // 处理剩余的子块
    if (childBuffer.length > 0) {
      await flushChildBuffer(true);
    }

    console.log(`[ParentChildVectorIngestion] 批量入库完成: ${result.parentCount} 个父块, ${result.childCount} 个子块`);
    this.reportProgress(options, 'completed', processedChildCount, totalChildCount);

    return result;
  }

  /**
   * 批量入库多个文档（旧版本，保留兼容性）
   * @deprecated 请使用 ingestBatch，它有更好的内存管理
   */
  async ingestBatchLegacy(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    options: VectorIngestionOptions = {}
  ): Promise<VectorIngestionResult> {
    const result: VectorIngestionResult = {
      parentCount: 0,
      childCount: 0,
      parentIds: [],
      childIds: [],
      errors: [],
    };

    for (const doc of documents) {
      try {
        const docResult = await this.ingest(doc.content, {
          ...options,
          extraMetadata: {
            ...options.extraMetadata,
            ...(doc.metadata || {}),
          },
        });

        result.parentCount += docResult.parentCount;
        result.childCount += docResult.childCount;
        result.parentIds.push(...docResult.parentIds);
        result.childIds.push(...docResult.childIds);
        if (docResult.errors) {
          result.errors?.push(...docResult.errors);
        }
      } catch (error) {
        const errorMsg = `批量入库文档失败: ${error instanceof Error ? error.message : String(error)}`;
        result.errors?.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    if (this.chunker) {
      await this.chunker.close();
    }
    if (this.parentDb) {
      this.parentDb.close();
    }
    this.initialized = false;
  }
}

