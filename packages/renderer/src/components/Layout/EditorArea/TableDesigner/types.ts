/**
 * 表格设计器类型定义
 * 功能：定义表格设计器的列类型、行数据等接口
 */

/** 列类型枚举 */
export type ColumnType =
  | 'text' // 文本
  | 'number' // 数字
  | 'date' // 日期
  | 'checkbox' // 复选框
  | 'select' // 单选
  | 'multiselect' // 多选
  | 'tag' // 标签
  | 'url' // 链接
  | 'email'; // 邮箱

/** 列配置 */
export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
  options?: string[]; // 用于 select 和 multiselect 类型
}

/** 单元格值类型 */
export type CellValue = string | number | boolean | string[] | null;

/** 行数据 */
export interface TableRow {
  id: string;
  cells: Record<string, CellValue>;
}

/** 表格配置 */
export interface TableConfig {
  id: string;
  name: string;
  columns: TableColumn[];
  rows: TableRow[];
  createdAt: number;
  updatedAt: number;
}

/** 列类型信息 */
export interface ColumnTypeInfo {
  type: ColumnType;
  label: string;
  icon: string;
}

/** 所有列类型 */
export const COLUMN_TYPES: ColumnTypeInfo[] = [
  { type: 'text', label: '文本', icon: 'type-icon' },
  { type: 'number', label: '数字', icon: 'number-hash' },
  { type: 'date', label: '日期', icon: 'calendar-date' },
  { type: 'checkbox', label: '复选框', icon: 'checkbox-select' },
  { type: 'select', label: '单选', icon: 'radio-select' },
  { type: 'multiselect', label: '多选', icon: 'list-checks' },
  { type: 'tag', label: '标签', icon: 'tag' },
  { type: 'url', label: '链接', icon: 'link-2' },
  { type: 'email', label: '邮箱', icon: 'at-sign' },
];
