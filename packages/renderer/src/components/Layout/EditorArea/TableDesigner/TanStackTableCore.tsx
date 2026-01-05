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
import { HierarchyTableManager, type FlattenedRow } from './HierarchyTableManager';
import type { TableColumn, TableRow, CellValue, ColumnType } from './types';

interface TanStackTableCoreProps {
  columns: TableColumn[];
  rows: TableRow[];
  selectedRows: Set<string>;
  selectedCell: { rowId: string; colId: string } | null;
  editingCell: { rowId: string; colId: string } | null;
  isGenerating?: boolean;
  onRowsChange: (rows: TableRow[]) => void;
  onSelectedRowsChange: (selectedRows: Set<string>) => void;
  onSelectedCellChange: (cell: { rowId: string; colId: string } | null) => void;
  onEditingCellChange: (cell: { rowId: string; colId: string } | null) => void;
  onCellUpdate: (rowId: string, colId: string, value: CellValue) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onColumnMenuOpen: (columnId: string, position: { x: number; y: number }) => void;
  onCellContextMenu: (rowId: string, colId: string, position: { x: number; y: number }) => void;
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
  onRowsChange,
  onSelectedRowsChange,
  onSelectedCellChange,
  onEditingCellChange,
  onAddRow,
  onAddColumn,
  onColumnMenuOpen,
  onCellContextMenu,
  onAddChildRow,
  onToggleRowExpanded,
  onColumnWidthChange,
  renderCellContent,
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  
  // 拖动选择状态
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const dragStartRowIndex = useRef<number>(-1);
  
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

  // 计算扁平化的层级行数据
  const flattenedRows = useMemo(() => {
    return HierarchyTableManager.flattenRows(rows);
  }, [rows]);

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
    event.preventDefault();
    event.stopPropagation();
    const column = columns.find(c => c.id === columnId);
    if (column) {
      setResizingColumn(columnId);
      resizeStartX.current = event.clientX;
      resizeStartWidth.current = column.width || 150;
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

  // 拖动选择开始
  const handleRowDragSelectStart = useCallback((flatIndex: number, event: React.MouseEvent) => {
    if (event.button !== 0) return;
    if (editingCell) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) return;
    
    event.preventDefault();
    setIsDraggingSelect(true);
    dragStartRowIndex.current = flatIndex;
    
    const rowId = flattenedRows[flatIndex]?.row.id;
    if (rowId) {
      onSelectedRowsChange(new Set([rowId]));
    }
  }, [flattenedRows, editingCell, onSelectedRowsChange]);

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


  // 拖动选择监听
  useEffect(() => {
    if (!isDraggingSelect) return;

    const handleMouseMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      const tbody = tableRef.current.querySelector('tbody');
      if (!tbody) return;
      const allRows = Array.from(tbody.querySelectorAll('tr:not(.add-row-tr)'));
      const rowIndex = allRows.indexOf(tr);
      if (rowIndex >= 0) {
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
  }, [isDraggingSelect, updateDragSelection]);

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
        const fromRow = currentFlattenedRows[fromFlatIndex]?.row;
        const toRow = currentFlattenedRows[toFlatIndex]?.row;
        
        if (fromRow && toRow) {
          const fromOriginalIndex = rows.findIndex(r => r.id === fromRow.id);
          const toOriginalIndex = rows.findIndex(r => r.id === toRow.id);
          
          if (fromOriginalIndex !== -1 && toOriginalIndex !== -1) {
            const newRows = [...rows];
            const [movedRow] = newRows.splice(fromOriginalIndex, 1);
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
  const handleCellClick = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onSelectedCellChange({ rowId, colId });
  }, [onSelectedCellChange]);

  // 单元格双击
  const handleCellDoubleClick = useCallback((rowId: string, colId: string) => {
    const column = columns.find(c => c.id === colId);
    if (column?.type !== 'checkbox') {
      onEditingCellChange({ rowId, colId });
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
          <span 
            className={`row-checkbox ${selectedRows.size === rows.length && rows.length > 0 ? 'checked' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleToggleSelectAll(); }}
          >
            {selectedRows.size === rows.length && rows.length > 0 && <Icon name="check" size={12} />}
          </span>
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
            <span 
              className={`row-checkbox ${selectedRows.has(dataRow.id) ? 'checked' : ''}`}
              onClick={(e) => { e.stopPropagation(); handleToggleRowSelect(dataRow.id); }}
            >
              {selectedRows.has(dataRow.id) && <Icon name="check" size={12} />}
            </span>
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
            return (
              <div className="cell-hierarchy-wrapper" style={{ paddingLeft: 12 }}>
                <div className="cell-content-wrapper">
                  {renderCellContent(dataRow, col, isEditing)}
                </div>
              </div>
            );
          } else if (hasChildren) {
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
      cell: () => null,
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
    return classes.join(' ');
  };

  // 获取行样式（拖拽指示线）
  const getRowStyle = (flatIndex: number): React.CSSProperties => {
    if (!isDraggingRow || dropTargetIndex === -1 || dragRowIndex === -1) return {};
    if (flatIndex === dropTargetIndex && flatIndex !== dragRowIndex) {
      if (dropTargetIndex < dragRowIndex) {
        return { boxShadow: 'inset 0 2px 0 0 var(--ws-focus-border)' };
      } else {
        return { boxShadow: 'inset 0 -2px 0 0 var(--ws-focus-border)' };
      }
    }
    return {};
  };

  // 获取单元格类名
  const getCellClassName = (colId: string, rowId: string, colIndex: number) => {
    const classes: string[] = [];
    if (colId === 'selector') {
      classes.push('row-selector-cell');
    } else if (colId === 'add-column') {
      classes.push('add-column-cell');
    } else {
      if (colIndex === 1) classes.push('first-data-column');
      if (selectedCell?.rowId === rowId && selectedCell?.colId === colId) {
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
                
                return (
                  <th
                    key={header.id}
                    className={`${isSelector ? 'row-selector-cell' : ''} ${isAddColumn ? 'add-column-cell' : ''} ${headerIndex === 1 ? 'first-data-column' : ''}`}
                    style={{ width: header.getSize() }}
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
            return (
              <tr
                key={row.id}
                className={getRowClassName(flatRow, rowIndex)}
                style={getRowStyle(rowIndex)}
                onMouseDown={(e) => handleRowDragSelectStart(rowIndex, e)}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const colId = cell.column.id;
                  const isSelector = colId === 'selector';
                  const isAddColumn = colId === 'add-column';
                  const column = columns.find(c => c.id === colId);
                  
                  return (
                    <td
                      key={cell.id}
                      className={getCellClassName(colId, flatRow.row.id, cellIndex)}
                      style={{ width: cell.column.getSize() }}
                      onClick={!isSelector && !isAddColumn && column ? (e) => handleCellClick(flatRow.row.id, colId, e) : undefined}
                      onDoubleClick={!isSelector && !isAddColumn && column ? () => handleCellDoubleClick(flatRow.row.id, colId) : undefined}
                      onContextMenu={!isSelector && !isAddColumn && column ? (e) => handleCellRightClick(flatRow.row.id, colId, e) : undefined}
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
    </div>
  );
};
