/**
 * 元数据提取器
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
    birthtime: Date;
    isFile: () => boolean;
    isDirectory: () => boolean;
  }>;
}

// 定义 path 模块的类型接口
interface PathModule {
  basename: (path: string, ext?: string) => string;
  extname: (path: string) => string;
}

// 定义 crypto 模块的类型接口
interface CryptoModule {
  createHash: (algorithm: string) => {
    update: (data: Buffer) => {
      digest: (encoding: 'hex') => string;
    };
  };
}

// 缓存动态导入的模块
let fsModule: FSPromisesModule | null = null;
let pathModule: PathModule | null = null;
let cryptoModule: CryptoModule | null = null;

export interface FileMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  hash: string;
  createdAt: Date;
  modifiedAt: Date;
  [key: string]: unknown;
}

export class MetadataExtractor {
  /**
   * 从文件路径提取元数据
   */
  async extractFromFile(filePath: string): Promise<FileMetadata> {
    if (isBrowser) {
      throw new Error('extractFromFile() is not supported in browser environment.');
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

    // 动态导入 crypto 模块（仅在 Node.js 环境）
    if (!cryptoModule) {
      try {
        const dynamicImport = new Function('specifier', 'return import(specifier)');
        cryptoModule = await dynamicImport('crypto');
      } catch (error) {
        throw new Error('crypto module is not available. Please ensure you are running in Node.js environment.');
      }
    }
    
    const stats = await fsModule.stat(filePath);
    const content = await fsModule.readFile(filePath);
    // readFile 返回 Buffer，确保类型正确
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const hash = this.calculateHash(buffer);

    return {
      fileName: pathModule.basename(filePath),
      fileType: pathModule.extname(filePath).slice(1),
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
    if (isBrowser) {
      throw new Error('calculateHash() is not supported in browser environment.');
    }
    
    if (!cryptoModule) {
      throw new Error('crypto module is not available. Please ensure you are running in Node.js environment.');
    }
    
    return cryptoModule.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 合并元数据
   */
  merge(...metadataObjects: Record<string, unknown>[]): Record<string, unknown> {
    return Object.assign({}, ...metadataObjects);
  }

  /**
   * 验证元数据
   */
  validate(metadata: Record<string, unknown>, requiredFields: string[]): boolean {
    return requiredFields.every((field) => field in metadata);
  }
}




































































