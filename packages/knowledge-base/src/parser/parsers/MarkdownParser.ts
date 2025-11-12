/**
 * Markdown 解析器
 * 支持浏览器和 Node.js 环境
 */

import { marked } from 'marked';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions, ParsedSection } from '../types';

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

export class MarkdownParser extends BaseParser {
  constructor() {
    super({
      name: 'markdown',
      fileTypes: ['.md', '.markdown', '.mdown', '.mkd'],
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
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    
    const sections = this.extractSections(text);
    const plainText = this.convertToPlainText(text);
    const metadata = this.extractMarkdownMetadata(text);

    return {
      content: plainText,
      metadata: {
        ...metadata,
        ...this.extractBasicMetadata(plainText),
      },
      sections,
    };
  }

  /**
   * 提取 Markdown 章节
   */
  private extractSections(content: string): ParsedSection[] {
    const sections: ParsedSection[] = [];
    const lines = content.split('\n');
    let currentSection: ParsedSection | null = null;
    let currentContent: string[] = [];
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headingMatch) {
        // 保存上一个章节
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          currentSection.endIndex = currentIndex;
          sections.push(currentSection);
        }

        // 创建新章节
        const level = headingMatch[1].length;
        const heading = headingMatch[2].trim();
        
        currentSection = {
          heading,
          level,
          content: '',
          startIndex: currentIndex,
          endIndex: currentIndex,
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }

      currentIndex += line.length + 1; // +1 for newline
    }

    // 保存最后一个章节
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      currentSection.endIndex = currentIndex;
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * 转换为纯文本
   */
  private convertToPlainText(markdown: string): string {
    // 移除代码块
    let text = markdown.replace(/```[\s\S]*?```/g, '');
    
    // 移除行内代码
    text = text.replace(/`[^`]+`/g, '');
    
    // 移除图片
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
    
    // 移除链接，保留文本
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    // 移除 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    
    // 移除标题标记
    text = text.replace(/^#{1,6}\s+/gm, '');
    
    // 移除列表标记
    text = text.replace(/^[\*\-\+]\s+/gm, '');
    text = text.replace(/^\d+\.\s+/gm, '');
    
    // 移除引用标记
    text = text.replace(/^>\s+/gm, '');
    
    // 移除水平线
    text = text.replace(/^[\*\-_]{3,}$/gm, '');
    
    // 移除粗体和斜体标记
    text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
    text = text.replace(/(\*|_)(.*?)\1/g, '$2');
    
    return text.trim();
  }

  /**
   * 提取 Markdown 元数据（YAML Front Matter）
   */
  private extractMarkdownMetadata(content: string): Partial<ParseResult['metadata']> {
    const metadata: Record<string, string> = {};
    
    // 提取 YAML Front Matter
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1];
      const lines = frontMatter.split('\n');
      
      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        if (key && valueParts.length > 0) {
          const value = valueParts.join(':').trim();
          metadata[key.trim()] = value.replace(/^["']|["']$/g, '');
        }
      }
    }

    // 尝试提取第一个标题作为 title
    if (!metadata.title) {
      const titleMatch = content.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        metadata.title = titleMatch[1].trim();
      }
    }

    return metadata;
  }
}




















