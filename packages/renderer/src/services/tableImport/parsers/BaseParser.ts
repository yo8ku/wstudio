/**
 * 文件解析器基类
 * 功能：提供文件解析的通用方法和类型推断逻辑
 */

import type { ImportColumn, ImportRow, ImportCellValue } from '../types';

/** 列类型 */
type ColumnType = 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'email' | 'url';

/**
 * 文件解析器基类
 * 提供通用的类型推断和数据处理方法
 */
export abstract class BaseParser {
  /**
   * 推断单元格值的类型
   */
  protected inferValueType(value: ImportCellValue): ColumnType {
    if (value === null || value === undefined || value === '') {
      return 'text';
    }

    // 布尔值
    if (typeof value === 'boolean') {
      return 'checkbox';
    }

    // 数字
    if (typeof value === 'number') {
      return 'number';
    }

    const strValue = String(value).trim();

    // 布尔字符串
    if (/^(true|false|yes|no|是|否)$/i.test(strValue)) {
      return 'checkbox';
    }

    // 数字字符串
    if (/^-?\d+\.?\d*$/.test(strValue)) {
      return 'number';
    }

    // 时间格式 (HH:MM 或 HH:MM:SS)
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(strValue)) {
      return 'time';
    }

    // 日期格式 (YYYY-MM-DD 或 YYYY/MM/DD 或 DD/MM/YYYY 等)
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(strValue) ||
        /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(strValue)) {
      return 'date';
    }

    // 邮箱
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strValue)) {
      return 'email';
    }

    // URL
    if (/^https?:\/\//.test(strValue)) {
      return 'url';
    }

    return 'text';
  }

  /**
   * 根据多个样本值推断列类型
   */
  protected inferColumnType(sampleValues: ImportCellValue[]): ColumnType {
    const nonEmptyValues = sampleValues.filter(
      v => v !== null && v !== undefined && v !== ''
    );

    if (nonEmptyValues.length === 0) {
      return 'text';
    }

    // 统计各类型出现次数
    const typeCounts: Record<ColumnType, number> = {
      text: 0,
      number: 0,
      date: 0,
      time: 0,
      checkbox: 0,
      email: 0,
      url: 0,
    };

    for (const value of nonEmptyValues) {
      const type = this.inferValueType(value);
      typeCounts[type]++;
    }

    // 找出出现最多的类型（text 除外）
    let maxType: ColumnType = 'text';
    let maxCount = 0;

    for (const [type, count] of Object.entries(typeCounts)) {
      if (type !== 'text' && count > maxCount) {
        maxCount = count;
        maxType = type as ColumnType;
      }
    }

    // 如果非 text 类型占比超过 80%，使用该类型
    const threshold = nonEmptyValues.length * 0.8;
    if (maxCount >= threshold) {
      return maxType;
    }

    return 'text';
  }

  /**
   * 从行数据中推断列信息
   */
  protected inferColumns(
    headers: string[],
    rows: ImportRow[],
    sampleSize: number = 100
  ): ImportColumn[] {
    const sampleRows = rows.slice(0, sampleSize);

    return headers.map((name, index) => {
      const sampleValues = sampleRows.map(row => row[name]);
      const type = this.inferColumnType(sampleValues);

      return {
        name: name || `列 ${index + 1}`,
        type,
        index,
      };
    });
  }

  /**
   * 转换单元格值
   */
  protected convertCellValue(value: unknown): ImportCellValue {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    // 日期对象转字符串
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    return String(value);
  }

  /**
   * 生成默认列名
   */
  protected generateDefaultHeaders(columnCount: number): string[] {
    return Array.from({ length: columnCount }, (_, i) => `列 ${i + 1}`);
  }
}
