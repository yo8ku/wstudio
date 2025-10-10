/**
 * 解析器基类
 */

import { ParseResult, ParserOptions, ParserConfig } from './types';

export abstract class BaseParser {
  protected config: ParserConfig;

  constructor(config: ParserConfig) {
    this.config = config;
  }

  /**
   * 解析文件
   */
  abstract parse(
    filePath: string,
    options?: ParserOptions
  ): Promise<ParseResult>;

  /**
   * 解析文本内容
   */
  abstract parseText(
    content: string | Buffer,
    options?: ParserOptions
  ): Promise<ParseResult>;

  /**
   * 检查是否支持该文件类型
   */
  canParse(filePathOrType: string): boolean {
    const ext = filePathOrType.toLowerCase();
    return this.config.fileTypes.some(
      (type) => ext.endsWith(type) || ext === type
    );
  }

  /**
   * 获取支持的文件类型
   */
  getSupportedTypes(): string[] {
    return [...this.config.fileTypes];
  }

  /**
   * 获取解析器名称
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * 获取优先级
   */
  getPriority(): number {
    return this.config.priority || 0;
  }

  /**
   * 提取文本中的元数据（辅助方法）
   */
  protected extractBasicMetadata(content: string): Partial<ParseResult['metadata']> {
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    
    return {
      wordCount,
      encoding: 'utf-8',
    };
  }
}




















