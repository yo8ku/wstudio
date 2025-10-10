/**
 * 解析器注册表
 */

import { BaseParser } from './BaseParser';
import { ParseResult, ParserOptions } from './types';

export class ParserRegistry {
  private static instance: ParserRegistry;
  private parsers: Map<string, BaseParser> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  /**
   * 注册解析器
   */
  register(parser: BaseParser): void {
    const name = parser.getName();
    if (this.parsers.has(name)) {
      console.warn(`Parser ${name} already registered, overwriting...`);
    }
    this.parsers.set(name, parser);
  }

  /**
   * 注销解析器
   */
  unregister(name: string): void {
    this.parsers.delete(name);
  }

  /**
   * 获取解析器
   */
  getParser(name: string): BaseParser | undefined {
    return this.parsers.get(name);
  }

  /**
   * 根据文件路径获取合适的解析器
   */
  getParserForFile(filePath: string): BaseParser | undefined {
    const candidates: BaseParser[] = [];

    for (const parser of this.parsers.values()) {
      if (parser.canParse(filePath)) {
        candidates.push(parser);
      }
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // 按优先级排序
    candidates.sort((a, b) => b.getPriority() - a.getPriority());

    return candidates[0];
  }

  /**
   * 解析文件（自动选择解析器）
   */
  async parseFile(
    filePath: string,
    options?: ParserOptions
  ): Promise<ParseResult> {
    const parser = this.getParserForFile(filePath);
    if (!parser) {
      throw new Error(`No parser found for file: ${filePath}`);
    }

    return parser.parse(filePath, options);
  }

  /**
   * 列出所有已注册的解析器
   */
  listParsers(): BaseParser[] {
    return Array.from(this.parsers.values());
  }

  /**
   * 获取所有支持的文件类型
   */
  getSupportedTypes(): string[] {
    const types = new Set<string>();
    for (const parser of this.parsers.values()) {
      parser.getSupportedTypes().forEach((type) => types.add(type));
    }
    return Array.from(types);
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.parsers.clear();
  }
}




















