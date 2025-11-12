/**
 * Word 文档解析器
 * 支持浏览器和 Node.js 环境
 */

import mammoth from 'mammoth';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

// 检测运行环境
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// 定义 fs/promises 模块的类型接口（避免在编译时引用模块）
interface FSPromisesModule {
  readFile: {
    (path: string, encoding: BufferEncoding): Promise<string>;
    (path: string): Promise<Buffer>;
  };
}

// 缓存动态导入的模块
let fsModule: FSPromisesModule | null = null;

export class DocxParser extends BaseParser {
  constructor() {
    super({
      name: 'docx',
      fileTypes: ['.docx'],
      mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      priority: 10,
    });
  }

  async parse(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    if (isBrowser) {
      throw new Error('parse(filePath) is not supported in browser environment. Use parseText() instead.');
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
    
    const buffer = await fsModule.readFile(filePath);
    return this.parseText(buffer, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    const metadata: ParseResult['metadata'] = {
      ...this.extractBasicMetadata(text),
    };

    // 如果需要保留格式，使用 HTML 转换
    if (options?.preserveFormatting) {
      const htmlResult = await mammoth.convertToHtml({ buffer });
      metadata.htmlContent = htmlResult.value;
    }

    return {
      content: text,
      metadata,
    };
  }
}




















