/**
 * 导入服务
 */

import { EventEmitter } from '@note-studio/core';
import { FileScanner } from './FileScanner';
import { BatchImporter } from './BatchImporter';
import { ImportQueue } from './ImportQueue';
import { ParserRegistry } from '../parser/ParserRegistry';
import { ChunkerRegistry } from '../chunker/ChunkerRegistry';

export interface ImportOptions {
  parseStrategy?: string;
  chunkStrategy?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  extractMetadata?: boolean;
  skipDuplicates?: boolean;
  batchSize?: number;
}

export interface ImportProgress {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  currentFile?: string;
}

export class ImportService extends EventEmitter {
  private parserRegistry: ParserRegistry;
  private chunkerRegistry: ChunkerRegistry;
  private queue: ImportQueue;

  constructor(
    parserRegistry: ParserRegistry,
    chunkerRegistry: ChunkerRegistry
  ) {
    super();
    this.parserRegistry = parserRegistry;
    this.chunkerRegistry = chunkerRegistry;
    this.queue = new ImportQueue();
  }

  /**
   * 导入单个文件
   */
  async importFile(filePath: string, options?: ImportOptions): Promise<void> {
    try {
      // 解析文件
      const parseResult = await this.parserRegistry.parseFile(filePath, {
        extractMetadata: options?.extractMetadata ?? true,
      });

      // 分块
      const chunkerName = options?.chunkStrategy;
      const chunkResult = await this.chunkerRegistry.chunk(
        parseResult.content,
        chunkerName,
        {
          chunkSize: options?.chunkSize,
          chunkOverlap: options?.chunkOverlap,
        }
      );

      // 分块结果
      const chunks = chunkResult.chunks;

      this.emit('file-imported', { filePath, chunks: chunks.length });
    } catch (error) {
      this.emit('import-error', { filePath, error });
      throw error;
    }
  }

  /**
   * 批量导入文件
   */
  async importFiles(
    filePaths: string[],
    options?: ImportOptions
  ): Promise<ImportProgress> {
    const progress: ImportProgress = {
      total: filePaths.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
    };

    const batchSize = options?.batchSize || 10;

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (filePath) => {
          progress.currentFile = filePath;
          this.emit('progress', progress);

          try {
            await this.importFile(filePath, options);
            progress.succeeded++;
          } catch (error) {
            progress.failed++;
          } finally {
            progress.processed++;
          }
        })
      );
    }

    this.emit('import-complete', progress);
    return progress;
  }

  /**
   * 导入目录
   */
  async importDirectory(
    directoryPath: string,
    options?: ImportOptions & { recursive?: boolean; filePattern?: string }
  ): Promise<ImportProgress> {
    const scanner = new FileScanner();
    const files = await scanner.scan(directoryPath, {
      recursive: options?.recursive ?? true,
      filePattern: options?.filePattern,
    });

    return this.importFiles(files, options);
  }
}




































































