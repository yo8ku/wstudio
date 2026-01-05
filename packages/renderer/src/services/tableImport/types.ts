/**
 * 表格导入模块类型定义
 * 功能：定义表格导入相关的接口和类型
 */

/** 支持的文件类型 */
export type SupportedFileType = 'csv' | 'xlsx' | 'xls';

/** 导入的单元格值类型 */
export type ImportCellValue = string | number | boolean | null;

/** 导入的行数据 */
export interface ImportRow {
  [columnName: string]: ImportCellValue;
}

/** 导入的列信息 */
export interface ImportColumn {
  /** 列名 */
  name: string;
  /** 推断的列类型 */
  type: 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'email' | 'url';
  /** 原始索引 */
  index: number;
}

/** 导入结果 */
export interface ImportResult {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
  /** 列信息 */
  columns: ImportColumn[];
  /** 行数据 */
  rows: ImportRow[];
  /** 工作表名称（Excel 文件） */
  sheetName?: string;
  /** 可用的工作表列表（Excel 文件） */
  availableSheets?: string[];
  /** 总行数 */
  totalRows: number;
  /** 文件类型 */
  fileType: SupportedFileType;
}

/** 导入选项 */
export interface ImportOptions {
  /** 是否将第一行作为表头，默认 true */
  hasHeader?: boolean;
  /** 指定工作表名称（Excel 文件），默认第一个工作表 */
  sheetName?: string;
  /** 最大导入行数，默认不限制 */
  maxRows?: number;
  /** 编码格式（CSV 文件），默认 utf-8 */
  encoding?: string;
  /** 分隔符（CSV 文件），默认自动检测 */
  delimiter?: string;
}

/** 文件解析器接口 */
export interface IFileParser {
  /** 支持的文件扩展名 */
  readonly supportedExtensions: string[];
  
  /** 检查是否支持该文件 */
  canParse(file: File): boolean;
  
  /** 解析文件 */
  parse(file: File, options?: ImportOptions): Promise<ImportResult>;
}
