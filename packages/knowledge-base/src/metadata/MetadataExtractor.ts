/**
 * 元数据提取器
 */

import { stat } from 'fs/promises';
import { basename, extname } from 'path';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

export interface FileMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  hash: string;
  createdAt: Date;
  modifiedAt: Date;
  [key: string]: any;
}

export class MetadataExtractor {
  /**
   * 从文件路径提取元数据
   */
  async extractFromFile(filePath: string): Promise<FileMetadata> {
    const stats = await stat(filePath);
    const content = await readFile(filePath);
    const hash = this.calculateHash(content);

    return {
      fileName: basename(filePath),
      fileType: extname(filePath).slice(1),
      fileSize: stats.size,
      filePath,
      hash,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  }

  /**
   * 计算文件哈希
   */
  private calculateHash(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * 合并元数据
   */
  merge(...metadataObjects: Record<string, any>[]): Record<string, any> {
    return Object.assign({}, ...metadataObjects);
  }

  /**
   * 验证元数据
   */
  validate(metadata: Record<string, any>, requiredFields: string[]): boolean {
    return requiredFields.every((field) => field in metadata);
  }
}




























































