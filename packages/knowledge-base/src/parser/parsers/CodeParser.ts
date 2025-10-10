/**
 * 代码文件解析器
 */

import { readFile } from 'fs/promises';
import { BaseParser } from '../BaseParser';
import { ParseResult, ParserOptions } from '../types';

export class CodeParser extends BaseParser {
  constructor() {
    super({
      name: 'code',
      fileTypes: [
        '.js', '.jsx', '.ts', '.tsx',
        '.py', '.java', '.c', '.cpp', '.cs',
        '.go', '.rs', '.rb', '.php',
        '.swift', '.kt', '.scala',
        '.sh', '.bash', '.ps1',
      ],
      priority: 5,
    });
  }

  async parse(filePath: string, options?: ParserOptions): Promise<ParseResult> {
    const content = await readFile(filePath, 'utf-8');
    return this.parseText(content, options);
  }

  async parseText(content: string | Buffer, options?: ParserOptions): Promise<ParseResult> {
    const code = typeof content === 'string' ? content : content.toString('utf-8');
    
    const language = this.detectLanguage(code);
    const comments = this.extractComments(code, language);
    const functions = this.extractFunctions(code, language);
    const imports = this.extractImports(code, language);

    const metadata: ParseResult['metadata'] = {
      language,
      comments: comments.length,
      functions: functions.length,
      imports: imports.length,
      ...this.extractBasicMetadata(code),
    };

    return {
      content: code,
      metadata,
    };
  }

  /**
   * 检测编程语言
   */
  private detectLanguage(code: string): string {
    if (code.includes('import ') && code.includes('from ')) return 'python';
    if (code.includes('import ') && code.includes('{')) return 'javascript';
    if (code.includes('package ') && code.includes('class ')) return 'java';
    if (code.includes('fn ') && code.includes('->')) return 'rust';
    if (code.includes('func ') && code.includes('package ')) return 'go';
    if (code.includes('def ') && code.includes('end')) return 'ruby';
    if (code.includes('<?php')) return 'php';
    
    return 'unknown';
  }

  /**
   * 提取注释
   */
  private extractComments(code: string, language: string): string[] {
    const comments: string[] = [];
    
    // 单行注释
    const singleLinePattern = /\/\/.*$/gm;
    const matches = code.match(singleLinePattern);
    if (matches) {
      comments.push(...matches.map((m) => m.replace('//', '').trim()));
    }

    // 多行注释
    const multiLinePattern = /\/\*[\s\S]*?\*\//g;
    const multiMatches = code.match(multiLinePattern);
    if (multiMatches) {
      comments.push(
        ...multiMatches.map((m) => m.replace(/\/\*|\*\//g, '').trim())
      );
    }

    return comments;
  }

  /**
   * 提取函数定义
   */
  private extractFunctions(code: string, language: string): string[] {
    const functions: string[] = [];
    
    // JavaScript/TypeScript
    const jsFuncPattern = /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*)?(?:async\s*)?\([^)]*\)/g;
    let match;
    while ((match = jsFuncPattern.exec(code)) !== null) {
      functions.push(match[1]);
    }

    // Python
    const pyFuncPattern = /def\s+(\w+)\s*\([^)]*\)/g;
    while ((match = pyFuncPattern.exec(code)) !== null) {
      functions.push(match[1]);
    }

    return functions;
  }

  /**
   * 提取导入语句
   */
  private extractImports(code: string, language: string): string[] {
    const imports: string[] = [];
    
    // JavaScript/TypeScript
    const jsImportPattern = /import\s+(?:{[^}]+}|[\w]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = jsImportPattern.exec(code)) !== null) {
      imports.push(match[1]);
    }

    // Python
    const pyImportPattern = /(?:from\s+([\w.]+)\s+)?import\s+([\w,\s*]+)/g;
    while ((match = pyImportPattern.exec(code)) !== null) {
      imports.push(match[1] || match[2]);
    }

    return imports;
  }
}




















