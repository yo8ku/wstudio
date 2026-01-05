/**
 * 层级表格管理器
 * 功能：管理表格行的层级关系，支持父子行、折叠展开、缩进等功能
 */

import type { TableRow, TableColumn, CellValue } from './types';

/** 扁平化行数据（用于渲染） */
export interface FlattenedRow {
  row: TableRow;
  /** 层级深度，0表示顶级 */
  depth: number;
  /** 是否有子行 */
  hasChildren: boolean;
  /** 是否展开 */
  expanded: boolean;
  /** 在扁平列表中的索引 */
  flatIndex: number;
}

/** 生成唯一ID */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * 层级表格管理器类
 * 提供层级行的增删改查、折叠展开、扁平化渲染等功能
 */
export class HierarchyTableManager {
  /**
   * 获取行的所有子行ID（递归）
   */
  static getChildRowIds(rows: TableRow[], parentId: string): string[] {
    const childIds: string[] = [];
    const directChildren = rows.filter(r => r.parentId === parentId);
    
    for (const child of directChildren) {
      childIds.push(child.id);
      childIds.push(...this.getChildRowIds(rows, child.id));
    }
    
    return childIds;
  }

  /**
   * 获取行的直接子行
   */
  static getDirectChildren(rows: TableRow[], parentId: string): TableRow[] {
    return rows.filter(r => r.parentId === parentId);
  }

  /**
   * 检查行是否有子行
   */
  static hasChildren(rows: TableRow[], rowId: string): boolean {
    return rows.some(r => r.parentId === rowId);
  }

  /**
   * 获取行的层级深度
   */
  static getRowDepth(rows: TableRow[], rowId: string): number {
    const row = rows.find(r => r.id === rowId);
    if (!row || !row.parentId) return 0;
    return 1 + this.getRowDepth(rows, row.parentId);
  }

  /**
   * 获取行的父行链（从顶级到当前行的父行）
   */
  static getAncestorIds(rows: TableRow[], rowId: string): string[] {
    const ancestors: string[] = [];
    let currentRow = rows.find(r => r.id === rowId);
    
    while (currentRow?.parentId) {
      ancestors.unshift(currentRow.parentId);
      currentRow = rows.find(r => r.id === currentRow!.parentId);
    }
    
    return ancestors;
  }

  /**
   * 创建子行
   */
  static createChildRow(columns: TableColumn[], parentId: string): TableRow {
    const cells: Record<string, CellValue> = {};
    columns.forEach(col => {
      cells[col.id] = col.type === 'checkbox' ? false : '';
    });
    return {
      id: generateId(),
      cells,
      parentId,
      expanded: false,
    };
  }

  /**
   * 添加子行到指定父行下
   * 返回新的行数组
   */
  static addChildRow(
    rows: TableRow[],
    columns: TableColumn[],
    parentId: string
  ): { rows: TableRow[]; newRow: TableRow } {
    const newRow = this.createChildRow(columns, parentId);
    const newRows = [...rows];
    
    // 找到父行的位置
    const parentIndex = newRows.findIndex(r => r.id === parentId);
    if (parentIndex === -1) {
      // 父行不存在，添加到末尾
      newRows.push(newRow);
    } else {
      // 找到父行的最后一个子孙行的位置
      const allChildIds = this.getChildRowIds(newRows, parentId);
      let insertIndex = parentIndex + 1;
      
      for (let i = parentIndex + 1; i < newRows.length; i++) {
        if (allChildIds.includes(newRows[i].id)) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }
      
      newRows.splice(insertIndex, 0, newRow);
      
      // 确保父行展开
      const parentRow = newRows.find(r => r.id === parentId);
      if (parentRow) {
        parentRow.expanded = true;
      }
    }
    
    return { rows: newRows, newRow };
  }

  /**
   * 切换行的展开/折叠状态
   */
  static toggleRowExpanded(rows: TableRow[], rowId: string): TableRow[] {
    return rows.map(row => {
      if (row.id === rowId) {
        return { ...row, expanded: !row.expanded };
      }
      return row;
    });
  }

  /**
   * 展开行
   */
  static expandRow(rows: TableRow[], rowId: string): TableRow[] {
    return rows.map(row => {
      if (row.id === rowId) {
        return { ...row, expanded: true };
      }
      return row;
    });
  }

  /**
   * 折叠行
   */
  static collapseRow(rows: TableRow[], rowId: string): TableRow[] {
    return rows.map(row => {
      if (row.id === rowId) {
        return { ...row, expanded: false };
      }
      return row;
    });
  }

  /**
   * 展开所有行
   */
  static expandAll(rows: TableRow[]): TableRow[] {
    return rows.map(row => {
      if (this.hasChildren(rows, row.id)) {
        return { ...row, expanded: true };
      }
      return row;
    });
  }

  /**
   * 折叠所有行
   */
  static collapseAll(rows: TableRow[]): TableRow[] {
    return rows.map(row => ({ ...row, expanded: false }));
  }

  /**
   * 将层级行扁平化为渲染列表
   * 只返回可见的行（父行展开的子行）
   */
  static flattenRows(rows: TableRow[]): FlattenedRow[] {
    const result: FlattenedRow[] = [];
    const expandedSet = new Set(rows.filter(r => r.expanded).map(r => r.id));
    
    // 递归处理行
    const processRow = (row: TableRow, depth: number) => {
      const hasChildren = this.hasChildren(rows, row.id);
      const expanded = row.expanded ?? false;
      
      result.push({
        row,
        depth,
        hasChildren,
        expanded,
        flatIndex: result.length,
      });
      
      // 如果展开，处理子行
      if (expanded) {
        const children = this.getDirectChildren(rows, row.id);
        // 按原始顺序排列子行
        const sortedChildren = rows.filter(r => children.some(c => c.id === r.id));
        for (const child of sortedChildren) {
          processRow(child, depth + 1);
        }
      }
    };
    
    // 处理顶级行
    const topLevelRows = rows.filter(r => !r.parentId);
    for (const row of topLevelRows) {
      processRow(row, 0);
    }
    
    return result;
  }

  /**
   * 删除行及其所有子行
   */
  static deleteRowWithChildren(rows: TableRow[], rowId: string): TableRow[] {
    const childIds = this.getChildRowIds(rows, rowId);
    const idsToDelete = new Set([rowId, ...childIds]);
    return rows.filter(r => !idsToDelete.has(r.id));
  }

  /**
   * 移动行到新的父行下
   */
  static moveRowToParent(
    rows: TableRow[],
    rowId: string,
    newParentId: string | null
  ): TableRow[] {
    // 不能将行移动到自己的子行下
    if (newParentId) {
      const childIds = this.getChildRowIds(rows, rowId);
      if (childIds.includes(newParentId)) {
        return rows;
      }
    }
    
    return rows.map(row => {
      if (row.id === rowId) {
        return { ...row, parentId: newParentId };
      }
      return row;
    });
  }

  /**
   * 检查是否可以将行移动到目标父行
   */
  static canMoveToParent(
    rows: TableRow[],
    rowId: string,
    targetParentId: string | null
  ): boolean {
    if (!targetParentId) return true;
    if (rowId === targetParentId) return false;
    
    const childIds = this.getChildRowIds(rows, rowId);
    return !childIds.includes(targetParentId);
  }
}
