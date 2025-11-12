/**
 * 文件扫描器
 * 支持浏览器和 Node.js 环境
 */

// 检测运行环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// 定义 fs/promises 模块的类型接口（避免在编译时引用模块）
interface FSPromisesModule {
  readFile: {
    (path: string, encoding: BufferEncoding): Promise<string>;
    (path: string): Promise<Buffer>;
  };
  stat: (path: string) => Promise<{
    size: number;
    mtime: Date;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>;
  readdir: (path: string) => Promise<string[]>;
}

// 定义 path 模块的类型接口
interface PathModule {
  join: (...paths: string[]) => string;
}

// 缓存动态导入的模块
let fsModule: FSPromisesModule | null = null;
let pathModule: PathModule | null = null;

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
    if (isBrowser) {
      throw new Error('scan() is not supported in browser environment.');
    }
    
    // 动态导入 fs/promises（仅在 Node.js 环境）
    // 使用 Function 构造函数避免 Vite 静态分析
    if (!fsModule) {
      try {
        // 使用 Function 构造函数创建完全动态的导入，避免 Vite 静态分析
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        const fsPath = 'fs' + '/' + 'promises';
        fsModule = await dynamicImport(fsPath);
      } catch (error) {
        throw new Error('fs/promises is not available. Please ensure you are running in Node.js environment.');
      }
    }

    // 动态导入 path 模块（仅在 Node.js 环境）
    if (!pathModule) {
      try {
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        pathModule = await dynamicImport('path');
      } catch (error) {
        throw new Error('path module is not available. Please ensure you are running in Node.js environment.');
      }
    }
    
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
    if (isBrowser || !fsModule) {
      throw new Error('scanRecursive() is not supported in browser environment.');
    }
    
    if (options?.maxDepth !== undefined && depth > options.maxDepth) {
      return;
    }

    const entries = await fsModule.readdir(dirPath);

    if (!pathModule) {
      throw new Error('path module is not available.');
    }

    for (const entry of entries) {
      const fullPath = pathModule.join(dirPath, entry);
      
      // 检查排除模式
      if (this.shouldExclude(fullPath, options?.excludePatterns)) {
        continue;
      }

      const stats = await fsModule.stat(fullPath);

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




































































