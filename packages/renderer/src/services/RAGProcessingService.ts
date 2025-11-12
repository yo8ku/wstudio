/**
 * RAG 处理服务
 * 对文件工具栏的所有文件进行 RAG 处理（文件监听、读取、分块、向量化）
 */

import { VectorChunker, VectorEmbedder } from '@note-studio/knowledge-base';

export interface FileInfo {
  path: string;
  name: string;
}

export interface ProcessedChunk {
  text: string;
  embedding: number[];
  metadata: {
    filePath: string;
    fileName: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface RAGProcessingResult {
  success: boolean;
  chunks: ProcessedChunk[];
  totalFiles: number;
  totalChunks: number;
  error?: string;
}

class RAGProcessingService {
  private static instance: RAGProcessingService;
  private chunker: VectorChunker | null = null;
  private embedder: VectorEmbedder | null = null;
  private isInitialized: boolean = false;

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
      // 初始化分块器和嵌入器
      this.chunker = new VectorChunker({
        chunkSize: 1000,
        chunkOverlap: 200,
        strategy: 'recursive'
      });

      this.embedder = new VectorEmbedder('BAAI/bge-large-zh-v1.5');

      // 初始化 Python 服务
      await this.chunker.initialize();
      await this.embedder.initialize();

      this.isInitialized = true;
      console.log('[RAGProcessingService] 初始化成功');
    } catch (error) {
      console.error('[RAGProcessingService] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 读取文件内容
   */
  private async readFile(filePath: string): Promise<string> {
    try {
      // 使用 Electron API 读取文件
      const result = await window.electron?.file?.read(filePath);
      if (result?.success && result.data?.content) {
        return result.data.content;
      }
      throw new Error(`读取文件失败: ${filePath}`);
    } catch (error) {
      console.error(`[RAGProcessingService] 读取文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 处理单个文件
   */
  private async processFile(file: FileInfo): Promise<ProcessedChunk[]> {
    try {
      // 1. 读取文件内容
      console.log(`[RAGProcessingService] 读取文件: ${file.path}`);
      const fileContent = await this.readFile(file.path);

      if (!fileContent || fileContent.trim().length === 0) {
        console.warn(`[RAGProcessingService] 文件内容为空: ${file.path}`);
        return [];
      }

      // 2. 文本分块
      console.log(`[RAGProcessingService] 对文件进行分块: ${file.path}`);
      if (!this.chunker) {
        throw new Error('分块器未初始化');
      }

      const chunkResult = await this.chunker.chunkText(fileContent);
      const chunks = chunkResult.chunks;

      if (chunks.length === 0) {
        console.warn(`[RAGProcessingService] 文件分块结果为空: ${file.path}`);
        return [];
      }

      console.log(`[RAGProcessingService] 文件分块完成: ${file.path}, 共 ${chunks.length} 个块`);

      // 3. 文本向量化
      console.log(`[RAGProcessingService] 对文件块进行向量化: ${file.path}`);
      if (!this.embedder) {
        throw new Error('嵌入器未初始化');
      }

      const texts = chunks.map(chunk => chunk.content);
      const embeddings = await this.embedder.embedTexts(texts);

      if (embeddings.length !== chunks.length) {
        throw new Error(`向量化结果数量不匹配: 期望 ${chunks.length}, 实际 ${embeddings.length}`);
      }

      // 4. 组合结果
      const processedChunks: ProcessedChunk[] = chunks.map((chunk, index) => ({
        text: chunk.content,
        embedding: embeddings[index],
        metadata: {
          filePath: file.path,
          fileName: file.name,
          chunkIndex: index,
          totalChunks: chunks.length
        }
      }));

      console.log(`[RAGProcessingService] 文件处理完成: ${file.path}, 共 ${processedChunks.length} 个处理后的块`);
      return processedChunks;
    } catch (error) {
      console.error(`[RAGProcessingService] 处理文件失败: ${file.path}`, error);
      throw error;
    }
  }

  /**
   * 处理文件工具栏的所有文件
   */
  async processFiles(files: FileInfo[]): Promise<RAGProcessingResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (files.length === 0) {
      return {
        success: true,
        chunks: [],
        totalFiles: 0,
        totalChunks: 0
      };
    }

    console.log(`[RAGProcessingService] 开始处理 ${files.length} 个文件`);

    const allChunks: ProcessedChunk[] = [];
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // 依次处理每个文件
    for (const file of files) {
      try {
        const chunks = await this.processFile(file);
        allChunks.push(...chunks);
        successCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`${file.name}: ${errorMessage}`);
        console.error(`[RAGProcessingService] 处理文件失败: ${file.path}`, error);
      }
    }

    const result: RAGProcessingResult = {
      success: errorCount === 0,
      chunks: allChunks,
      totalFiles: files.length,
      totalChunks: allChunks.length
    };

    if (errors.length > 0) {
      result.error = `处理了 ${successCount} 个文件，失败 ${errorCount} 个文件。错误: ${errors.join('; ')}`;
    }

    console.log(`[RAGProcessingService] 处理完成: 成功 ${successCount} 个文件，失败 ${errorCount} 个文件，共 ${allChunks.length} 个块`);
    return result;
  }

  /**
   * 关闭服务
   */
  async close(): Promise<void> {
    try {
      if (this.chunker) {
        await this.chunker.close();
        this.chunker = null;
      }
      if (this.embedder) {
        await this.embedder.close();
        this.embedder = null;
      }
      this.isInitialized = false;
      console.log('[RAGProcessingService] 服务已关闭');
    } catch (error) {
      console.error('[RAGProcessingService] 关闭服务失败:', error);
    }
  }
}

export const ragProcessingService = RAGProcessingService.getInstance();

