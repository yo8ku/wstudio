/**
 * HTML 解析器
 */

import { readFile } from 'fs/promises';
import { JSDOM } from 'jsdom';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

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
    const content = await readFile(filePath, 'utf-8');
    return this.parseText(content, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const html = typeof content === 'string' ? content : content.toString('utf-8');
    
    const dom = new JSDOM(html);
    const document = dom.window.document;

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
  private extractMetaTags(document: Document): Record<string, any> {
    const meta: Record<string, any> = {};

    // 提取标准 meta 标签
    const metaTags = document.querySelectorAll('meta[name]');
    Array.from(metaTags).forEach((el: any) => {
      const name = el.getAttribute('name');
      const content = el.getAttribute('content');
      if (name && content) {
        meta[name] = content;
      }
    });

    // 提取 Open Graph 标签
    const ogTags = document.querySelectorAll('meta[property^="og:"]');
    Array.from(ogTags).forEach((el: any) => {
      const property = el.getAttribute('property');
      const content = el.getAttribute('content');
      if (property && content) {
        meta[property] = content;
      }
    });

    return meta;
  }
}




















