/**
 * 知识库向量入库服务
 * 功能：实现知识库文件的上传、切分、向量化、入库完整流程
 * 描述：
 * 1. 读取文件内容
 * 2. 使用 ParentChildChunker 切分文档为父块和子块
 * 3. 调用 Embedding API 对子块进行向量化
 * 4. 父块存储到 SQLite，子块存储到 LanceDB
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { SQLiteDatabase } from './SQLiteDatabase.js';
import { ParentChildVectorIngestion, ParentDatabase, VectorIngestionOptions, VectorIngestionResult } from '@note-studio/global-rag';
import { FileParser } from '@note-studio/global-rag';

/**
 * Embedding API 接口实现
 * 用于调用实际的 Embedding 服务
 */
interface EmbeddingAPIImpl {
  embedText(text: string, modelName?: string): Promise<number[]>;
  embedTexts(texts: string[], modelName?: string): Promise<number[][]>;
}

/**
 * 知识库向量入库服务
 */
export class KnowledgeBaseVectorIngestionService {
  private static instance: KnowledgeBaseVectorIngestionService;
  private ingestionServices: Map<string, ParentChildVectorIngestion> = new Map();
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): KnowledgeBaseVectorIngestionService {
    if (!KnowledgeBaseVectorIngestionService.instance) {
      KnowledgeBaseVectorIngestionService.instance = new KnowledgeBaseVectorIngestionService();
    }
    return KnowledgeBaseVectorIngestionService.instance;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    console.log('[KnowledgeBaseVectorIngestionService] 服务已初始化');
  }

  /**
   * 获取或创建知识库的入库服务实例
   * @param knowledgeBaseId 知识库ID
   * @param embeddingAPI Embedding API 实现
   * @returns 入库服务实例
   */
  private async getIngestionService(
    knowledgeBaseId: string,
    embeddingAPI: EmbeddingAPIImpl
  ): Promise<ParentChildVectorIngestion> {
    // 检查是否已存在该知识库的服务实例
    if (this.ingestionServices.has(knowledgeBaseId)) {
      return this.ingestionServices.get(knowledgeBaseId)!;
    }

    // 创建 SQLite 数据库实例（每个知识库使用独立的数据库）
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'knowledge-bases', knowledgeBaseId);
    
    // 确保目录存在
    await fs.mkdir(dbPath, { recursive: true });

    const parentDb = new SQLiteDatabase('parents.db', dbPath);

    // 创建 LanceDB 路径
    const lancedbPath = path.join(dbPath, 'lancedb');

    // 创建入库服务实例
    const ingestionService = new ParentChildVectorIngestion(
      embeddingAPI as unknown as ParentChildVectorIngestion['embeddingAPI'],
      parentDb as unknown as ParentDatabase,
      undefined,
      lancedbPath
    );

    // 初始化服务
    await ingestionService.initialize();

    // 缓存服务实例
    this.ingestionServices.set(knowledgeBaseId, ingestionService);

    return ingestionService;
  }

  /**
   * 处理单个文件：读取 -> 解析 -> 切分 -> 入库
   * @param filePath 文件路径
   * @param knowledgeBaseId 知识库ID
   * @param embeddingAPI Embedding API 实现
   * @param options 入库选项
   * @returns 入库结果
   */
  async processFile(
    filePath: string,
    knowledgeBaseId: string,
    embeddingAPI: EmbeddingAPIImpl,
    options?: VectorIngestionOptions
  ): Promise<VectorIngestionResult> {
    try {
      console.log('[KnowledgeBaseVectorIngestionService] 开始处理文件:', filePath);

      // 步骤1：读取文件内容
      const rawContent = await fs.readFile(filePath, 'utf-8');
      console.log('[KnowledgeBaseVectorIngestionService] 文件读取完成，内容长度:', rawContent.length);

      // 步骤2：解析文件内容
      const fileName = path.basename(filePath);
      const parseResult = FileParser.parseFile(rawContent, fileName, filePath);
      console.log('[KnowledgeBaseVectorIngestionService] 文件解析完成，类型:', parseResult.metadata.fileType);

      // 步骤3：获取入库服务实例
      const ingestionService = await this.getIngestionService(knowledgeBaseId, embeddingAPI);

      // 步骤4：入库（切分 + 向量化 + 存储）
      // 默认启用 CPU 控制选项，降低索引时的 CPU 占用
      const ingestionOptions: VectorIngestionOptions = {
        // CPU 控制默认配置
        batchSize: 30,           // 每批 30 个子块
        batchDelayMs: 50,        // 批次间延迟 50ms
        documentDelayMs: 100,    // 文档间延迟 100ms
        lowPriorityMode: true,   // 启用低优先级模式
        // 用户传入的选项（可覆盖默认值）
        ...options,
        sourceFile: filePath,
        extraMetadata: {
          ...options?.extraMetadata,
          knowledgeBaseId,
          fileName: parseResult.metadata.fileName,
          fileType: parseResult.metadata.fileType,
        },
      };

      const result = await ingestionService.ingest(parseResult.content, ingestionOptions);

      console.log('[KnowledgeBaseVectorIngestionService] 文件处理完成:', {
        filePath,
        parentCount: result.parentCount,
        childCount: result.childCount,
        errors: result.errors?.length || 0,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[KnowledgeBaseVectorIngestionService] 处理文件失败:', {
        filePath,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * 批量处理多个文件
   * @param filePaths 文件路径列表
   * @param knowledgeBaseId 知识库ID
   * @param embeddingAPI Embedding API 实现
   * @param options 入库选项
   * @param onProgress 进度回调函数
   * @returns 处理结果
   */
  async processFiles(
    filePaths: string[],
    knowledgeBaseId: string,
    embeddingAPI: EmbeddingAPIImpl,
    options?: VectorIngestionOptions,
    onProgress?: (filePath: string, progress: number) => void
  ): Promise<{
    success: boolean;
    processedCount: number;
    totalCount: number;
    results: Array<{ filePath: string; result: VectorIngestionResult }>;
    errors: string[];
  }> {
    const results: Array<{ filePath: string; result: VectorIngestionResult }> = [];
    const errors: string[] = [];

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      
      try {
        // 更新进度
        if (onProgress) {
          const progress = Math.floor((i / filePaths.length) * 90); // 0-90%
          onProgress(filePath, progress);
        }

        // 处理文件（默认 CPU 控制选项已在 processFile 中设置）
        const result = await this.processFile(filePath, knowledgeBaseId, embeddingAPI, options);
        results.push({ filePath, result });

        // 更新进度
        if (onProgress) {
          const progress = Math.floor(((i + 1) / filePaths.length) * 90); // 0-90%
          onProgress(filePath, progress);
        }

        // 文件间延迟，降低 CPU 占用（默认 200ms）
        const fileDelayMs = options?.documentDelayMs ?? 200;
        if (fileDelayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, fileDelayMs));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`${filePath}: ${errorMessage}`);
        console.error('[KnowledgeBaseVectorIngestionService] 处理文件失败:', {
          filePath,
          error: errorMessage,
        });
      }
    }

    // 所有文件处理完成，更新进度为100%
    if (onProgress) {
      filePaths.forEach(filePath => {
        onProgress(filePath, 100);
      });
    }

    return {
      success: errors.length === 0,
      processedCount: results.length,
      totalCount: filePaths.length,
      results,
      errors,
    };
  }

  /**
   * 关闭知识库的入库服务
   * @param knowledgeBaseId 知识库ID
   */
  async closeKnowledgeBase(knowledgeBaseId: string): Promise<void> {
    const service = this.ingestionServices.get(knowledgeBaseId);
    if (service) {
      await service.close();
      this.ingestionServices.delete(knowledgeBaseId);
      console.log('[KnowledgeBaseVectorIngestionService] 已关闭知识库服务:', knowledgeBaseId);
    }
  }

  /**
   * 关闭所有服务
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.ingestionServices.keys()).map(kbId =>
      this.closeKnowledgeBase(kbId)
    );
    await Promise.all(closePromises);
    this.ingestionServices.clear();
    this.initialized = false;
  }
}


