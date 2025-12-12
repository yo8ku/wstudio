/**
 * RAG 处理服务
 * 负责完整的文件处理流程：
 * 1. 文件读取
 * 2. 文本切分（使用 Chunker）
 * 3. 向量生成（使用内置 EmbeddingService）
 * 4. 向量存储
 */

import { VectorStore, Chunker, FileParser, ParentChildChunker, ParentChildVectorStore } from '@note-studio/global-rag';
import { EmbeddingService } from '@note-studio/shared';
import { knowledgeBaseService } from '../components/Layout/Sidebar/KnowledgeBase/knowledgeBaseService';

/**
 * 浏览器兼容的 path.basename 实现
 */
function getBasename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

interface UploadOptions {
  strategy?: 'recursive' | 'token' | 'markdown' | 'parent-child';
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  parentChunkSize?: number;
  childChunkSize?: number;
  childChunkOverlap?: number;
  onProgress?: (filePath: string, progress: number) => void;
}

interface ProcessFileOptions {
  strategy: 'recursive' | 'token' | 'markdown' | 'parent-child';
  chunkSize: number;
  chunkOverlap: number;
  separators: string[];
  parentChunkSize?: number;
  childChunkSize?: number;
  childChunkOverlap?: number;
  onProgress?: (filePath: string, progress: number) => void;
}

class RAGProcessingService {
  private static instance: RAGProcessingService;
  private vectorStore: VectorStore | null = null;
  private parentChildVectorStore: ParentChildVectorStore | null = null;
  private chunker: Chunker | null = null;
  private parentChildChunker: ParentChildChunker | null = null;
  private embeddingService: EmbeddingService | null = null;
  private isInitialized: boolean = false;

  // 最小文档长度限制（字符数）
  private static readonly MIN_DOCUMENT_LENGTH = 300;

  private constructor() {}

  public static getInstance(): RAGProcessingService {
    if (!RAGProcessingService.instance) {
      RAGProcessingService.instance = new RAGProcessingService();
    }
    return RAGProcessingService.instance;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log('[RAGProcessingService] 开始初始化服务...');

      // 初始化向量存储（普通模式）
      this.vectorStore = new VectorStore();
      await this.vectorStore.initialize();
      console.log('[RAGProcessingService] 向量存储初始化完成');

      // 初始化父子索引向量存储
      this.parentChildVectorStore = new ParentChildVectorStore();
      await this.parentChildVectorStore.initialize();
      console.log('[RAGProcessingService] 父子索引向量存储初始化完成');

      // 初始化分块器
      this.chunker = new Chunker();
      await this.chunker.initialize();
      console.log('[RAGProcessingService] 分块器初始化完成');

      // 初始化父子分块器
      this.parentChildChunker = new ParentChildChunker();
      await this.parentChildChunker.initialize();
      console.log('[RAGProcessingService] 父子分块器初始化完成');

      // 初始化嵌入服务（使用内置模型）
      this.embeddingService = new EmbeddingService();
      console.log('[RAGProcessingService] 嵌入服务初始化完成');

      this.isInitialized = true;
      console.log('[RAGProcessingService] 所有服务初始化完成');
    } catch (error) {
      console.error('[RAGProcessingService] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 上传文件列表到知识库
   * 完整流程：文件读取 > 切分 > 向量生成 > 存储
   * @param filePaths 文件路径列表
   * @param knowledgeBaseId 知识库ID
   * @param options 处理选项
   */
  async uploadFilesToKnowledgeBase(
    filePaths: string[],
    knowledgeBaseId: string,
    options?: UploadOptions
  ): Promise<{ success: boolean; filePaths: string[] }> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.vectorStore || !this.chunker || !this.embeddingService) {
        throw new Error('服务未完全初始化');
      }

      if (filePaths.length === 0) {
        return {
          success: true,
          filePaths: [],
        };
      }

      // 获取知识库配置
      const knowledgeBase = await knowledgeBaseService.findItem(knowledgeBaseId);
      const chunkSettings = knowledgeBase?.metadata?.chunkSettings;

      // 合并配置（优先使用传入的 options）
      const strategy = options?.strategy ?? chunkSettings?.strategy ?? 'parent-child';
      const chunkSize = options?.chunkSize ?? chunkSettings?.chunkSize ?? 1000;
      const chunkOverlap = options?.chunkOverlap ?? chunkSettings?.chunkOverlap ?? 200;
      const separators = options?.separators ?? chunkSettings?.separators ?? ['\n\n', '\n', '。', '！', '？', '.', '!', '?'];
      const parentChunkSize = options?.parentChunkSize ?? chunkSettings?.parentChunkSize ?? 300;
      const childChunkSize = options?.childChunkSize ?? chunkSettings?.childChunkSize ?? 100;
      const childChunkOverlap = options?.childChunkOverlap ?? chunkSettings?.childChunkOverlap ?? 20;

      console.log('[RAGProcessingService] 开始处理文件:', {
        fileCount: filePaths.length,
        knowledgeBaseId,
        strategy,
        chunkSize,
        chunkOverlap,
      });

      // 处理每个文件
      for (const filePath of filePaths) {
        await this.processFile(filePath, knowledgeBaseId, {
          strategy,
          chunkSize,
          chunkOverlap,
          separators,
          parentChunkSize,
          childChunkSize,
          childChunkOverlap,
          onProgress: options?.onProgress,
        });
      }

      console.log('[RAGProcessingService] 所有文件处理完成');

      return {
        success: true,
        filePaths,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[RAGProcessingService] uploadFilesToKnowledgeBase 失败:', errorMessage);
      throw error;
    }
  }

  /**
   * 处理单个文件
   * 流程：读取 > 解析 > 切分 > 向量化 > 存储
   */
  private async processFile(
    filePath: string,
    knowledgeBaseId: string,
    options: ProcessFileOptions
  ): Promise<void> {
    const { strategy, chunkSize, chunkOverlap, separators, parentChunkSize, childChunkSize, childChunkOverlap, onProgress } = options;

    try {
      console.log(`[RAGProcessingService] 开始处理文件: ${filePath}`);

      // 步骤 1: 文件读取和解析 (10%)
      if (onProgress) onProgress(filePath, 10);
      
      // 读取文件内容（使用 Electron IPC）
      let rawContent: string;
      try {
        // 使用 window.electron.file.read API
        if (window.electron?.file?.read) {
          const result = await window.electron.file.read(filePath);
          if (result.success && result.data?.content) {
            rawContent = result.data.content;
          } else {
            throw new Error(result.error || '文件读取失败');
          }
        } else {
          throw new Error('Electron file API 不可用');
        }
      } catch (error) {
        console.error('[RAGProcessingService] 文件读取失败:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`无法读取文件 ${getBasename(filePath)}: ${errorMessage}`);
      }
      
      // 解析文件
      const fileName = getBasename(filePath);
      const parseResult = FileParser.parseFile(rawContent, fileName, filePath);
      console.log(`[RAGProcessingService] 文件解析完成: ${filePath}, 内容长度: ${parseResult.content.length}`);

      // 检查文档长度（最小 300 字符）
      // 去除空白字符（但保留换行符），防止恶意上传空内容
      const contentWithoutSpaces = parseResult.content.replace(/[^\S\n]/g, '');
      const contentLength = contentWithoutSpaces.length;
      if (contentLength < RAGProcessingService.MIN_DOCUMENT_LENGTH) {
        throw new Error(
          `文档过短（${contentLength} 字符），最少需要 ${RAGProcessingService.MIN_DOCUMENT_LENGTH} 字符。请添加更多内容后再上传。`
        );
      }

      // 步骤 2: 文本切分 (20-40%)
      if (onProgress) onProgress(filePath, 20);
      
      let chunks: Array<{ content: string; metadata: Record<string, unknown> }> = [];

      if (strategy === 'parent-child') {
        // 使用父子索引模式
        await this.processFileWithParentChild(
          filePath,
          knowledgeBaseId,
          parseResult.content,
          parseResult.metadata,
          onProgress
        );
        return; // 父子索引使用独立的处理流程
      } else {
        // 使用普通分块器
        if (!this.chunker) {
          throw new Error('分块器未初始化');
        }

        const result = await this.chunker.chunkText(parseResult.content, {
          chunkSize,
          chunkOverlap,
          separators,
          strategy: strategy as any,
        });
        chunks = result.chunks.map((chunk: { content: string; metadata: Record<string, unknown> }) => ({
          content: chunk.content,
          metadata: chunk.metadata,
        }));
        console.log(`[RAGProcessingService] 文本切分完成: ${filePath}, 策略: ${strategy}, 块数: ${result.totalChunks}`);
      }

      if (onProgress) onProgress(filePath, 40);

      // 步骤 3: 向量生成和存储 (40-100%)
      if (!this.embeddingService || !this.vectorStore) {
        throw new Error('嵌入服务或向量存储未初始化');
      }

      const texts: string[] = [];
      const embeddings: number[][] = [];
      const metadatas: Array<Record<string, any>> = [];

      try {
        // 逐个生成向量（提供更细粒度的进度反馈）
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          
          try {
            // 生成向量
            const embeddingResult = await this.embeddingService.generateEmbedding(chunk.content);
            
            texts.push(chunk.content);
            embeddings.push(embeddingResult.vectors);
            metadatas.push({
              ...chunk.metadata,
              filePath,
              fileName: getBasename(filePath),
              fileType: parseResult.metadata.fileType,
              chunkIndex: i,
              totalChunks: chunks.length,
              knowledgeBaseId,
            });

            // 更新进度 (40% -> 90%)
            const progress = 40 + Math.floor((i / chunks.length) * 50);
            if (onProgress) onProgress(filePath, Math.min(progress, 90));
          } catch (embeddingError) {
            console.error(`[RAGProcessingService] 生成向量失败 (块 ${i}/${chunks.length}):`, embeddingError);
            // 继续处理下一个块，不中断整个流程
          }
        }

        // 如果没有成功生成任何向量，抛出错误
        if (embeddings.length === 0) {
          throw new Error('无法生成向量：本地模型加载失败。请检查模型文件是否存在。');
        }

        // 批量存储到向量数据库
        await this.vectorStore.addDocuments(texts, metadatas, embeddings);
        console.log(`[RAGProcessingService] 向量存储完成: ${filePath}, 文档数: ${texts.length}`);

        console.log(`[RAGProcessingService] 文件处理完成: ${filePath}`);

        // 完成 (100%)
        if (onProgress) onProgress(filePath, 100);
      } catch (vectorError) {
        const errorMessage = vectorError instanceof Error ? vectorError.message : String(vectorError);
        console.error(`[RAGProcessingService] 向量处理失败: ${filePath}`, errorMessage);
        throw new Error(`向量处理失败: ${errorMessage}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RAGProcessingService] 处理文件失败: ${filePath}`, errorMessage);
      
      // 错误时设置进度为 0
      if (onProgress) onProgress(filePath, 0);
      
      throw new Error(`处理文件 ${getBasename(filePath)} 失败: ${errorMessage}`);
    }
  }

  /**
   * 使用父子索引模式处理文件
   * 
   * 流程：
   * 1. 切分成父块和子块
   * 2. 只对子块生成向量
   * 3. 使用 ParentChildVectorStore 存储（父表+子表）
   */
  private async processFileWithParentChild(
    filePath: string,
    knowledgeBaseId: string,
    content: string,
    fileMetadata: Record<string, unknown>,
    onProgress?: (filePath: string, progress: number) => void
  ): Promise<void> {
    if (!this.parentChildChunker || !this.parentChildVectorStore || !this.embeddingService) {
      throw new Error('父子索引服务未初始化');
    }

    try {
      // 步骤 1: 父子切分 (20-30%)
      if (onProgress) onProgress(filePath, 20);
      
      const result = await this.parentChildChunker.chunkText(content);
      console.log(
        `[RAGProcessingService] 父子切分完成: ${filePath}, ` +
        `父块: ${result.totalParentChunks}, 子块: ${result.totalChildChunks}`
      );

      if (onProgress) onProgress(filePath, 30);

      // 步骤 2: 准备数据结构
      const parentContents: string[] = [];
      const childContents: string[][] = [];
      const childVectors: number[][][] = [];

      // 按父块组织数据
      for (const parentChunk of result.parentChunks) {
        parentContents.push(parentChunk.content);

        // 获取该父块的所有子块
        const children = result.childChunks.filter(
          (child) => child.parentId === parentChunk.id
        );

        // 子块内容
        const childContentArray: string[] = [];
        const childVectorArray: number[][] = [];

        // 步骤 3: 为每个子块生成向量 (30-90%)
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          
          // 生成向量
          const embeddingResult = await this.embeddingService.generateEmbedding(child.content);
          
          childContentArray.push(child.content);
          childVectorArray.push(embeddingResult.vectors);

          // 更新进度
          const totalChildren = result.totalChildChunks;
          const currentChild = childContents.flat().length + i + 1;
          const progress = 30 + Math.floor((currentChild / totalChildren) * 60);
          if (onProgress) onProgress(filePath, Math.min(progress, 90));
        }

        childContents.push(childContentArray);
        childVectors.push(childVectorArray);
      }

      // 步骤 4: 存储到父子索引向量存储 (90-100%)
      if (onProgress) onProgress(filePath, 90);

      await this.parentChildVectorStore.addParentChildDocuments(
        parentContents,
        childContents,
        childVectors,
        {
          filePath,
          fileName: getBasename(filePath),
          fileType: fileMetadata.fileType as string,
          knowledgeBaseId,
        }
      );

      console.log(`[RAGProcessingService] 父子索引存储完成: ${filePath}`);

      // 完成 (100%)
      if (onProgress) onProgress(filePath, 100);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[RAGProcessingService] 父子索引处理失败: ${filePath}`, errorMessage);
      throw error;
    }
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    try {
      if (this.vectorStore) {
        await this.vectorStore.close();
        this.vectorStore = null;
      }
      if (this.parentChildVectorStore) {
        await this.parentChildVectorStore.close();
        this.parentChildVectorStore = null;
      }
      if (this.chunker) {
        await this.chunker.close();
        this.chunker = null;
      }
      if (this.parentChildChunker) {
        await this.parentChildChunker.close();
        this.parentChildChunker = null;
      }
      this.embeddingService = null;
      this.isInitialized = false;
      console.log('[RAGProcessingService] 服务已关闭');
    } catch (error) {
      console.error('[RAGProcessingService] 关闭服务时出错:', error);
    }
  }
}

export const ragProcessingService = RAGProcessingService.getInstance();

