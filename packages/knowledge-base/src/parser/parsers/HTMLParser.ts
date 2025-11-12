/**
 * HTML 解析器
 * 支持浏览器和 Node.js 环境
 */

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

// 定义 jsdom 模块的类型接口（避免在编译时引用模块）
interface JSDOMModule {
  JSDOM: new (html: string) => { window: { document: Document } };
}

// 缓存动态导入的模块
let jsdomModule: JSDOMModule | null = null;
let fsModule: FSPromisesModule | null = null;

export class HTMLParser extends BaseParser {
  constructor() {
    super({
      name: 'html',
      fileTypes: ['.html', '.htm'],
      mimeTypes: ['text/html'],
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
    
    const content = await fsModule.readFile(filePath, 'utf-8');
    return this.parseText(content, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const html = typeof content === 'string' ? content : content.toString('utf-8');
    
    let document: Document;

    if (isBrowser) {
      // 浏览器环境：使用 DOMParser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      document = doc;
    } else {
      // Node.js 环境：使用 jsdom
      if (!jsdomModule) {
        try {
          jsdomModule = await import('jsdom');
        } catch (error) {
          throw new Error('jsdom is not available. Please install jsdom for Node.js environment.');
        }
      }
      const dom = new jsdomModule.JSDOM(html);
      document = dom.window.document;
    }

    // 移除 script 和 style 标签
    document.querySelectorAll('script, style').forEach((el) => el.remove());

    // 提取文本内容
    const text = document.body?.textContent || '';
    const cleanedText = text.replace(/\s+/g, ' ').trim();

    // 提取元数据
    const metadata: ParseResult['metadata'] = {
      title: document.querySelector('title')?.textContent || undefined,
      ...this.extractMetaTags(document),
      ...this.extractBasicMetadata(cleanedText),
    };

    return {
      content: cleanedText,
      metadata,
    };
  }

  /**
   * 提取 meta 标签信息
   */
  private extractMetaTags(document: Document): Record<string, string> {
    const meta: Record<string, string> = {};

    // 提取标准 meta 标签
    const metaTags = document.querySelectorAll('meta[name]');
    Array.from(metaTags).forEach((el) => {
      const name = el.getAttribute('name');
      const content = el.getAttribute('content');
      if (name && content) {
        meta[name] = content;
      }
    });

    // 提取 Open Graph 标签
    const ogTags = document.querySelectorAll('meta[property^="og:"]');
    Array.from(ogTags).forEach((el) => {
      const property = el.getAttribute('property');
      const content = el.getAttribute('content');
      if (property && content) {
        meta[property] = content;
      }
    });

    return meta;
  }
}




















