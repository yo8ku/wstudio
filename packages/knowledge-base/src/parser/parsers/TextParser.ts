/**
 * 文本文件解析器
 */

import { readFile } from 'fs/promises';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

export class TextParser extends BaseParser {
  constructor() {
    super({
      name: 'text',
      fileTypes: ['.txt', '.log', '.csv', '.json', '.xml', '.yaml', '.yml'],
      priority: 1, // 低优先级，作为后备解析器
    });
  }

  async parse(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    const content = await readFile(filePath, 'utf-8');
    return this.parseText(content, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    
    const metadata = this.extractBasicMetadata(text);

    return {
      content: text,
      metadata,
    };
  }
}




















