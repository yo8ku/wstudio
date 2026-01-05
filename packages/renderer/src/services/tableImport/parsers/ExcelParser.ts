/**
 * Excel 文件解析器
 * 功能：解析 Excel 格式的表格文件（.xlsx, .xls）
 */

import * as XLSX from 'xlsx';
import { BaseParser } from './BaseParser';
import type { IFileParser, ImportResult, ImportOptions, ImportRow } from '../types';

/**
 * Excel 文件解析器
 * 使用 SheetJS (xlsx) 库解析 Excel 文件
 */
export class ExcelParser extends BaseParser implements IFileParser {
  readonly supportedExtensions = ['.xlsx', '.xls'];

  /**
   * 检查是否支持该文件
   */
  canParse(file: File): boolean {
    const ext = this.getFileExtension(file.name);
    return this.supportedExtensions.includes(ext);
  }

  /**
   * 解析 Excel 文件
   */
  async parse(file: File, options: ImportOptions = {}): Promise<ImportResult> {
    const {
      hasHeader = true,
      sheetName,
      maxRows,
    } = options;

    try {
      const buffer = await this.readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: 'array' });

      // 获取可用的工作表
      const availableSheets = workbook.SheetNames;

      if (availableSheets.length === 0) {
        return {
          success: false,
          error: 'Excel 文件中没有工作表',
          columns: [],
          rows: [],
          totalRows: 0,
          fileType: this.getFileType(file.name),
          availableSheets: [],
        };
      }

      // 选择工作表
      const targetSheetName = sheetName && availableSheets.includes(sheetName)
        ? sheetName
        : availableSheets[0];

      const worksheet = workbook.Sheets[targetSheetName];

      if (!worksheet) {
        return {
          success: false,
          error: `找不到工作表: ${targetSheetName}`,
          columns: [],
          rows: [],
          totalRows: 0,
          fileType: this.getFileType(file.name),
          availableSheets,
        };
      }

      // 转换为 JSON
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
        header: hasHeader ? undefined : 1,
        defval: null,
      });

      if (jsonData.length === 0) {
        return {
          success: true,
          columns: [],
          rows: [],
          totalRows: 0,
          fileType: this.getFileType(file.name),
          sheetName: targetSheetName,
          availableSheets,
        };
      }

      // 获取表头
      let headers: string[];
      let dataRows: Record<string, unknown>[];

      if (hasHeader) {
        // 从第一行数据获取列名
        headers = Object.keys(jsonData[0]).map((h, i) => 
          String(h).trim() || `列 ${i + 1}`
        );
        dataRows = jsonData;
      } else {
        // 使用数字索引作为列名
        const firstRow = jsonData[0];
        const columnCount = Object.keys(firstRow).length;
        headers = this.generateDefaultHeaders(columnCount);
        
        // 重新映射数据
        dataRows = jsonData.map(row => {
          const newRow: Record<string, unknown> = {};
          Object.values(row).forEach((value, index) => {
            newRow[headers[index]] = value;
          });
          return newRow;
        });
      }

      // 限制行数
      if (maxRows && dataRows.length > maxRows) {
        dataRows = dataRows.slice(0, maxRows);
      }

      // 转换为 ImportRow
      const rows: ImportRow[] = dataRows.map(row => {
        const importRow: ImportRow = {};
        headers.forEach(header => {
          importRow[header] = this.convertCellValue(row[header]);
        });
        return importRow;
      });

      // 推断列类型
      const columns = this.inferColumns(headers, rows);

      return {
        success: true,
        columns,
        rows,
        totalRows: rows.length,
        fileType: this.getFileType(file.name),
        sheetName: targetSheetName,
        availableSheets,
      };
    } catch (error) {
      return {
        success: false,
        error: `解析 Excel 文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        columns: [],
        rows: [],
        totalRows: 0,
        fileType: this.getFileType(file.name),
      };
    }
  }

  /**
   * 读取文件为 ArrayBuffer
   */
  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  }

  /**
   * 获取文件类型
   */
  private getFileType(filename: string): 'xlsx' | 'xls' {
    const ext = this.getFileExtension(filename);
    return ext === '.xls' ? 'xls' : 'xlsx';
  }
}
