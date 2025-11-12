/**
 * 自定义解析器示例
 */

import { BaseParser, ParseResult, ParserOptions } from '../src';
import { readFile } from 'fs/promises';

/**
 * 自定义 JSON 解析器示例
 */
export class JSONParser extends BaseParser {
  constructor() {
    super({
      name: 'json-custom',
      fileTypes: ['.json'],
      priority: 15, // 高优先级
    });
  }

  async parse(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    const content = await readFile(filePath, 'utf-8');
    return this.parseText(content, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const text = typeof content === 'string' ? content : content.toString('utf-8');
    
    try {
      const data = JSON.parse(text);
      
      // 提取文本内容
      const extractedText = this.extractTextFromObject(data);
      
      // 提取元数据
      const metadata = {
        format: 'json',
        ...this.extractBasicMetadata(extractedText),
      };

      if (options?.extractMetadata && data.metadata) {
        Object.assign(metadata, data.metadata);
      }

      return {
        content: extractedText,
        metadata,
      };
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }

  /**
   * 从 JSON 对象中递归提取文本
   */
  private extractTextFromObject(obj: any): string {
    const texts: string[] = [];

    const extract = (value: any) => {
      if (typeof value === 'string') {
        texts.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(extract);
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(extract);
      }
    };

    extract(obj);
    return texts.join('\n');
  }
}

/**
 * 使用示例
 */
async function example() {
  const { ParserRegistry } = await import('../src');
  
  const registry = ParserRegistry.getInstance();
  registry.register(new JSONParser());

  const result = await registry.parseFile('./data/sample.json', {
    extractMetadata: true,
  });

  console.log('Parsed content:', result.content);
  console.log('Metadata:', result.metadata);
}

// example().catch(console.error);




































































