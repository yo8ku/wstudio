/**
 * PDF 解析器
 * 使用 pdfjs-dist 进行浏览器兼容的 PDF 解析
 */

import * as pdfjsLib from 'pdfjs-dist';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

// 设置 worker 路径（浏览器环境）
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

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
    // 在浏览器环境中，filePath 可能是 URL 或文件路径
    // 在 Node.js 环境中，需要读取文件
    let data: Uint8Array;
    
    if (typeof window !== 'undefined') {
      // 浏览器环境：使用 fetch 获取文件内容
      try {
        const response = await fetch(filePath);
        const arrayBuffer = await response.arrayBuffer();
        data = new Uint8Array(arrayBuffer);
      } catch (error) {
        throw new Error(`Failed to fetch PDF file: ${error}`);
      }
    } else {
      // Node.js 环境
      // 使用 Function 构造函数避免 Vite 静态分析
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const fsPath = 'fs' + '/' + 'promises';
      const { readFile } = await dynamicImport(fsPath);
      const buffer = await readFile(filePath);
      data = new Uint8Array(buffer);
    }
    
    // 直接使用 parseText 的内部逻辑，但需要转换为 Buffer 或 base64
    // 为了兼容类型，将 Uint8Array 转换为 Buffer（在 Node.js 中）或 base64 字符串（在浏览器中）
    if (typeof window !== 'undefined') {
      // 浏览器环境：转换为 base64 字符串（使用更高效的方法）
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binaryString);
      return this.parseText(base64, options);
    } else {
      // Node.js 环境：转换为 Buffer
      const buffer = Buffer.from(data);
      return this.parseText(buffer, options);
    }
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    // 转换为 Uint8Array
    let data: Uint8Array;
    if (Buffer.isBuffer(content)) {
      data = new Uint8Array(content);
    } else if (typeof content === 'string') {
      // 如果是 base64 字符串，先解码
      try {
        const binaryString = atob(content);
        data = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          data[i] = binaryString.charCodeAt(i);
        }
      } catch (error) {
        // 如果不是 base64，尝试作为普通字符串处理
        // 但 PDF 内容应该是二进制数据，这里应该抛出错误
        throw new Error('PDF content must be Buffer or base64 string');
      }
    } else {
      throw new Error('Unsupported content type for PDF parsing');
    }

    // 使用 pdfjs-dist 加载 PDF
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;

    // 提取文本内容
    const textParts: string[] = [];
    const numPages = pdfDocument.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      textParts.push(pageText);
    }

    const fullText = textParts.join('\n\n');

    // 提取元数据
    const metadata: ParseResult['metadata'] = {
      pageCount: numPages,
      ...this.extractBasicMetadata(fullText),
    };

    // 尝试获取 PDF 信息
    try {
      const info = await pdfDocument.getMetadata();
      if (info.info) {
        const pdfInfo = info.info as Record<string, any>;
        if (pdfInfo.Title) {
          metadata.title = String(pdfInfo.Title);
        }
        if (pdfInfo.Author) {
          metadata.author = String(pdfInfo.Author);
        }
        if (pdfInfo.CreationDate) {
          metadata.createdAt = new Date(String(pdfInfo.CreationDate));
        }
        if (pdfInfo.ModDate) {
          metadata.modifiedAt = new Date(String(pdfInfo.ModDate));
        }
      }
    } catch (error) {
      // 如果无法获取元数据，忽略错误
      console.warn('Failed to extract PDF metadata:', error);
    }

    return {
      content: fullText,
      metadata,
    };
  }
}




















