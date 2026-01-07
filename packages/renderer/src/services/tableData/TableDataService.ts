/**
 * 表格数据服务
 * 功能：管理表格数据的加载、保存和变更追踪
 * 描述：提供增量保存功能，只保存新增和修改的数据，提高性能
 */

import type { TableColumn, TableRow, CellValue } from '../../components/Layout/EditorArea/TableDesigner/types';

/** 表格数据快照 */
interface TableDataSnapshot {
  columns: TableColumn[];
  rows: TableRow[];
  name: string;
}

/** 变更类型 */
type ChangeType = 'add' | 'modify' | 'delete';

/** 行变更记录 */
interface RowChange {
  type: ChangeType;
  rowId: string;
  data?: TableRow;
}

/** 列变更记录 */
interface ColumnChange {
  type: ChangeType;
  columnId: string;
  data?: TableColumn;
}

/** 表格变更记录 */
interface TableChanges {
  nameChanged: boolean;
  newName?: string;
  columnChanges: ColumnChange[];
  rowChanges: RowChange[];
}

/**
 * 表格数据服务类
 * 负责管理单个表格的数据加载、保存和变更追踪
 */
export class TableDataService {
  private formId: string | null = null;
  private originalSnapshot: TableDataSnapshot | null = null;
  private currentData: TableDataSnapshot | null = null;
  private isLoaded: boolean = false;

  /**
   * 初始化服务，绑定到指定的表单
   * @param formId 表单ID
   */
  async initialize(formId: string): Promise<TableDataSnapshot | null> {
    this.formId = formId;
    this.isLoaded = false;
    
    try {
      const result = await window.electron?.form?.getFormById(formId);
      
      if (result?.success && result.data) {
        const formData = result.data;
        let parsedData: { columns?: TableColumn[]; rows?: TableRow[] } = {};
        
        try {
          parsedData = formData.data ? JSON.parse(formData.data) : {};
        } catch {
          console.warn('[TableDataService] 解析表格数据失败，使用空数据');
        }
        
        const snapshot: TableDataSnapshot = {
          name: formData.name,
          columns: parsedData.columns || [],
          rows: parsedData.rows || [],
        };
        
        // 保存原始快照（深拷贝）
        this.originalSnapshot = JSON.parse(JSON.stringify(snapshot));
        this.currentData = snapshot;
        this.isLoaded = true;
        
        console.log('[TableDataService] 加载表格数据成功:', { formId, rowCount: snapshot.rows.length });
        
        return snapshot;
      }
      
      return null;
    } catch (error) {
      console.error('[TableDataService] 加载表格数据失败:', error);
      return null;
    }
  }

  /**
   * 更新当前数据（不保存到数据库）
   */
  updateCurrentData(data: Partial<TableDataSnapshot>): void {
    if (!this.currentData) {
      this.currentData = {
        name: data.name || '未命名表格',
        columns: data.columns || [],
        rows: data.rows || [],
      };
    } else {
      if (data.name !== undefined) this.currentData.name = data.name;
      if (data.columns !== undefined) this.currentData.columns = data.columns;
      if (data.rows !== undefined) this.currentData.rows = data.rows;
    }
  }

  /**
   * 计算变更
   */
  private calculateChanges(): TableChanges {
    const changes: TableChanges = {
      nameChanged: false,
      columnChanges: [],
      rowChanges: [],
    };

    if (!this.originalSnapshot || !this.currentData) {
      return changes;
    }

    // 检查名称变更
    if (this.currentData.name !== this.originalSnapshot.name) {
      changes.nameChanged = true;
      changes.newName = this.currentData.name;
    }

    // 检查列变更
    const originalColumnIds = new Set(this.originalSnapshot.columns.map(c => c.id));
    const currentColumnIds = new Set(this.currentData.columns.map(c => c.id));

    // 新增的列
    for (const col of this.currentData.columns) {
      if (!originalColumnIds.has(col.id)) {
        changes.columnChanges.push({ type: 'add', columnId: col.id, data: col });
      }
    }

    // 删除的列
    for (const col of this.originalSnapshot.columns) {
      if (!currentColumnIds.has(col.id)) {
        changes.columnChanges.push({ type: 'delete', columnId: col.id });
      }
    }

    // 修改的列
    for (const col of this.currentData.columns) {
      if (originalColumnIds.has(col.id)) {
        const originalCol = this.originalSnapshot.columns.find(c => c.id === col.id);
        if (originalCol && !this.isColumnEqual(originalCol, col)) {
          changes.columnChanges.push({ type: 'modify', columnId: col.id, data: col });
        }
      }
    }

    // 检查行变更
    const originalRowIds = new Set(this.originalSnapshot.rows.map(r => r.id));
    const currentRowIds = new Set(this.currentData.rows.map(r => r.id));

    // 新增的行
    for (const row of this.currentData.rows) {
      if (!originalRowIds.has(row.id)) {
        changes.rowChanges.push({ type: 'add', rowId: row.id, data: row });
      }
    }

    // 删除的行
    for (const row of this.originalSnapshot.rows) {
      if (!currentRowIds.has(row.id)) {
        changes.rowChanges.push({ type: 'delete', rowId: row.id });
      }
    }

    // 修改的行
    for (const row of this.currentData.rows) {
      if (originalRowIds.has(row.id)) {
        const originalRow = this.originalSnapshot.rows.find(r => r.id === row.id);
        if (originalRow && !this.isRowEqual(originalRow, row)) {
          changes.rowChanges.push({ type: 'modify', rowId: row.id, data: row });
        }
      }
    }

    return changes;
  }

  /**
   * 比较两列是否相等
   */
  private isColumnEqual(a: TableColumn, b: TableColumn): boolean {
    return a.name === b.name && 
           a.type === b.type && 
           a.width === b.width;
  }

  /**
   * 比较两行是否相等
   */
  private isRowEqual(a: TableRow, b: TableRow): boolean {
    // 比较 parentId
    if (a.parentId !== b.parentId) return false;
    
    // 比较 expanded
    if (a.expanded !== b.expanded) return false;
    
    const aKeys = Object.keys(a.cells);
    const bKeys = Object.keys(b.cells);
    
    if (aKeys.length !== bKeys.length) return false;
    
    for (const key of aKeys) {
      if (!this.isCellValueEqual(a.cells[key], b.cells[key])) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * 比较两个单元格值是否相等
   */
  private isCellValueEqual(a: CellValue, b: CellValue): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }

  /**
   * 检查是否有未保存的变更
   */
  hasChanges(): boolean {
    const changes = this.calculateChanges();
    return changes.nameChanged || 
           changes.columnChanges.length > 0 || 
           changes.rowChanges.length > 0;
  }

  /**
   * 获取变更摘要
   */
  getChangesSummary(): { added: number; modified: number; deleted: number } {
    const changes = this.calculateChanges();
    
    let added = 0;
    let modified = 0;
    let deleted = 0;

    for (const change of changes.rowChanges) {
      if (change.type === 'add') added++;
      else if (change.type === 'modify') modified++;
      else if (change.type === 'delete') deleted++;
    }

    return { added, modified, deleted };
  }

  /**
   * 保存变更到数据库
   * @returns 是否保存成功
   */
  async save(): Promise<boolean> {
    if (!this.formId || !this.currentData) {
      console.warn('[TableDataService] 无法保存：未初始化或无数据');
      return false;
    }

    const changes = this.calculateChanges();
    
    // 如果没有变更，直接返回成功
    if (!changes.nameChanged && 
        changes.columnChanges.length === 0 && 
        changes.rowChanges.length === 0) {
      console.log('[TableDataService] 无变更，跳过保存');
      return true;
    }

    try {
      // 构建更新数据
      const updateData: { name?: string; data?: string } = {};
      
      if (changes.nameChanged && changes.newName) {
        updateData.name = changes.newName;
      }

      // 如果有列或行变更，需要保存完整的数据
      // 因为数据库存储的是 JSON 字符串，无法增量更新
      if (changes.columnChanges.length > 0 || changes.rowChanges.length > 0) {
        updateData.data = JSON.stringify({
          columns: this.currentData.columns,
          rows: this.currentData.rows,
        });
      }

      const result = await window.electron?.form?.updateForm(this.formId, updateData);
      
      if (result?.success) {
        // 更新原始快照
        this.originalSnapshot = JSON.parse(JSON.stringify(this.currentData));
        
        const summary = this.getChangesSummary();
        console.log('[TableDataService] 保存成功:', {
          formId: this.formId,
          nameChanged: changes.nameChanged,
          rowsAdded: summary.added,
          rowsModified: summary.modified,
          rowsDeleted: summary.deleted,
        });
        
        return true;
      }
      
      console.error('[TableDataService] 保存失败:', result);
      return false;
    } catch (error) {
      console.error('[TableDataService] 保存出错:', error);
      return false;
    }
  }

  /**
   * 重置变更（放弃未保存的修改）
   */
  reset(): void {
    if (this.originalSnapshot) {
      this.currentData = JSON.parse(JSON.stringify(this.originalSnapshot));
    }
  }

  /**
   * 获取当前数据
   */
  getCurrentData(): TableDataSnapshot | null {
    return this.currentData;
  }

  /**
   * 获取表单ID
   */
  getFormId(): string | null {
    return this.formId;
  }

  /**
   * 是否已加载数据
   */
  isDataLoaded(): boolean {
    return this.isLoaded;
  }

  /**
   * 清理服务状态
   */
  dispose(): void {
    this.formId = null;
    this.originalSnapshot = null;
    this.currentData = null;
    this.isLoaded = false;
  }
}

// 表格数据服务实例缓存
const serviceInstances = new Map<string, TableDataService>();

/**
 * 获取表格数据服务实例
 * @param formId 表单ID
 * @returns 表格数据服务实例
 */
export function getTableDataService(formId: string): TableDataService {
  let service = serviceInstances.get(formId);
  
  if (!service) {
    service = new TableDataService();
    serviceInstances.set(formId, service);
  }
  
  return service;
}

/**
 * 移除表格数据服务实例
 * @param formId 表单ID
 */
export function removeTableDataService(formId: string): void {
  const service = serviceInstances.get(formId);
  if (service) {
    service.dispose();
    serviceInstances.delete(formId);
  }
}

/**
 * 保存并移除表格数据服务实例
 * @param formId 表单ID
 * @returns 是否保存成功
 */
export async function saveAndRemoveTableDataService(formId: string): Promise<boolean> {
  const service = serviceInstances.get(formId);
  
  if (service) {
    const success = await service.save();
    service.dispose();
    serviceInstances.delete(formId);
    return success;
  }
  
  return true;
}
