/**
 * 表格操作工具类
 * 功能：提供表格数据的查询、更新、删除等操作
 * 描述：解析自然语言命令并执行对应的表格操作，无需调用 AI
 */

import type { TableColumn, TableRow, CellValue, ColumnType } from './types';

/** 查询条件类型 */
export type QueryOperator = 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'gt' | 'gte' | 'lt' | 'lte' | 'notEquals' | 'isEmpty' | 'isNotEmpty';

/** 查询条件 */
export interface QueryCondition {
  columnName: string;
  operator: QueryOperator;
  value?: CellValue;
}

/** 排序配置 */
export interface SortConfig {
  columnName: string;
  direction: 'asc' | 'desc';
}

/** 将时间字符串转换为分钟数（用于比较） */
function timeToMinutes(timeStr: string): number {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return NaN;
}

/** 检查字符串是否是时间格式 */
function isTimeFormat(str: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(str);
}

/** 查询选项 */
export interface QueryOptions {
  conditions?: QueryCondition[];
  conditionLogic?: 'and' | 'or';
  sort?: SortConfig;
  limit?: number;
  offset?: number;
}

/** 更新操作 */
export interface UpdateOperation {
  columnName: string;
  value: CellValue;
}

/** 操作结果 */
export interface OperationResult<T = Record<string, CellValue>[]> {
  success: boolean;
  message: string;
  data: T;
  affectedCount: number;
}

/**
 * 表格操作类
 */
export class TableOperations {
  private columns: TableColumn[];
  private rows: TableRow[];

  constructor(columns: TableColumn[], rows: TableRow[]) {
    this.columns = columns;
    this.rows = rows;
  }

  /** 更新数据源 */
  updateDataSource(columns: TableColumn[], rows: TableRow[]): void {
    this.columns = columns;
    this.rows = rows;
  }

  /** 根据列名获取列 */
  private getColumnByName(name: string): TableColumn | undefined {
    return this.columns.find(col => col.name === name || col.name.toLowerCase() === name.toLowerCase());
  }

  /** 获取行的单元格值（按列名） */
  private getCellValueByColumnName(row: TableRow, columnName: string): CellValue {
    const column = this.getColumnByName(columnName);
    if (!column) return null;
    return row.cells[column.id];
  }

  /** 比较值 */
  private compareValues(cellValue: CellValue, operator: QueryOperator, conditionValue?: CellValue, columnType?: ColumnType): boolean {
    const strCellValue = String(cellValue ?? '');
    const strConditionValue = String(conditionValue ?? '');
    const lowerCellValue = strCellValue.toLowerCase();
    const lowerConditionValue = strConditionValue.toLowerCase();

    switch (operator) {
      case 'equals':
        return lowerCellValue === lowerConditionValue;
      case 'notEquals':
        return lowerCellValue !== lowerConditionValue;
      case 'contains':
        return lowerCellValue.includes(lowerConditionValue);
      case 'startsWith':
        return lowerCellValue.startsWith(lowerConditionValue);
      case 'endsWith':
        return lowerCellValue.endsWith(lowerConditionValue);
      case 'gt': {
        // 时间类型比较
        if (columnType === 'time' || (isTimeFormat(strCellValue) && isTimeFormat(strConditionValue))) {
          const timeCell = timeToMinutes(strCellValue);
          const timeCondition = timeToMinutes(strConditionValue);
          if (!isNaN(timeCell) && !isNaN(timeCondition)) {
            return timeCell > timeCondition;
          }
        }
        // 数字比较
        const numCell = parseFloat(strCellValue);
        const numCondition = parseFloat(strConditionValue);
        // 只有当两个值都是纯数字时才使用数字比较
        if (!isNaN(numCell) && !isNaN(numCondition) && /^-?\d+\.?\d*$/.test(strCellValue) && /^-?\d+\.?\d*$/.test(strConditionValue)) {
          return numCell > numCondition;
        }
        // 字符串比较
        return strCellValue > strConditionValue;
      }
      case 'gte': {
        // 时间类型比较
        if (columnType === 'time' || (isTimeFormat(strCellValue) && isTimeFormat(strConditionValue))) {
          const timeCell = timeToMinutes(strCellValue);
          const timeCondition = timeToMinutes(strConditionValue);
          if (!isNaN(timeCell) && !isNaN(timeCondition)) {
            return timeCell >= timeCondition;
          }
        }
        // 数字比较
        const numCell = parseFloat(strCellValue);
        const numCondition = parseFloat(strConditionValue);
        if (!isNaN(numCell) && !isNaN(numCondition) && /^-?\d+\.?\d*$/.test(strCellValue) && /^-?\d+\.?\d*$/.test(strConditionValue)) {
          return numCell >= numCondition;
        }
        return strCellValue >= strConditionValue;
      }
      case 'lt': {
        // 时间类型比较
        if (columnType === 'time' || (isTimeFormat(strCellValue) && isTimeFormat(strConditionValue))) {
          const timeCell = timeToMinutes(strCellValue);
          const timeCondition = timeToMinutes(strConditionValue);
          if (!isNaN(timeCell) && !isNaN(timeCondition)) {
            return timeCell < timeCondition;
          }
        }
        // 数字比较
        const numCell = parseFloat(strCellValue);
        const numCondition = parseFloat(strConditionValue);
        if (!isNaN(numCell) && !isNaN(numCondition) && /^-?\d+\.?\d*$/.test(strCellValue) && /^-?\d+\.?\d*$/.test(strConditionValue)) {
          return numCell < numCondition;
        }
        return strCellValue < strConditionValue;
      }
      case 'lte': {
        // 时间类型比较
        if (columnType === 'time' || (isTimeFormat(strCellValue) && isTimeFormat(strConditionValue))) {
          const timeCell = timeToMinutes(strCellValue);
          const timeCondition = timeToMinutes(strConditionValue);
          if (!isNaN(timeCell) && !isNaN(timeCondition)) {
            return timeCell <= timeCondition;
          }
        }
        // 数字比较
        const numCell = parseFloat(strCellValue);
        const numCondition = parseFloat(strConditionValue);
        if (!isNaN(numCell) && !isNaN(numCondition) && /^-?\d+\.?\d*$/.test(strCellValue) && /^-?\d+\.?\d*$/.test(strConditionValue)) {
          return numCell <= numCondition;
        }
        return strCellValue <= strConditionValue;
      }
      case 'isEmpty':
        return cellValue === null || cellValue === undefined || cellValue === '';
      case 'isNotEmpty':
        return cellValue !== null && cellValue !== undefined && cellValue !== '';
      default:
        return false;
    }
  }

  /** 检查行是否匹配条件（支持 AND/OR 逻辑） */
  private matchesConditions(row: TableRow, conditions: QueryCondition[], logic: 'and' | 'or' = 'and'): boolean {
    if (logic === 'or') {
      return conditions.some(condition => {
        const column = this.getColumnByName(condition.columnName);
        const cellValue = this.getCellValueByColumnName(row, condition.columnName);
        const columnType = column?.type;
        const result = this.compareValues(cellValue, condition.operator, condition.value, columnType);
        return result;
      });
    }
    return conditions.every(condition => {
      const column = this.getColumnByName(condition.columnName);
      const cellValue = this.getCellValueByColumnName(row, condition.columnName);
      const columnType = column?.type;
      const result = this.compareValues(cellValue, condition.operator, condition.value, columnType);
      return result;
    });
  }

  /** 将行转换为记录对象 */
  private rowToRecord(row: TableRow, rowIndex: number): Record<string, CellValue> {
    const record: Record<string, CellValue> = { _rowIndex: rowIndex, _rowId: row.id };
    this.columns.forEach(col => {
      record[col.name] = row.cells[col.id];
    });
    return record;
  }

  /**
   * 查询数据
   */
  query(options: QueryOptions = {}): OperationResult {
    const { conditions = [], conditionLogic = 'and', sort, limit, offset = 0 } = options;

    let result = this.rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => conditions.length === 0 || this.matchesConditions(row, conditions, conditionLogic));

    // 排序
    if (sort) {
      const column = this.getColumnByName(sort.columnName);
      if (column) {
        result.sort((a, b) => {
          const aValue = a.row.cells[column.id];
          const bValue = b.row.cells[column.id];
          const aStr = String(aValue ?? '');
          const bStr = String(bValue ?? '');
          const comparison = aStr.localeCompare(bStr, undefined, { numeric: true });
          return sort.direction === 'desc' ? -comparison : comparison;
        });
      }
    }

    // 分页
    if (offset > 0) {
      result = result.slice(offset);
    }
    if (limit !== undefined && limit > 0) {
      result = result.slice(0, limit);
    }

    const data = result.map(({ row, index }) => this.rowToRecord(row, index));

    return {
      success: true,
      message: `查询到 ${data.length} 条数据`,
      data,
      affectedCount: data.length,
    };
  }

  /**
   * 更新数据
   * 返回更新后的行数据
   */
  update(
    conditions: QueryCondition[],
    updates: UpdateOperation[],
    conditionLogic: 'and' | 'or' = 'and'
  ): OperationResult<{ updatedRows: TableRow[]; affectedIndices: number[] }> {
    const affectedIndices: number[] = [];
    const updatedRows: TableRow[] = [];

    this.rows.forEach((row, index) => {
      if (conditions.length === 0 || this.matchesConditions(row, conditions, conditionLogic)) {
        affectedIndices.push(index);
        const newCells = { ...row.cells };
        
        updates.forEach(update => {
          const column = this.getColumnByName(update.columnName);
          if (column) {
            newCells[column.id] = update.value;
          }
        });

        updatedRows.push({ ...row, cells: newCells });
      }
    });

    return {
      success: true,
      message: `更新了 ${affectedIndices.length} 条数据`,
      data: { updatedRows, affectedIndices },
      affectedCount: affectedIndices.length,
    };
  }

  /**
   * 删除数据
   * 返回要删除的行索引
   */
  delete(conditions: QueryCondition[]): OperationResult<{ deletedIndices: number[] }> {
    const deletedIndices: number[] = [];

    this.rows.forEach((row, index) => {
      if (this.matchesConditions(row, conditions)) {
        deletedIndices.push(index);
      }
    });

    return {
      success: true,
      message: `将删除 ${deletedIndices.length} 条数据`,
      data: { deletedIndices },
      affectedCount: deletedIndices.length,
    };
  }

  /**
   * 解析自然语言查询命令
   */
  parseQueryCommand(command: string): QueryOptions {
    const options: QueryOptions = {};
    const conditions: QueryCondition[] = [];
    const lowerCommand = command.toLowerCase();

    // 解析 "所有数据" 或 "全部数据"
    if (lowerCommand.includes('所有') || lowerCommand.includes('全部')) {
      // 不添加条件，返回所有数据
      return options;
    }

    // 解析 "第X行" 或 "第X条"
    const rowMatch = command.match(/第\s*(\d+)\s*(行|条)/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1], 10) - 1;
      options.offset = rowIndex;
      options.limit = 1;
      return options;
    }

    // 解析 "前X条" 或 "前X行"
    const topMatch = command.match(/前\s*(\d+)\s*(条|行)/);
    if (topMatch) {
      options.limit = parseInt(topMatch[1], 10);
      return options;
    }

    // 解析 "后X条" 或 "后X行"
    const lastMatch = command.match(/后\s*(\d+)\s*(条|行)/);
    if (lastMatch) {
      const count = parseInt(lastMatch[1], 10);
      options.offset = Math.max(0, this.rows.length - count);
      options.limit = count;
      return options;
    }

    // 解析条件：列名 = 值、列名是值、列名为值
    const conditionPatterns = [
      /(\S+)\s*[=＝]\s*["']?([^"']+)["']?/g,
      /(\S+)\s*(?:是|为)\s*["']?([^"'，,]+)["']?/g,
    ];

    for (const pattern of conditionPatterns) {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const columnName = match[1];
        const value = match[2].trim();
        const column = this.getColumnByName(columnName);
        if (column) {
          conditions.push({ columnName, operator: 'equals', value });
        }
      }
    }

    // 解析包含条件
    const containsMatch = command.match(/(\S+)\s*包含\s*["']?([^"'，,]+)["']?/);
    if (containsMatch) {
      const columnName = containsMatch[1];
      const value = containsMatch[2].trim();
      const column = this.getColumnByName(columnName);
      if (column) {
        conditions.push({ columnName, operator: 'contains', value });
      }
    }

    // 解析大于/小于条件
    const gtMatch = command.match(/(\S+)\s*[>＞]\s*(\d+)/);
    if (gtMatch) {
      const columnName = gtMatch[1];
      const value = parseInt(gtMatch[2], 10);
      const column = this.getColumnByName(columnName);
      if (column) {
        conditions.push({ columnName, operator: 'gt', value });
      }
    }

    const ltMatch = command.match(/(\S+)\s*[<＜]\s*(\d+)/);
    if (ltMatch) {
      const columnName = ltMatch[1];
      const value = parseInt(ltMatch[2], 10);
      const column = this.getColumnByName(columnName);
      if (column) {
        conditions.push({ columnName, operator: 'lt', value });
      }
    }

    // 如果没有匹配到任何条件，尝试在所有列中搜索关键词
    if (conditions.length === 0) {
      // 提取可能的搜索值（去除常见的查询词）
      let searchValue = command
        .replace(/查询|搜索|查找|筛选|过滤|的数据|的记录|数据|记录/g, '')
        .trim();
      
      if (searchValue) {
        // 在所有文本类型的列中搜索
        for (const column of this.columns) {
          if (column.type === 'text' || column.type === 'select') {
            conditions.push({ 
              columnName: column.name, 
              operator: 'equals', 
              value: searchValue 
            });
          }
        }
        
        // 如果有多个条件，使用 OR 逻辑（任一列匹配即可）
        if (conditions.length > 0) {
          options.conditions = conditions;
          options.conditionLogic = 'or';
        }
      }
    } else {
      options.conditions = conditions;
    }

    return options;
  }

  /**
   * 解析自然语言更新命令
   */
  parseUpdateCommand(command: string): { conditions: QueryCondition[]; updates: UpdateOperation[] } {
    const conditions: QueryCondition[] = [];
    const updates: UpdateOperation[] = [];

    // 解析 "第X行" 条件
    const rowMatch = command.match(/第\s*(\d+)\s*(行|条)/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1], 10) - 1;
      if (rowIndex >= 0 && rowIndex < this.rows.length) {
        const row = this.rows[rowIndex];
        // 使用第一列作为唯一标识
        if (this.columns.length > 0) {
          const firstCol = this.columns[0];
          conditions.push({
            columnName: firstCol.name,
            operator: 'equals',
            value: row.cells[firstCol.id],
          });
        }
      }
    }

    // 解析条件：列名 = 值
    const conditionMatch = command.match(/(\S+)\s*[=＝]\s*["']?([^"']+)["']?\s*的/);
    if (conditionMatch) {
      const columnName = conditionMatch[1];
      const value = conditionMatch[2].trim();
      const column = this.getColumnByName(columnName);
      if (column) {
        conditions.push({ columnName, operator: 'equals', value });
      }
    }

    // 解析更新操作：将X改为Y、把X改成Y、X改为Y
    const updatePatterns = [
      /将\s*(\S+)\s*(?:改为|改成|设为|设置为)\s*["']?([^"'，,]+)["']?/g,
      /把\s*(\S+)\s*(?:改为|改成|设为|设置为)\s*["']?([^"'，,]+)["']?/g,
      /(\S+)\s*(?:改为|改成|设为)\s*["']?([^"'，,]+)["']?/g,
    ];

    for (const pattern of updatePatterns) {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const columnName = match[1];
        const value = match[2].trim();
        const column = this.getColumnByName(columnName);
        if (column) {
          updates.push({ columnName, value });
        }
      }
    }

    return { conditions, updates };
  }

  /**
   * 解析自然语言删除命令
   */
  parseDeleteCommand(command: string): QueryCondition[] {
    const conditions: QueryCondition[] = [];
    const lowerCommand = command.toLowerCase();

    // 解析 "所有数据" 或 "全部数据"
    if (lowerCommand.includes('所有') || lowerCommand.includes('全部')) {
      // 不添加条件，删除所有数据
      return conditions;
    }

    // 解析 "第X行" 条件
    const rowMatch = command.match(/第\s*(\d+)\s*(行|条)/);
    if (rowMatch) {
      const rowIndex = parseInt(rowMatch[1], 10) - 1;
      if (rowIndex >= 0 && rowIndex < this.rows.length) {
        const row = this.rows[rowIndex];
        // 使用行ID作为唯一标识
        if (this.columns.length > 0) {
          const firstCol = this.columns[0];
          conditions.push({
            columnName: firstCol.name,
            operator: 'equals',
            value: row.cells[firstCol.id],
          });
        }
      }
    }

    // 解析条件：列名 = 值
    const conditionPatterns = [
      /(\S+)\s*[=＝]\s*["']?([^"']+)["']?/g,
      /(\S+)\s*(?:是|为)\s*["']?([^"'，,]+)["']?/g,
    ];

    for (const pattern of conditionPatterns) {
      let match;
      while ((match = pattern.exec(command)) !== null) {
        const columnName = match[1];
        const value = match[2].trim();
        const column = this.getColumnByName(columnName);
        if (column) {
          conditions.push({ columnName, operator: 'equals', value });
        }
      }
    }

    return conditions;
  }
}

export default TableOperations;
