/**
 * PDF 解析器
 */

import { readFile } from 'fs/promises';
import pdf from 'pdf-parse';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

export class PDFParser extends BaseParser {
  constructor() {
    super({
      name: 'pdf',
      fileTypes: ['.pdf'],
      mimeTypes: ['application/pdf'],
      priority: 10,
    });
  }

  async parse(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    const dataBuffer = await readFile(filePath);
    return this.parseText(dataBuffer, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    
    const data = await pdf(buffer);

    const metadata: ParseResult['metadata'] = {
      title: data.info?.Title,
      author: data.info?.Author,
      createdAt: data.info?.CreationDate ? new Date(data.info.CreationDate) : undefined,
      modifiedAt: data.info?.ModDate ? new Date(data.info.ModDate) : undefined,
      pageCount: data.numpages,
      ...this.extractBasicMetadata(data.text),
    };

    return {
      content: data.text,
      metadata,
    };
  }
}




















