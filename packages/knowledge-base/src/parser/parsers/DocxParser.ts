/**
 * Word 文档解析器
 */

import { readFile } from 'fs/promises';
import mammoth from 'mammoth';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

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
    const buffer = await readFile(filePath);
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




















