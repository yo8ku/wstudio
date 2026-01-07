/**
 * TanStack Table 核心组件
 * 功能：基于 @tanstack/react-table 的可编辑表格组件
 * 描述：支持单元格编辑、行选择、行拖拽排序、列宽调整、层级行等功能
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { Icon } from '../../../Icons/Icon';
import { Checkbox } from '../../../common/Checkbox';
import { HierarchyTableManager, type FlattenedRow } from './HierarchyTableManager';
import type { TableColumn, TableRow, CellValue, ColumnType } from './types';

interface TanStackTableCoreProps {
  columns: TableColumn[];
  rows: TableRow[];
  selectedRows: Set<string>;
  selectedCell: { rowId: string; colId: string } | null;
  editingCell: { rowId: string; colId: string } | null;
  isGenerating?: boolean;
  tableWrapperRef?: React.RefObject<HTMLDivElement>;
  tableRef?: React.RefObject<HTMLTableElement>;
  // 单元格区域选择
  selectedCellRange?: {
    startRowId: string;
    startColId: string;
    endRowId: string;
    endColId: string;
  } | null;
  onSelectedCellRangeChange?: (range: {
    startRowId: string;
    startColId: string;
    endRowId: string;
    endColId: string;
  } | null) => void;
  onRowsChange: (rows: TableRow[]) => void;
  onSelectedRowsChange: (selectedRows: Set<string>) => void;
  onSelectedCellChange: (cell: { rowId: string; colId: string } | null) => void;
  onEditingCellChange: (cell: { rowId: string; colId: string } | null, event?: React.MouseEvent<HTMLTableCellElement>) => void;
  onCellUpdate: (rowId: string, colId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onColumnMenuOpen: (columnId: string, position: { x: number; y: number }) => void;
  onCellContextMenu: (rowId: string, colId: string, position: { x: number; y: number }) => void;
  onCellClick?: (rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => void;
  onAddChildRow: (parentId: string) => void;
  onToggleRowExpanded: (rowId: string) => void;
  onColumnWidthChange: (columnId: string, width: number) => void;
  renderCellContent: (row: TableRow, column: TableColumn, isEditing: boolean) => React.ReactNode;
}

/** 获取列类型对应的图标名称 */
const getColumnTypeIcon = (type: ColumnType): string => {
  const iconMap: Record<ColumnType, string> = {
    text: 'type-icon',
    number: 'number-hash',
    date: 'calendar-date',
    time: 'clock',
    checkbox: 'checkbox-select',
    select: 'radio-select',
    multiselect: 'list-checks',
    tag: 'tag',
    url: 'link-2',
    email: 'at-sign',
  };
  return iconMap[type] || 'type-icon';
};


export const TanStackTableCore: React.FC<TanStackTableCoreProps> = ({
  columns,
  rows,
  selectedRows,
  selectedCell,
  editingCell,
  isGenerating = false,
  tableWrapperRef: externalTableWrapperRef,
  tableRef: externalTableRef,
  selectedCellRange,
  onSelectedCellRangeChange,
  onRowsChange,
  onSelectedRowsChange,
  onSelectedCellChange,
  onEditingCellChange,
  onAddRow,
  onAddColumn,
  onColumnMenuOpen,
  onCellContextMenu,
  onCellClick,
  onAddChildRow,
  onToggleRowExpanded,
  onColumnWidthChange,
  renderCellContent,
}) => {
  const internalTableRef = useRef<HTMLTableElement>(null);
  const tableRef = externalTableRef || internalTableRef;
  const internalTableWrapperRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = externalTableWrapperRef || internalTableWrapperRef;
  
  // 拖动选择行状态
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const dragStartRowIndex = useRef<number>(-1);
  
  // 拖动选择单元格区域状态
  const [isDraggingCellSelect, setIsDraggingCellSelect] = useState(false);
  const cellDragStartRef = useRef<{ rowId: string; colId: string } | null>(null);
  
  // 拖动行排序状态
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const [dragRowIndex, setDragRowIndex] = useState<number>(-1);
  const [dropTargetIndex, setDropTargetIndex] = useState<number>(-1);
  const dragRowIndexRef = useRef<number>(-1);
  const dropTargetIndexRef = useRef<number>(-1);
  
  // 列宽拖动状态
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);
  
  // 是否需要固定列
  const [needStickyColumn, setNeedStickyColumn] = useState(false);
  
  // 选中区域覆盖层位置
  const [selectionOverlay, setSelectionOverlay] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  // 计算扁平化的层级行数据
  const flattenedRows = useMemo(() => {
    return HierarchyTableManager.flattenRows(rows);
  }, [rows]);

  // 判断单元格是否在选中区域内（用于清空内容时）
  const isCellInRange = useCallback((rowId: string, colId: string): boolean => {
    if (!selectedCellRange) return false;
    
    const { startRowId, startColId, endRowId, endColId } = selectedCellRange;
    
    // 使用 flattenedRows 获取行索引范围（因为表格显示的是扁平化后的数据）
    const startRowIndex = flattenedRows.findIndex(fr => fr.row.id === startRowId);
    const endRowIndex = flattenedRows.findIndex(fr => fr.row.id === endRowId);
    const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === rowId);
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    
    // 获取列索引范围
    const startColIndex = columns.findIndex(c => c.id === startColId);
    const endColIndex = columns.findIndex(c => c.id === endColId);
    const currentColIndex = columns.findIndex(c => c.id === colId);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);
    
    return currentRowIndex >= minRowIndex && currentRowIndex <= maxRowIndex &&
           currentColIndex >= minColIndex && currentColIndex <= maxColIndex;
  }, [selectedCellRange, flattenedRows, columns]);

  // 计算选中区域覆盖层位置
  useEffect(() => {
    if (!selectedCellRange || !tableRef.current || !tableWrapperRef.current) {
      setSelectionOverlay(null);
      return;
    }
    
    const { startRowId, startColId, endRowId, endColId } = selectedCellRange;
    
    // 找到起始和结束单元格的 DOM 元素
    const startCell = tableRef.current.querySelector(`td[data-row-id="${startRowId}"][data-col-id="${startColId}"]`);
    const endCell = tableRef.current.querySelector(`td[data-row-id="${endRowId}"][data-col-id="${endColId}"]`);
    
    if (!startCell || !endCell) {
      setSelectionOverlay(null);
      return;
    }
    
    const startRect = startCell.getBoundingClientRect();
    const endRect = endCell.getBoundingClientRect();
    const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
    
    // 计算选中区域的边界（相对于 wrapper，考虑滚动偏移）
    const scrollLeft = tableWrapperRef.current.scrollLeft;
    const scrollTop = tableWrapperRef.current.scrollTop;
    
    const minLeft = Math.min(startRect.left, endRect.left) - wrapperRect.left + scrollLeft;
    const minTop = Math.min(startRect.top, endRect.top) - wrapperRect.top + scrollTop;
    const maxRight = Math.max(startRect.right, endRect.right) - wrapperRect.left + scrollLeft;
    const maxBottom = Math.max(startRect.bottom, endRect.bottom) - wrapperRect.top + scrollTop;
    
    setSelectionOverlay({
      top: minTop,
      left: minLeft,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    });
  }, [selectedCellRange]);

  // 检测是否需要固定列
  useEffect(() => {
    const checkNeedStickyColumn = () => {
      if (!tableWrapperRef.current) return;
      const wrapper = tableWrapperRef.current;
      const hasHorizontalScroll = wrapper.scrollWidth > wrapper.clientWidth;
      const hasScrolled = wrapper.scrollLeft > 0;
      setNeedStickyColumn(hasHorizontalScroll && hasScrolled);
    };

    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('scroll', checkNeedStickyColumn);
    window.addEventListener('resize', checkNeedStickyColumn);
    checkNeedStickyColumn();

    return () => {
      wrapper?.removeEventListener('scroll', checkNeedStickyColumn);
      window.removeEventListener('resize', checkNeedStickyColumn);
    };
  }, [columns]);

  // 列宽拖动处理
  const handleResizeStart = useCallback((columnId: string, event: React.MouseEvent) => {
    console.log('[handleResizeStart] columnId:', columnId);
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find(c => c.id === columnId);
    if (column) {
      setResizingColumn(columnId);
      resizeStartX.current = event.clientX;
      resizeStartWidth.current = column.width || 150;
      console.log('[handleResizeStart] started, width:', column.width);
    }
  }, [columns]);

  useEffect(() => {
    if (!resizingColumn) return;

    const handleResizeMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX.current;
      const newWidth = Math.max(80, resizeStartWidth.current + delta);
      onColumnWidthChange(resizingColumn, newWidth);
    };

    const handleResizeEnd = () => {
      console.log('[handleResizeEnd] ended');
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizingColumn, onColumnWidthChange]);

  // 行选择处理
  const handleToggleRowSelect = useCallback((rowId: string) => {
    const next = new Set(selectedRows);
    if (next.has(rowId)) {
      next.delete(rowId);
    } else {
      next.add(rowId);
    }
    onSelectedRowsChange(next);
  }, [selectedRows, onSelectedRowsChange]);

  // 全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      onSelectedRowsChange(new Set());
    } else {
      onSelectedRowsChange(new Set(rows.map(r => r.id)));
    }
  }, [rows, selectedRows.size, onSelectedRowsChange]);

  // 拖动选择开始 - 只记录起始位置，不更新状态
  const handleRowDragSelectStart = useCallback((flatIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (editingCell) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) return;
    
    // 检查是否点击的是行号列（selector）
    const td = target.closest('td');
    if (!td || !td.classList.contains('row-selector-cell')) {
      // 不是行号列，不触发行选择
      return;
    }
    
    // 只记录起始位置，不更新状态（避免重新渲染影响双击事件）
    dragStartRowIndex.current = flatIndex;
    // 清空单元格区域选择
    onSelectedCellRangeChange?.(null);
  }, [editingCell, onSelectedCellRangeChange]);

  // 单元格拖动选择开始
  const handleCellDragSelectStart = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (editingCell) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) return;
    
    // 只记录起始单元格，不立即设置 selectedCellRange
    // 等到真正拖拽移动到不同单元格时才设置
    cellDragStartRef.current = { rowId, colId };
    // 清空行选择
    onSelectedRowsChange(new Set());
  }, [editingCell, onSelectedRowsChange]);

  // 单元格拖动选择移动
  const updateCellDragSelection = useCallback((rowId: string, colId: string) => {
    if (!cellDragStartRef.current) return;
    
    const startCell = cellDragStartRef.current;
    // 只有当拖拽到不同单元格时才设置选中区域
    if (startCell.rowId === rowId && startCell.colId === colId) {
      // 还在同一个单元格，不设置区域选择
      return;
    }
    
    // 清空单个单元格选择（拖拽选择和单击选择互斥）
    onSelectedCellChange(null);
    
    onSelectedCellRangeChange?.({
      startRowId: startCell.rowId,
      startColId: startCell.colId,
      endRowId: rowId,
      endColId: colId,
    });
  }, [onSelectedCellRangeChange, onSelectedCellChange]);

  // 单元格拖动选择监听
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!cellDragStartRef.current) return;
      
      const target = event.target as HTMLElement;
      const td = target.closest('td');
      if (!td || !tableRef.current?.contains(td)) return;
      
      const rowId = td.getAttribute('data-row-id');
      const colId = td.getAttribute('data-col-id');
      if (!rowId || !colId || colId === 'selector' || colId === 'add-column') return;
      
      setIsDraggingCellSelect(true);
      updateCellDragSelection(rowId, colId);
    };

    const handleMouseUp = () => {
      setIsDraggingCellSelect(false);
      cellDragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateCellDragSelection]);

  // 拖动选择移动
  const updateDragSelection = useCallback((flatIndex: number) => {
    if (dragStartRowIndex.current === -1) return;
    const startIndex = Math.min(dragStartRowIndex.current, flatIndex);
    const endIndex = Math.max(dragStartRowIndex.current, flatIndex);
    const selectedIds = new Set<string>();
    for (let i = startIndex; i <= endIndex; i++) {
      if (flattenedRows[i]) {
        selectedIds.add(flattenedRows[i].row.id);
      }
    }
    onSelectedRowsChange(selectedIds);
  }, [flattenedRows, onSelectedRowsChange]);


  // 拖动选择监听 - 使用 dragStartRowIndex 而不是 isDraggingSelect
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // 只有当 dragStartRowIndex 有效时才处理
      if (dragStartRowIndex.current === -1) return;
      
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      const tbody = tableRef.current.querySelector('tbody');
      if (!tbody) return;
      const allRows = Array.from(tbody.querySelectorAll('tr:not(.add-row-tr)'));
      const rowIndex = allRows.indexOf(tr);
      if (rowIndex >= 0 && rowIndex !== dragStartRowIndex.current) {
        // 只有当移动到不同行时才更新选择
        setIsDraggingSelect(true);
        updateDragSelection(rowIndex);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSelect(false);
      dragStartRowIndex.current = -1;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [updateDragSelection]);

  // 行拖拽排序开始
  const handleRowDragStart = useCallback((flatIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingRow(true);
    setDragRowIndex(flatIndex);
    setDropTargetIndex(flatIndex);
    dragRowIndexRef.current = flatIndex;
    dropTargetIndexRef.current = flatIndex;
  }, []);

  // 行拖拽排序监听
  useEffect(() => {
    if (!isDraggingRow) return;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      const tbody = tableRef.current.querySelector('tbody');
      if (!tbody) return;
      const allRows = Array.from(tbody.querySelectorAll('tr:not(.add-row-tr)'));
      const flatIndex = allRows.indexOf(tr);
      if (flatIndex >= 0 && flatIndex !== dropTargetIndexRef.current) {
        dropTargetIndexRef.current = flatIndex;
        setDropTargetIndex(flatIndex);
      }
    };

    const handleMouseUp = () => {
      const fromFlatIndex = dragRowIndexRef.current;
      const toFlatIndex = dropTargetIndexRef.current;
      if (fromFlatIndex !== -1 && toFlatIndex !== -1 && fromFlatIndex !== toFlatIndex) {
        const currentFlattenedRows = HierarchyTableManager.flattenRows(rows);
        const fromFlatRow = currentFlattenedRows[fromFlatIndex];
        const toFlatRow = currentFlattenedRows[toFlatIndex];
        
        if (fromFlatRow && toFlatRow) {
          const fromRow = fromFlatRow.row;
          const toRow = toFlatRow.row;
          const fromOriginalIndex = rows.findIndex(r => r.id === fromRow.id);
          const toOriginalIndex = rows.findIndex(r => r.id === toRow.id);
          
          if (fromOriginalIndex !== -1 && toOriginalIndex !== -1) {
            const newRows = [...rows];
            const [movedRow] = newRows.splice(fromOriginalIndex, 1);
            
            // 如果目标行是子记录，将被拖拽的行也变成同一父行的子记录
            if (toRow.parentId) {
              movedRow.parentId = toRow.parentId;
            } else {
              // 如果目标行不是子记录，清除被拖拽行的父行关系
              delete movedRow.parentId;
            }
            
            const adjustedToIndex = toOriginalIndex > fromOriginalIndex ? toOriginalIndex : toOriginalIndex;
            newRows.splice(adjustedToIndex, 0, movedRow);
            onRowsChange(newRows);
          }
        }
      }
      setIsDraggingRow(false);
      setDragRowIndex(-1);
      setDropTargetIndex(-1);
      dragRowIndexRef.current = -1;
      dropTargetIndexRef.current = -1;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRow, rows, onRowsChange]);

  // 单元格点击
  const handleCellClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    event.stopPropagation();
    // 清空单元格区域选择（单击选中和拖拽选中互斥）
    onSelectedCellRangeChange?.(null);
    onSelectedCellChange({ rowId, colId });
    // 调用外部的 onCellClick 回调（用于显示工具栏）
    onCellClick?.(rowId, colId, event);
  }, [onSelectedCellChange, onSelectedCellRangeChange, onCellClick]);

  // 单元格双击
  const handleCellDoubleClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    console.log('[TanStackTableCore] handleCellDoubleClick called, rowId:', rowId, 'colId:', colId);
    const column = columns.find(c => c.id === colId);
    if (column?.type !== 'checkbox') {
      onEditingCellChange({ rowId, colId }, event);
    }
  }, [columns, onEditingCellChange]);

  // 单元格右键菜单
  const handleCellRightClick = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onCellContextMenu(rowId, colId, { x: event.clientX, y: event.clientY });
  }, [onCellContextMenu]);

  // 列头点击
  const handleColumnHeaderClick = useCallback((columnId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onColumnMenuOpen(columnId, { x: event.clientX, y: event.clientY });
  }, [onColumnMenuOpen]);


  // 构建 TanStack Table 列定义
  const tableColumns = useMemo<ColumnDef<FlattenedRow>[]>(() => {
    // 选择器列
    const selectorColumn: ColumnDef<FlattenedRow> = {
      id: 'selector',
      size: 56,
      minSize: 56,
      maxSize: 56,
      header: () => (
        <div className="row-selector-cell header-cell">
          <span className="row-drag-handle" style={{ visibility: 'hidden' }}>
            <Icon name="grip-vertical" size={12} />
          </span>
          <Checkbox
            checked={selectedRows.size === rows.length && rows.length > 0}
            indeterminate={selectedRows.size > 0 && selectedRows.size < rows.length}
            onChange={handleToggleSelectAll}
            className="row-checkbox"
          />
        </div>
      ),
      cell: ({ row }) => {
        const flatRow = row.original;
        const { row: dataRow, depth, hasChildren, expanded: isExpanded, flatIndex } = flatRow;
        const topLevelIndex = depth === 0 
          ? flattenedRows.slice(0, flatIndex + 1).filter(r => r.depth === 0).length
          : 0;
        
        return (
          <div className={`row-selector-cell ${hasChildren ? 'has-children' : ''} ${depth > 0 ? 'child-row-cell' : ''}`}>
            <span 
              className="row-drag-handle"
              onMouseDown={(e) => handleRowDragStart(flatIndex, e)}
            >
              <Icon name="grip-vertical" size={12} />
            </span>
            {depth === 0 && (
              <span className="row-number">{topLevelIndex}</span>
            )}
            {hasChildren && (
              <span 
                className="hierarchy-toggle"
                onClick={(e) => { e.stopPropagation(); onToggleRowExpanded(dataRow.id); }}
              >
                <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
              </span>
            )}
            <Checkbox
              checked={selectedRows.has(dataRow.id)}
              onChange={() => handleToggleRowSelect(dataRow.id)}
              className="row-checkbox"
            />
          </div>
        );
      },
    };

    // 数据列
    const dataColumns: ColumnDef<FlattenedRow>[] = columns.map((col, colIndex) => ({
      id: col.id,
      accessorFn: (flatRow: FlattenedRow) => flatRow.row.cells[col.id],
      size: col.width || 150,
      minSize: 80,
      header: () => (
        <div 
          className="column-header"
          onClick={(e) => handleColumnHeaderClick(col.id, e)}
        >
          <span className="column-type-icon">
            <Icon name={getColumnTypeIcon(col.type)} size={14} />
          </span>
          <span className="column-name">{col.name}</span>
          <span className="column-menu-icon">
            <Icon name="chevron-down" size={12} />
          </span>
        </div>
      ),
      cell: ({ row }) => {
        const flatRow = row.original;
        const { row: dataRow, depth, hasChildren } = flatRow;
        const isEditing = editingCell?.rowId === dataRow.id && editingCell?.colId === col.id;
        const childCount = colIndex === 0 && hasChildren 
          ? HierarchyTableManager.getDirectChildren(rows, dataRow.id).length 
          : 0;

        // 第一列特殊处理
        if (colIndex === 0) {
          if (depth > 0) {
            // 子记录使用padding-left缩进（通过 wrapper 的 padding）
            return (
              <div className="cell-hierarchy-wrapper child-row-indent">
                <div className="cell-content-wrapper">
                  {renderCellContent(dataRow, col, isEditing)}
                </div>
              </div>
            );
          } else if (hasChildren) {
            // 有子记录时显示添加子记录按钮和计数
            return (
              <div className="cell-with-children">
                <div className="cell-content-wrapper">
                  {renderCellContent(dataRow, col, isEditing)}
                </div>
                <span 
                  className="add-child-btn"
                  onClick={(e) => { e.stopPropagation(); onAddChildRow(dataRow.id); }}
                  title="添加子记录"
                >
                  <Icon name="plus" size={12} />
                </span>
                <span className="child-count-badge">{childCount}</span>
              </div>
            );
          }
          // 普通行（无子记录）直接渲染
        }

        return renderCellContent(dataRow, col, isEditing);
      },
    }));

    // 添加列按钮列
    const addColumnCol: ColumnDef<FlattenedRow> = {
      id: 'add-column',
      size: 40,
      minSize: 40,
      maxSize: 40,
      header: () => (
        <div className="add-column-cell">
          <span 
            className={`add-column-btn ${isGenerating ? 'disabled' : ''}`}
            onClick={isGenerating ? undefined : onAddColumn}
            title="添加列"
          >
            <Icon name="plus" size={14} />
          </span>
        </div>
      ),
      cell: () => <div className="add-column-cell" />,
    };

    return [selectorColumn, ...dataColumns, addColumnCol];
  }, [
    columns, rows, flattenedRows, selectedRows, editingCell, isGenerating,
    handleToggleSelectAll, handleToggleRowSelect, handleRowDragStart,
    handleColumnHeaderClick, onToggleRowExpanded, onAddChildRow, onAddColumn, renderCellContent
  ]);


  // 创建 TanStack Table 实例
  const table = useReactTable({
    data: flattenedRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  });

  // 获取表格类名
  const getTableClassName = () => {
    const classes = ['design-table'];
    if (needStickyColumn) classes.push('sticky-enabled');
    if (isDraggingRow) classes.push('row-reordering');
    return classes.join(' ');
  };

  // 获取行类名
  const getRowClassName = (flatRow: FlattenedRow, flatIndex: number) => {
    const classes: string[] = [];
    if (selectedRows.has(flatRow.row.id)) classes.push('row-selected');
    if (flatRow.depth > 0) classes.push('child-row');
    if (isDraggingRow && dragRowIndex === flatIndex) classes.push('row-dragging');
    // 编辑状态的行
    if (editingCell?.rowId === flatRow.row.id) classes.push('row-editing');
    // 选中单元格所在的行
    if (selectedCell?.rowId === flatRow.row.id) classes.push('row-cell-selected');
    return classes.join(' ');
  };

  // 获取行样式
  const getRowStyle = (_flatIndex: number): React.CSSProperties => {
    return {};
  };

  // 判断是否显示拖拽指示线
  const shouldShowDropIndicator = (flatIndex: number): 'top' | 'bottom' | null => {
    if (!isDraggingRow || dropTargetIndex === -1 || dragRowIndex === -1) return null;
    if (flatIndex === dropTargetIndex && flatIndex !== dragRowIndex) {
      return dropTargetIndex < dragRowIndex ? 'top' : 'bottom';
    }
    return null;
  };

  // 获取单元格类名
  const getCellClassName = (colId: string, rowId: string, colIndex: number) => {
    const classes: string[] = [];
    if (colId === 'selector') {
      classes.push('row-selector-cell');
    } else if (colId === 'add-column') {
      classes.push('add-column-cell');
    } else {
      // 第一数据列是索引1（selector=0, first-data=1）
      if (colIndex === 1) classes.push('first-data-column');
      const isEditing = editingCell?.rowId === rowId && editingCell?.colId === colId;
      // 编辑状态添加类名
      if (isEditing) {
        classes.push('editing-cell');
      }
      // 选中状态（编辑状态下不显示选中边框）
      if (selectedCell?.rowId === rowId && selectedCell?.colId === colId && !isEditing) {
        classes.push('selected-cell');
      }
    }
    return classes.join(' ');
  };

  return (
    <div className="table-wrapper" ref={tableWrapperRef}>
      <table className={getTableClassName()} ref={tableRef}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id} className="header-row">
              {headerGroup.headers.map((header, headerIndex) => {
                const isSelector = header.id === 'selector';
                const isAddColumn = header.id === 'add-column';
                const column = columns.find(c => c.id === header.id);
                // 使用columns中的宽度，而不是TanStack Table的getSize()
                const headerWidth = isSelector ? 56 : isAddColumn ? 40 : (column?.width || 150);
                // 第一数据列是索引1（selector=0, first-data=1）
                const isFirstDataColumn = headerIndex === 1;
                
                return (
                  <th
                    key={header.id}
                    className={`${isSelector ? 'row-selector-cell' : ''} ${isAddColumn ? 'add-column-cell' : ''} ${isFirstDataColumn ? 'first-data-column' : ''}`}
                    style={{ width: `${headerWidth}px`, minWidth: `${headerWidth}px`, maxWidth: `${headerWidth}px` }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {column && (
                      <div
                        className={`column-resize-handle ${resizingColumn === column.id ? 'resizing' : ''}`}
                        onMouseDown={(e) => handleResizeStart(column.id, e)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => {
            const flatRow = row.original;
            const dropIndicator = shouldShowDropIndicator(rowIndex);
            return (
              <tr
                key={row.id}
                className={`${getRowClassName(flatRow, rowIndex)} ${dropIndicator ? 'drop-target-' + dropIndicator : ''}`}
                style={getRowStyle(rowIndex)}
                onMouseDown={(e) => handleRowDragSelectStart(rowIndex, e)}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const colId = cell.column.id;
                  const isSelector = colId === 'selector';
                  const isAddColumn = colId === 'add-column';
                  const column = columns.find(c => c.id === colId);
                  const canInteract = !isSelector && !isAddColumn && column;
                  // 使用columns中的宽度，而不是TanStack Table的getSize()
                  const cellWidth = isSelector ? 56 : isAddColumn ? 40 : (column?.width || 150);
                  
                  return (
                    <td
                      key={cell.id}
                      className={getCellClassName(colId, flatRow.row.id, cellIndex)}
                      style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, maxWidth: `${cellWidth}px` }}
                      data-row-id={flatRow.row.id}
                      data-col-id={colId}
                      onMouseDown={canInteract ? (e) => {
                        e.stopPropagation(); // 阻止冒泡到 tr 的行选择
                        handleCellDragSelectStart(flatRow.row.id, colId, e);
                      } : undefined}
                      onClick={(e) => {
                        if (canInteract) {
                          // 检测双击：如果在 300ms 内连续点击同一个单元格
                          const now = Date.now();
                          const lastClick = (e.currentTarget as HTMLElement).dataset.lastClick;
                          const lastClickTime = lastClick ? parseInt(lastClick, 10) : 0;
                          (e.currentTarget as HTMLElement).dataset.lastClick = String(now);
                          
                          if (now - lastClickTime < 300) {
                            // 双击
                            console.log('[TD double click detected] colId:', colId);
                            handleCellDoubleClick(flatRow.row.id, colId, e);
                          } else {
                            // 单击
                            handleCellClick(flatRow.row.id, colId, e);
                          }
                        }
                      }}
                      onContextMenu={canInteract ? (e) => handleCellRightClick(flatRow.row.id, colId, e) : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* 添加行 */}
          <tr className="add-row-tr">
            <td className="row-selector-cell">
              <span 
                className={`add-row-btn ${isGenerating ? 'disabled' : ''}`}
                onClick={isGenerating ? undefined : onAddRow}
                title="添加行"
              >
                <Icon name="plus" size={14} />
              </span>
            </td>
            {columns.map((col, colIndex) => (
              <td 
                key={col.id} 
                className={`add-row-cell ${colIndex === 0 ? 'first-data-column' : ''}`}
                style={{ width: col.width || 150 }}
              />
            ))}
            <td className="add-row-placeholder-cell" />
          </tr>
        </tbody>
      </table>
      {/* 选中区域覆盖层 */}
      {selectionOverlay && (
        <div 
          className="cell-selection-overlay"
          style={{
            top: selectionOverlay.top,
            left: selectionOverlay.left,
            width: selectionOverlay.width,
            height: selectionOverlay.height,
          }}
        />
      )}
    </div>
  );
};
