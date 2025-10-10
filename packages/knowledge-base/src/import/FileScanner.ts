/**
 * 文件扫描器
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';

export interface ScanOptions {
  recursive?: boolean;
  filePattern?: string;
  excludePatterns?: string[];
  maxDepth?: number;
}

export class FileScanner {
  /**
   * 扫描目录
   */
  async scan(directoryPath: string, options?: ScanOptions): Promise<string[]> {
    const files: string[] = [];
    await this.scanRecursive(directoryPath, files, options, 0);
    return files;
  }

  /**
   * 递归扫描
   */
  private async scanRecursive(
    dirPath: string,
    files: string[],
    options?: ScanOptions,
    depth = 0
  ): Promise<void> {
    if (options?.maxDepth !== undefined && depth > options.maxDepth) {
      return;
    }

    const entries = await readdir(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      
      // 检查排除模式
      if (this.shouldExclude(fullPath, options?.excludePatterns)) {
        continue;
      }

      const stats = await stat(fullPath);

      if (stats.isDirectory() && options?.recursive) {
        await this.scanRecursive(fullPath, files, options, depth + 1);
      } else if (stats.isFile()) {
        if (this.matchesPattern(fullPath, options?.filePattern)) {
          files.push(fullPath);
        }
      }
    }
  }

  /**
   * 检查文件是否匹配模式
   */
  private matchesPattern(filePath: string, pattern?: string): boolean {
    if (!pattern) return true;
    const regex = new RegExp(pattern);
    return regex.test(filePath);
  }

  /**
   * 检查是否应该排除
   */
  private shouldExclude(filePath: string, patterns?: string[]): boolean {
    if (!patterns || patterns.length === 0) return false;
    return patterns.some((pattern) => {
      const regex = new RegExp(pattern);
      return regex.test(filePath);
    });
  }
}




























































