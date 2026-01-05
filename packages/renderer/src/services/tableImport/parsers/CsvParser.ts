/**
 * CSV 文件解析器
 * 功能：解析 CSV 格式的表格文件
 */

import { BaseParser } from './BaseParser';
import type { IFileParser, ImportResult, ImportOptions, ImportRow } from '../types';

/**
 * CSV 文件解析器
 * 支持自动检测分隔符和编码
 */
export class CsvParser extends BaseParser implements IFileParser {
  readonly supportedExtensions = ['.csv', '.tsv', '.txt'];

  /**
   * 检查是否支持该文件
   */
  canParse(file: File): boolean {
    const ext = this.getFileExtension(file.name);
    return this.supportedExtensions.includes(ext);
  }

  /**
   * 解析 CSV 文件
   */
  async parse(file: File, options: ImportOptions = {}): Promise<ImportResult> {
    const {
      hasHeader = true,
      maxRows,
      delimiter,
    } = options;

    try {
      const text = await this.readFileAsText(file);
      const detectedDelimiter = delimiter || this.detectDelimiter(text);
      const lines = this.parseLines(text, detectedDelimiter);

      if (lines.length === 0) {
        return {
          success: false,
          error: '文件为空或格式不正确',
          columns: [],
          rows: [],
          totalRows: 0,
          fileType: 'csv',
        };
      }

      // 获取表头
      let headers: string[];
      let dataLines: string[][];

      if (hasHeader) {
        headers = lines[0].map((h, i) => h.trim() || `列 ${i + 1}`);
        dataLines = lines.slice(1);
      } else {
        const columnCount = Math.max(...lines.map(l => l.length));
        headers = this.generateDefaultHeaders(columnCount);
        dataLines = lines;
      }

      // 限制行数
      if (maxRows && dataLines.length > maxRows) {
        dataLines = dataLines.slice(0, maxRows);
      }

      // 转换为行数据
      const rows: ImportRow[] = dataLines.map(line => {
        const row: ImportRow = {};
        headers.forEach((header, index) => {
          row[header] = this.convertCellValue(line[index]);
        });
        return row;
      });

      // 推断列类型
      const columns = this.inferColumns(headers, rows);

      return {
        success: true,
        columns,
        rows,
        totalRows: rows.length,
        fileType: 'csv',
      };
    } catch (error) {
      return {
        success: false,
        error: `解析 CSV 文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        columns: [],
        rows: [],
        totalRows: 0,
        fileType: 'csv',
      };
    }
  }

  /**
   * 读取文件为文本
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }

  /**
   * 自动检测分隔符
   */
  private detectDelimiter(text: string): string {
    const firstLine = text.split('\n')[0] || '';
    const delimiters = [',', '\t', ';', '|'];
    
    let maxCount = 0;
    let detectedDelimiter = ',';

    for (const delimiter of delimiters) {
      const count = (firstLine.match(new RegExp(this.escapeRegex(delimiter), 'g')) || []).length;
      if (count > maxCount) {
        maxCount = count;
        detectedDelimiter = delimiter;
      }
    }

    return detectedDelimiter;
  }

  /**
   * 解析 CSV 行
   */
  private parseLines(text: string, delimiter: string): string[][] {
    const lines: string[][] = [];
    const rows = text.split(/\r?\n/);

    for (const row of rows) {
      if (row.trim() === '') continue;
      
      const cells = this.parseCsvLine(row, delimiter);
      lines.push(cells);
    }

    return lines;
  }

  /**
   * 解析单行 CSV（处理引号内的分隔符）
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // 转义的引号
          current += '"';
          i++;
        } else if (char === '"') {
          // 结束引号
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // 开始引号
          inQuotes = true;
        } else if (char === delimiter) {
          // 分隔符
          cells.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    // 添加最后一个单元格
    cells.push(current.trim());

    return cells;
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
