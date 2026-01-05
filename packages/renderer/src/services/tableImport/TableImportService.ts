/**
 * 表格导入服务
 * 功能：提供统一的表格文件导入接口，支持 CSV、Excel 等格式
 */

import { CsvParser, ExcelParser } from './parsers';
import type { 
  IFileParser, 
  ImportResult, 
  ImportOptions, 
  SupportedFileType,
  ImportColumn,
  ImportRow,
} from './types';

/**
 * 表格导入服务类
 * 统一管理各种文件格式的解析器
 */
export class TableImportService {
  private parsers: IFileParser[] = [];
  private static instance: TableImportService | null = null;

  private constructor() {
    // 注册默认解析器
    this.registerParser(new CsvParser());
    this.registerParser(new ExcelParser());
  }

  /**
   * 获取单例实例
   */
  static getInstance(): TableImportService {
    if (!TableImportService.instance) {
      TableImportService.instance = new TableImportService();
    }
    return TableImportService.instance;
  }

  /**
   * 注册文件解析器
   */
  registerParser(parser: IFileParser): void {
    this.parsers.push(parser);
  }

  /**
   * 获取支持的文件扩展名列表
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    for (const parser of this.parsers) {
      for (const ext of parser.supportedExtensions) {
        extensions.add(ext);
      }
    }
    return Array.from(extensions);
  }

  /**
   * 获取文件选择器的 accept 属性值
   * 使用 MIME 类型和扩展名组合，确保文件过滤器正确显示
   */
  getAcceptString(): string {
    // 使用 MIME 类型确保文件过滤器正确显示
    const mimeTypes = [
      '.csv',
      '.tsv',
      '.txt',
      '.xlsx',
      '.xls',
      'text/csv',
      'text/tab-separated-values',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    return mimeTypes.join(',');
  }

  /**
   * 获取文件过滤器描述（用于显示）
   */
  getFilterDescription(): string {
    return '表格文件 (*.csv, *.xlsx, *.xls)';
  }

  /**
   * 检查文件是否支持导入
   */
  canImport(file: File): boolean {
    return this.parsers.some(parser => parser.canParse(file));
  }

  /**
   * 导入文件
   */
  async import(file: File, options?: ImportOptions): Promise<ImportResult> {
    // 查找合适的解析器
    const parser = this.parsers.find(p => p.canParse(file));

    if (!parser) {
      const ext = this.getFileExtension(file.name);
      return {
        success: false,
        error: `不支持的文件格式: ${ext || '未知'}`,
        columns: [],
        rows: [],
        totalRows: 0,
        fileType: 'csv',
      };
    }

    return parser.parse(file, options);
  }

  /**
   * 从文件输入元素导入
   */
  async importFromInput(input: HTMLInputElement, options?: ImportOptions): Promise<ImportResult> {
    const file = input.files?.[0];

    if (!file) {
      return {
        success: false,
        error: '未选择文件',
        columns: [],
        rows: [],
        totalRows: 0,
        fileType: 'csv',
      };
    }

    return this.import(file, options);
  }

  /**
   * 打开文件选择对话框并导入
   */
  async openAndImport(options?: ImportOptions): Promise<ImportResult> {
    // 尝试使用 Electron 原生对话框
    if (window.electron?.file?.showOpenDialog) {
      try {
        const result = await window.electron.file.showOpenDialog({
          title: '导入表格文件',
          filters: [
            { name: '表格文件 (*.csv, *.xlsx, *.xls, *.tsv)', extensions: ['csv', 'xlsx', 'xls', 'tsv'] },
            { name: 'CSV 文件 (*.csv, *.tsv)', extensions: ['csv', 'tsv'] },
            { name: 'Excel 文件 (*.xlsx, *.xls)', extensions: ['xlsx', 'xls'] },
          ],
          properties: ['openFile'],
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
          return {
            success: false,
            error: '用户取消选择',
            columns: [],
            rows: [],
            totalRows: 0,
            fileType: 'csv',
          };
        }

        // 读取文件内容
        const filePath = result.filePaths[0];
        const fileData = await window.electron.file.readBinary(filePath);
        const fileName = filePath.split(/[/\\]/).pop() || 'unknown';
        
        // 创建 File 对象（使用 Blob 中转避免类型问题）
        const blob = new Blob([fileData as BlobPart]);
        const file = new File([blob], fileName);
        return this.import(file, options);
      } catch (error) {
        console.error('[TableImportService] Electron 对话框失败，回退到浏览器对话框:', error);
      }
    }

    // 回退到浏览器文件选择
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = this.getAcceptString();

      input.onchange = async () => {
        const result = await this.importFromInput(input, options);
        resolve(result);
      };

      input.oncancel = () => {
        resolve({
          success: false,
          error: '用户取消选择',
          columns: [],
          rows: [],
          totalRows: 0,
          fileType: 'csv',
        });
      };

      input.click();
    });
  }

  /**
   * 获取文件扩展名
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : '';
  }
}

/** 获取表格导入服务实例 */
export const getTableImportService = (): TableImportService => {
  return TableImportService.getInstance();
};

// 导出类型
export type { ImportResult, ImportOptions, ImportColumn, ImportRow, SupportedFileType };
