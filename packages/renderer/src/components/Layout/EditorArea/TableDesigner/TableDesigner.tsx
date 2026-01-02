/**
 * 表格设计器组件
 * 功能：提供表格设计、编辑、AI生成功能
 * 描述：支持创建和编辑表格，可将结果插入到编辑器中
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Icon } from '../../../Icons/Icon';
import { AIInputBar } from '../../../common/AIInputBar';
import { ContextMenu, type ContextMenuItem } from '../../../Explorer/Common/ContextMenu';
import { CellToolbar } from './CellToolbar';
import { TranslatePanel } from './TranslatePanel';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '../../../common/AlertDialog/AlertDialog';
import { getOllamaTranslateService } from '../../../../services/translate';
import type {
  TableColumn,
  TableRow,
  TableConfig,
  ColumnType,
  CellValue,
} from './types';
import { COLUMN_TYPES } from './types';
import './TableDesigner.scss';

interface TableDesignerProps {
  initialConfig?: TableConfig;
  onInsert?: (config: TableConfig) => void;
}

/** 生成唯一ID */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/** 创建默认列 */
const createDefaultColumn = (index: number): TableColumn => ({
  id: generateId(),
  name: `列 ${index + 1}`,
  type: 'text',
  width: 150,
});

/** 创建默认行 */
const createDefaultRow = (columns: TableColumn[]): TableRow => {
  const cells: Record<string, CellValue> = {};
  columns.forEach(col => {
    cells[col.id] = col.type === 'checkbox' ? false : '';
  });
  return { id: generateId(), cells };
};

export const TableDesigner: React.FC<TableDesignerProps> = ({
  initialConfig,
  onInsert,
}) => {
  // 表格设计器状态
  const [name, setName] = useState(initialConfig?.name || '未命名表格');
  const [columns, setColumns] = useState<TableColumn[]>(
    initialConfig?.columns || [createDefaultColumn(0), createDefaultColumn(1)]
  );
  const [rows, setRows] = useState<TableRow[]>(
    initialConfig?.rows || [createDefaultRow(columns)]
  );
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{ columnId: string; position: { x: number; y: number } } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [cellToolbar, setCellToolbar] = useState<{ rowId: string; colId: string; position: { x: number; y: number } } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [dataViewerFormat, setDataViewerFormat] = useState<'text' | 'json' | 'xml'>('json');
  const [dataViewerWordWrap, setDataViewerWordWrap] = useState(true);
  const [dataViewerAutoFormat, setDataViewerAutoFormat] = useState(true);
  const [dataViewerEncoding, setDataViewerEncoding] = useState<string>('utf-8');
  const [showDataViewerSettings, setShowDataViewerSettings] = useState(false);
  const [showModelDownloadDialog, setShowModelDownloadDialog] = useState(false);
  const [pendingTranslateValue, setPendingTranslateValue] = useState<string>('');
  const [showTranslatePanel, setShowTranslatePanel] = useState(false);
  const [translatePanelPosition, setTranslatePanelPosition] = useState({ x: 0, y: 0 });
  const [translateInitialText, setTranslateInitialText] = useState('');
  const dataViewerSettingsRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [extendLineStyle, setExtendLineStyle] = useState({ top: 0, bottom: 0, left: 0 });

  // 列宽拖动状态
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // 计算延伸线位置
  useEffect(() => {
    const updateExtendLinePosition = () => {
      if (!tableRef.current || !tableContainerRef.current || !tableWrapperRef.current) return;
      
      const tableRect = tableRef.current.getBoundingClientRect();
      const scrollLeft = tableWrapperRef.current.scrollLeft;
      const scrollTop = tableWrapperRef.current.scrollTop;
      
      // 计算表格右边界相对于 wrapper 的位置
      const tableRightInWrapper = tableRect.width + 12 - scrollLeft; // 12 是 padding
      
      // 获取添加行的位置（表格底部）- 考虑滚动偏移
      const addRowTr = tableRef.current.querySelector('.add-row-tr');
      const tableHeight = tableRef.current.offsetHeight;
      const addRowBottom = addRowTr 
        ? 12 + tableHeight - scrollTop // padding + 表格高度 - 滚动偏移
        : 12 + tableHeight - scrollTop;
      
      setExtendLineStyle({
        top: 12 - scrollTop, // padding - 滚动偏移
        bottom: addRowBottom,
        left: tableRightInWrapper,
      });
    };

    // 使用 requestAnimationFrame 确保 DOM 渲染完成
    const rafId = requestAnimationFrame(updateExtendLinePosition);
    
    // 监听滚动和窗口大小变化
    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('scroll', updateExtendLinePosition);
    window.addEventListener('resize', updateExtendLinePosition);
    
    return () => {
      cancelAnimationFrame(rafId);
      wrapper?.removeEventListener('scroll', updateExtendLinePosition);
      window.removeEventListener('resize', updateExtendLinePosition);
    };
  }, [columns, rows]);

  // 点击外部关闭数据查看器设置菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dataViewerSettingsRef.current && !dataViewerSettingsRef.current.contains(event.target as Node)) {
        setShowDataViewerSettings(false);
      }
    };
    if (showDataViewerSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDataViewerSettings]);

  // 点击表格外部取消单元格选中
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedCell(null);
        setCellToolbar(null);
      }
    };
    if (selectedCell) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [selectedCell]);


  // 开始拖动调整列宽
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

  // 监听鼠标移动和释放事件
  useEffect(() => {
    if (!resizingColumn) return;

    const handleResizeMove = (event: MouseEvent) => {
      const delta = event.clientX - resizeStartX.current;
      const newWidth = Math.max(80, resizeStartWidth.current + delta);
      setColumns(prev =>
        prev.map(col => (col.id === resizingColumn ? { ...col, width: newWidth } : col))
      );
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
  }, [resizingColumn]);

  // 添加列
  const handleAddColumn = useCallback(() => {
    const newColumn = createDefaultColumn(columns.length);
    setColumns(prev => [...prev, newColumn]);
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: '' },
    })));
    // 滚动到最后一列
    setTimeout(() => {
      if (tableWrapperRef.current) {
        tableWrapperRef.current.scrollLeft = tableWrapperRef.current.scrollWidth;
      }
    }, 0);
  }, [columns.length]);

  // 向左插入列
  const handleInsertColumnLeft = useCallback((columnId: string) => {
    const index = columns.findIndex(c => c.id === columnId);
    if (index === -1) return;
    const newColumn = createDefaultColumn(columns.length);
    setColumns(prev => {
      const newColumns = [...prev];
      newColumns.splice(index, 0, newColumn);
      return newColumns;
    });
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: '' },
    })));
  }, [columns]);

  // 向右插入列
  const handleInsertColumnRight = useCallback((columnId: string) => {
    const index = columns.findIndex(c => c.id === columnId);
    if (index === -1) return;
    const newColumn = createDefaultColumn(columns.length);
    setColumns(prev => {
      const newColumns = [...prev];
      newColumns.splice(index + 1, 0, newColumn);
      return newColumns;
    });
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: '' },
    })));
  }, [columns]);

  // 复制列
  const handleDuplicateColumn = useCallback((columnId: string) => {
    const index = columns.findIndex(c => c.id === columnId);
    if (index === -1) return;
    const sourceColumn = columns[index];
    const newColumn: TableColumn = {
      ...sourceColumn,
      id: generateId(),
      name: `${sourceColumn.name} 副本`,
    };
    setColumns(prev => {
      const newColumns = [...prev];
      newColumns.splice(index + 1, 0, newColumn);
      return newColumns;
    });
    setRows(prev => prev.map(row => ({
      ...row,
      cells: { ...row.cells, [newColumn.id]: row.cells[columnId] },
    })));
  }, [columns]);

  // 删除列
  const handleDeleteColumn = useCallback((columnId: string) => {
    if (columns.length <= 1) return;
    setColumns(prev => prev.filter(col => col.id !== columnId));
    setRows(prev => prev.map(row => {
      const newCells = { ...row.cells };
      delete newCells[columnId];
      return { ...row, cells: newCells };
    }));
  }, [columns.length]);

  // 更新列名
  const handleUpdateColumnName = useCallback((columnId: string, newName: string) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, name: newName } : col
    ));
  }, []);

  // 更新列类型
  const handleUpdateColumnType = useCallback((columnId: string, newType: ColumnType) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, type: newType } : col
    ));
    setRows(prev => prev.map(row => ({
      ...row,
      cells: {
        ...row.cells,
        [columnId]: newType === 'checkbox' ? false : '',
      },
    })));
  }, []);

  // 添加行
  const handleAddRow = useCallback(() => {
    const newRow = createDefaultRow(columns);
    setRows(prev => [...prev, newRow]);
    
    // 自动聚焦到新行的第一个可编辑列，并滚动到底部
    setTimeout(() => {
      const firstEditableCol = columns.find(col => col.type !== 'checkbox');
      if (firstEditableCol) {
        setEditingCell({ rowId: newRow.id, colId: firstEditableCol.id });
        setSelectedCell({ rowId: newRow.id, colId: firstEditableCol.id });
      }
      // 滚动到底部
      if (tableWrapperRef.current) {
        tableWrapperRef.current.scrollTop = tableWrapperRef.current.scrollHeight;
      }
    }, 0);
  }, [columns]);

  // 删除行
  const handleDeleteRow = useCallback((rowId: string) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter(row => row.id !== rowId));
    // 同时从选中行中移除
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.delete(rowId);
      return next;
    });
  }, [rows.length]);

  // 切换行选中状态
  const handleToggleRowSelect = useCallback((rowId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  // 全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    if (selectedRows.size === rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(rows.map(r => r.id)));
    }
  }, [rows, selectedRows.size]);

  // 更新单元格值
  const handleUpdateCell = useCallback((rowId: string, colId: string, value: CellValue) => {
    setRows(prev => prev.map(row =>
      row.id === rowId
        ? { ...row, cells: { ...row.cells, [colId]: value } }
        : row
    ));
  }, []);

  // AI 生成表格数据处理
  const handleAIGenerate = useCallback((content: string) => {
    try {
      let jsonContent = content.trim();
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      const data = JSON.parse(jsonContent) as {
        columns: Array<{ name: string; type: string }>;
        rows: Array<Record<string, CellValue>>;
      };

      if (data.columns && Array.isArray(data.columns)) {
        const newColumns: TableColumn[] = data.columns.map((col, index) => ({
          id: generateId(),
          name: col.name || `列 ${index + 1}`,
          type: (col.type as ColumnType) || 'text',
          width: 150,
        }));

        const newRows: TableRow[] = [];
        if (data.rows && Array.isArray(data.rows)) {
          data.rows.forEach((rowData) => {
            const row: TableRow = {
              id: generateId(),
              cells: {},
            };
            newColumns.forEach((col, colIndex) => {
              const originalColName = data.columns[colIndex]?.name;
              if (originalColName && rowData[originalColName] !== undefined) {
                row.cells[col.id] = rowData[originalColName];
              } else {
                row.cells[col.id] = '';
              }
            });
            newRows.push(row);
          });
        }

        if (newRows.length === 0) {
          newRows.push(createDefaultRow(newColumns));
        }

        setColumns(newColumns);
        setRows(newRows);
        console.log('[TableDesigner] AI 生成表格成功:', { columns: newColumns.length, rows: newRows.length });
      }
    } catch (error) {
      console.error('[TableDesigner] AI 生成表格解析失败:', error);
    }
  }, []);


  // 格式化数据为指定格式
  const formatCellValue = useCallback((value: CellValue, format: 'text' | 'json' | 'xml'): string => {
    if (value === null || value === undefined) return '';
    
    const strValue = typeof value === 'boolean' 
      ? (value ? 'true' : 'false')
      : Array.isArray(value) 
        ? value.join(', ')
        : String(value);
    
    if (format === 'json') {
      try {
        const parsed = JSON.parse(strValue);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return strValue;
      }
    }
    
    if (format === 'xml') {
      try {
        let formatted = strValue;
        let indent = 0;
        formatted = formatted.replace(/></g, '>\n<');
        const lines = formatted.split('\n');
        const result: string[] = [];
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('</')) {
            indent = Math.max(0, indent - 1);
          }
          result.push('  '.repeat(indent) + trimmed);
          if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</')) {
            indent++;
          }
        }
        return result.join('\n');
      } catch {
        return strValue;
      }
    }
    
    return strValue;
  }, []);

  // 获取选中单元格的值
  const getSelectedCellValue = useCallback((): CellValue => {
    if (!selectedCell) return null;
    const row = rows.find(r => r.id === selectedCell.rowId);
    if (!row) return null;
    return row.cells[selectedCell.colId];
  }, [selectedCell, rows]);

  // 获取选中单元格的列名
  const getSelectedCellColumnName = useCallback((): string => {
    if (!selectedCell) return '';
    const column = columns.find(c => c.id === selectedCell.colId);
    return column?.name || '';
  }, [selectedCell, columns]);

  // 生成 Markdown 表格
  const generateMarkdown = useCallback((): string => {
    if (columns.length === 0 || rows.length === 0) return '';
    const lines: string[] = [];
    const headerCells = columns.map(col => col.name);
    lines.push(`| ${headerCells.join(' | ')} |`);
    const separators = columns.map(() => '---');
    lines.push(`| ${separators.join(' | ')} |`);
    rows.forEach(row => {
      const rowCells = columns.map(col => {
        const value = row.cells[col.id];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? '[x]' : '[ ]';
        if (Array.isArray(value)) return value.join(', ');
        return String(value);
      });
      lines.push(`| ${rowCells.join(' | ')} |`);
    });
    return lines.join('\n');
  }, [columns, rows]);

  // 插入到编辑器
  const handleInsert = useCallback(() => {
    const config: TableConfig = {
      id: initialConfig?.id || generateId(),
      name,
      columns,
      rows,
      createdAt: initialConfig?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    if (onInsert) {
      onInsert(config);
    }
    const markdown = generateMarkdown();
    console.log('[TableDesigner] 生成的Markdown:\n', markdown);
    window.dispatchEvent(new CustomEvent('insert-database-table', {
      detail: { markdown, config, focusEditor: true },
    }));
  }, [name, columns, rows, initialConfig, onInsert, generateMarkdown]);

  // 获取列类型图标
  const getColumnTypeIcon = (type: ColumnType): string => {
    const typeInfo = COLUMN_TYPES.find(t => t.type === type);
    return typeInfo?.icon || 'text';
  };

  // 关闭列菜单（提前定义，供 TitleInput 使用）
  const handleCloseColumnMenu = useCallback(() => {
    setColumnMenu(null);
  }, []);

  // 标题输入组件
  const TitleInput: React.FC<{ columnId: string; currentName: string }> = ({ columnId, currentName }) => {
    const [value, setValue] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
    };

    const handleBlur = () => {
      if (value.trim() && value.trim() !== currentName) {
        handleUpdateColumnName(columnId, value.trim());
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        if (value.trim() && value.trim() !== currentName) {
          handleUpdateColumnName(columnId, value.trim());
        }
        handleCloseColumnMenu();
      }
      // 阻止 ESC 键冒泡，让菜单处理返回逻辑
      if (e.key === 'Escape') {
        e.stopPropagation();
      }
    };

    return (
      <input
        ref={inputRef}
        type="text"
        className="explorer-context-menu-input"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="输入字段标题"
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  // 生成列菜单项
  const buildColumnMenuItems = useCallback((columnId: string): ContextMenuItem[] => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return [];

    // 字段类型子菜单
    const typeSubmenu: ContextMenuItem[] = COLUMN_TYPES.map(typeInfo => ({
      id: `type-${typeInfo.type}`,
      label: typeInfo.label,
      icon: typeInfo.icon,
      selected: column.type === typeInfo.type,
      onClick: () => handleUpdateColumnType(columnId, typeInfo.type),
    }));

    return [
      {
        id: 'modify-field',
        label: '修改字段',
        icon: 'edit',
        submenu: [
          {
            id: 'title-label',
            label: '标题',
            disabled: true,
          },
          {
            id: 'title-input',
            label: '',
            customOnly: true,
            customContent: <TitleInput columnId={columnId} currentName={column.name} />,
          },
          { id: 'sep-title', label: '', separator: true },
          {
            id: 'field-type',
            label: '字段类型',
            submenu: typeSubmenu,
            submenuType: 'hover',
          },
        ],
      },
      {
        id: 'edit-description',
        label: '编辑字段描述',
        icon: 'info-circle',
        onClick: () => {
          // TODO: 实现字段描述编辑
          console.log('编辑字段描述:', columnId);
        },
      },
      {
        id: 'fill-color',
        label: '整列填色',
        icon: 'paint-bucket',
        onClick: () => {
          // TODO: 实现整列填色
          console.log('整列填色:', columnId);
        },
      },
      { id: 'sep-1', label: '', separator: true },
      {
        id: 'duplicate-field',
        label: '复制字段',
        icon: 'copy',
        onClick: () => handleDuplicateColumn(columnId),
      },
      {
        id: 'hide-field',
        label: '隐藏字段',
        icon: 'eye-off',
        onClick: () => {
          // TODO: 实现隐藏字段
          console.log('隐藏字段:', columnId);
        },
      },
      { id: 'sep-2', label: '', separator: true },
      {
        id: 'insert-left',
        label: '向左插入字段',
        icon: 'arrow-left',
        onClick: () => handleInsertColumnLeft(columnId),
      },
      {
        id: 'insert-right',
        label: '向右插入字段',
        icon: 'arrow-right',
        onClick: () => handleInsertColumnRight(columnId),
      },
      { id: 'sep-3', label: '', separator: true },
      {
        id: 'delete-field',
        label: '删除字段',
        icon: 'delete',
        disabled: columns.length <= 1,
        onClick: () => handleDeleteColumn(columnId),
      },
    ];
  }, [columns, handleUpdateColumnType, handleUpdateColumnName, handleDuplicateColumn, handleInsertColumnLeft, handleInsertColumnRight, handleDeleteColumn, handleCloseColumnMenu]);

  // 打开列菜单
  const handleOpenColumnMenu = useCallback((columnId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // 获取列头元素的位置，让菜单左边与列头左边对齐
    const thElement = (event.currentTarget as HTMLElement).closest('th');
    const rect = thElement?.getBoundingClientRect();
    setColumnMenu({
      columnId,
      position: { 
        x: rect?.left ?? event.clientX, 
        y: rect?.bottom ?? event.clientY 
      },
    });
  }, []);

  // 渲染单元格
  const renderCell = (row: TableRow, column: TableColumn) => {
    const value = row.cells[column.id];
    const isEditing = editingCell?.rowId === row.id && editingCell?.colId === column.id;

    const handleKeyNavigation = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const currentColIndex = columns.findIndex(c => c.id === column.id);
      const currentRowIndex = rows.findIndex(r => r.id === row.id);
      const isLastColumn = currentColIndex === columns.length - 1 || 
        columns.slice(currentColIndex + 1).every(c => c.type === 'checkbox');
      const isLastRow = currentRowIndex === rows.length - 1;

      if (e.key === 'Tab') {
        e.preventDefault();
        
        if (e.shiftKey) {
          if (currentColIndex > 0) {
            let prevColIndex = currentColIndex - 1;
            while (prevColIndex >= 0 && columns[prevColIndex].type === 'checkbox') {
              prevColIndex--;
            }
            if (prevColIndex >= 0) {
              setEditingCell({ rowId: row.id, colId: columns[prevColIndex].id });
            }
          } else if (currentRowIndex > 0) {
            let lastColIndex = columns.length - 1;
            while (lastColIndex >= 0 && columns[lastColIndex].type === 'checkbox') {
              lastColIndex--;
            }
            if (lastColIndex >= 0) {
              setEditingCell({ rowId: rows[currentRowIndex - 1].id, colId: columns[lastColIndex].id });
            }
          }
        } else {
          if (!isLastColumn) {
            let nextColIndex = currentColIndex + 1;
            while (nextColIndex < columns.length && columns[nextColIndex].type === 'checkbox') {
              nextColIndex++;
            }
            if (nextColIndex < columns.length) {
              setEditingCell({ rowId: row.id, colId: columns[nextColIndex].id });
            }
          } else if (currentRowIndex < rows.length - 1) {
            let firstColIndex = 0;
            while (firstColIndex < columns.length && columns[firstColIndex].type === 'checkbox') {
              firstColIndex++;
            }
            if (firstColIndex < columns.length) {
              setEditingCell({ rowId: rows[currentRowIndex + 1].id, colId: columns[firstColIndex].id });
            }
          }
        }
      } else if (e.key === 'Enter') {
        if (isLastColumn && isLastRow) {
          const newRow = createDefaultRow(columns);
          setRows(prev => [...prev, newRow]);
          let firstColIndex = 0;
          while (firstColIndex < columns.length && columns[firstColIndex].type === 'checkbox') {
            firstColIndex++;
          }
          if (firstColIndex < columns.length) {
            setTimeout(() => {
              setEditingCell({ rowId: newRow.id, colId: columns[firstColIndex].id });
            }, 0);
          }
        } else {
          setEditingCell(null);
        }
      } else if (e.key === 'Escape') {
        setEditingCell(null);
      }
    };

    if (column.type === 'checkbox') {
      return (
        <span
          className={`cell-checkbox ${value ? 'checked' : ''}`}
          onClick={() => handleUpdateCell(row.id, column.id, !value)}
        >
          {value && <Icon name="check" size={14} />}
        </span>
      );
    }

    // 单选类型不支持内联编辑
    if (column.type === 'select') {
      return (
        <input
          type="text"
          className="cell-input"
          value={String(value || '')}
          readOnly
        />
      );
    }

    // 统一使用 input，编辑时可编辑，非编辑时只读
    return (
      <input
        type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
        className={`cell-input ${isEditing ? 'editing' : ''}`}
        value={String(value || '')}
        readOnly={!isEditing}
        autoFocus={isEditing}
        onChange={(e) => {
          const newValue = column.type === 'number' 
            ? (e.target.value ? Number(e.target.value) : '')
            : e.target.value;
          handleUpdateCell(row.id, column.id, newValue);
        }}
        onBlur={() => setEditingCell(null)}
        onKeyDown={isEditing ? handleKeyNavigation : undefined}
      />
    );
  };

  // 处理单元格单击 - 选中单元格并显示工具栏
  const handleCellClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    const column = columns.find(c => c.id === colId);
    if (column?.type === 'checkbox') return;
    
    const colIndex = columns.findIndex(c => c.id === colId);
    const cellElement = event.currentTarget;
    
    // 如果不是第一列，检查是否被固定列遮挡
    if (colIndex > 0 && tableWrapperRef.current) {
      const cellRect = cellElement.getBoundingClientRect();
      const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
      // 固定列宽度：row-selector-cell(56px) + first-data-column(第一列宽度)
      const firstColumnWidth = columns[0]?.width || 150;
      const stickyWidth = 56 + firstColumnWidth;
      const stickyRight = wrapperRect.left + stickyWidth;
      
      // 如果单元格左边界在固定列右边界之前，说明被遮挡了
      if (cellRect.left < stickyRight) {
        // 计算需要滚动的距离，让单元格完整显示
        const scrollOffset = stickyRight - cellRect.left + 4; // 4px 额外间距
        tableWrapperRef.current.scrollLeft -= scrollOffset;
      }
    }
    
    setSelectedCell({ rowId, colId });
    setCellToolbar({
      rowId,
      colId,
      position: {
        x: event.currentTarget.getBoundingClientRect().left,
        y: event.currentTarget.getBoundingClientRect().top,
      },
    });
  }, [columns]);

  // 处理单元格双击 - 进入编辑模式
  const handleCellDoubleClick = useCallback((rowId: string, colId: string) => {
    const column = columns.find(c => c.id === colId);
    if (column?.type === 'checkbox' || column?.type === 'select') return;
    
    setSelectedCell({ rowId, colId });
    setEditingCell({ rowId, colId });
    setCellToolbar(null);
  }, [columns]);

  // 关闭单元格工具栏
  const handleCloseCellToolbar = useCallback(() => {
    setCellToolbar(null);
  }, []);

  // 获取单元格值
  const getCellValue = useCallback((rowId: string, colId: string): string => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return '';
    const value = row.cells[colId];
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }, [rows]);

  // AI 工具栏回调
  const handleCellFill = useCallback((value: string) => {
    console.log('[TableDesigner] 填充:', value);
  }, []);

  const handleCellPolish = useCallback((value: string) => {
    console.log('[TableDesigner] 润色:', value);
  }, []);

  // 打开翻译面板
  const handleCellTranslate = useCallback((value: string) => {
    if (!selectedCell || !cellToolbar) return;
    
    // 设置翻译面板位置（在单元格工具栏右侧）
    setTranslatePanelPosition({
      x: cellToolbar.position.x + 200,
      y: cellToolbar.position.y - 40,
    });
    setTranslateInitialText(value);
    setShowTranslatePanel(true);
    setCellToolbar(null); // 关闭单元格工具栏
  }, [selectedCell, cellToolbar]);

  // 应用翻译结果
  const handleApplyTranslation = useCallback((translatedText: string) => {
    if (selectedCell) {
      handleUpdateCell(selectedCell.rowId, selectedCell.colId, translatedText);
    }
  }, [selectedCell, handleUpdateCell]);

  // 处理模型下载确认
  const handleConfirmModelDownload = useCallback(() => {
    const translateService = getOllamaTranslateService();
    const pullCommand = translateService.getPullModelCommand();
    
    // 先打开终端面板
    window.dispatchEvent(new CustomEvent('open-panel', {
      detail: { view: 'terminal' }
    }));
    
    // 延迟执行命令，确保终端面板已打开并初始化
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('terminal:execute-command', {
        detail: { command: pullCommand }
      }));
    }, 500);
    
    setShowModelDownloadDialog(false);
    setPendingTranslateValue('');
  }, []);

  const handleCellSummarize = useCallback((value: string) => {
    console.log('[TableDesigner] 总结:', value);
  }, []);

  const handleCellExtract = useCallback((value: string) => {
    console.log('[TableDesigner] 信息提取:', value);
  }, []);

  const handleCellSmartTag = useCallback((value: string) => {
    console.log('[TableDesigner] 智能标签:', value);
  }, []);

  const handleCellQuickAsk = useCallback((value: string) => {
    console.log('[TableDesigner] 快速提问:', value);
  }, []);

  // 数据查看 - 切换数据查看器面板显示状态
  const handleCellViewData = useCallback(() => {
    setShowDataViewer(prev => !prev);
    setCellToolbar(null);
  }, []);


  return (
    <div className="table-designer">
      {/* 头部 */}
      <div className="table-designer-header">
        <div className="header-left">
          <input
            type="text"
            className="table-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="表格名称"
          />
        </div>
        <div className="header-actions">
          <span 
            className={`action-btn ${showDataViewer ? 'active' : ''}`}
            onClick={() => setShowDataViewer(!showDataViewer)} 
            title={showDataViewer ? '隐藏数据查看器' : '显示数据查看器'}
          >
            <Icon name="eye" size={16} />
          </span>
          <span className="action-btn" onClick={handleInsert} title="插入到编辑器">
            <Icon name="check" size={16} />
            <span>插入</span>
          </span>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="table-designer-body">
        <div className="table-designer-content">
          <div className="table-container" ref={tableContainerRef}>
            {/* 顶部延伸线 */}
            <div 
              className="table-extend-line top-line" 
              style={{ 
                top: extendLineStyle.top, 
                left: extendLineStyle.left,
              }} 
            />
            {/* 底部延伸线 */}
            <div 
              className="table-extend-line bottom-line" 
              style={{ 
                top: extendLineStyle.bottom, 
                left: extendLineStyle.left,
              }} 
            />
            <div className="table-wrapper" ref={tableWrapperRef}>
              <table ref={tableRef} className="design-table" style={{ width: columns.reduce((sum, col) => sum + (col.width || 150), 0) + 56 + 40 }}>
                <colgroup>
                  <col style={{ width: 56 }} />
                  {columns.map((column) => (
                    <col key={column.id} style={{ width: column.width }} />
                  ))}
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr className="header-row">
                    <th className="row-selector-cell">
                    <span 
                      className={`row-checkbox ${selectedRows.size === rows.length && rows.length > 0 ? 'checked' : ''}`}
                      onClick={handleToggleSelectAll}
                    >
                      {selectedRows.size === rows.length && rows.length > 0 && <Icon name="check" size={12} />}
                    </span>
                  </th>
                  {columns.map((column, colIndex) => (
                    <th 
                      key={column.id} 
                      className={`${columnMenu?.columnId === column.id ? 'column-selected' : ''} ${colIndex === 0 ? 'first-data-column' : ''}`}
                      onContextMenu={(e) => handleOpenColumnMenu(column.id, e)}
                    >
                      <div className="column-header" onClick={(e) => handleOpenColumnMenu(column.id, e)}>
                        <span className="column-type-icon">
                          <Icon name={getColumnTypeIcon(column.type)} size={14} />
                        </span>
                        <span className="column-name">
                          {column.name}
                        </span>
                        <span className="column-menu-icon">
                          <Icon name="chevron-down" size={12} />
                        </span>
                      </div>
                      <span
                        className={`column-resize-handle ${resizingColumn === column.id ? 'resizing' : ''}`}
                        onMouseDown={(e) => handleResizeStart(column.id, e)}
                      />
                    </th>
                  ))}
                  <th className="add-column-cell">
                    <span className="add-column-btn" onClick={handleAddColumn} title="添加列">
                      <Icon name="plus" size={16} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className={selectedRows.has(row.id) ? 'row-selected' : ''}>
                    <td className="row-selector-cell">
                      <span className="row-drag-handle">
                        <Icon name="grip-vertical" size={12} />
                      </span>
                      <span className="row-number">{rowIndex + 1}</span>
                      <span 
                        className={`row-checkbox ${selectedRows.has(row.id) ? 'checked' : ''}`}
                        onClick={() => handleToggleRowSelect(row.id)}
                      >
                        {selectedRows.has(row.id) && <Icon name="check" size={12} />}
                      </span>
                    </td>
                    {columns.map((column, colIndex) => (
                      <td 
                        key={column.id}
                        className={`${selectedCell?.rowId === row.id && selectedCell?.colId === column.id ? 'selected-cell' : ''} ${colIndex === 0 ? 'first-data-column' : ''}`}
                        onClick={(e) => handleCellClick(row.id, column.id, e)}
                        onDoubleClick={() => handleCellDoubleClick(row.id, column.id)}
                      >
                        {renderCell(row, column)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="add-row-tr">
                  <td className="row-selector-cell">
                    <span className="add-row-btn" onClick={handleAddRow} title="添加行">
                      <Icon name="plus" size={14} />
                    </span>
                  </td>
                  <td colSpan={columns.length} className="add-row-cell" />
                  <td className="add-row-placeholder-cell" />
                </tr>
              </tbody>
            </table>
            </div>
          </div>
          {/* AI 输入栏 */}
          <AIInputBar
            placeholder="描述您想要生成的表格内容..."
            systemPrompt={`你是一个表格数据生成助手。用户会描述他们想要的表格内容，你需要生成符合要求的表格数据。
请以 JSON 格式返回数据，格式如下：
{
  "columns": [
    { "name": "列名1", "type": "text" },
    { "name": "列名2", "type": "number" }
  ],
  "rows": [
    { "列名1": "值1", "列名2": 123 },
    { "列名1": "值2", "列名2": 456 }
  ]
}
支持的列类型：text（文本）、number（数字）、checkbox（复选框）、date（日期）、url（链接）、email（邮箱）、select（选择）
只返回 JSON 数据，不要添加任何解释或 markdown 代码块标记。`}
            onGenerate={handleAIGenerate}
          />
        </div>


        {/* 数据查看器面板 */}
        {showDataViewer && (
          <div className="data-viewer-panel">
            <div className="data-viewer-header">
              <span className="data-viewer-title">数据查看器</span>
              <span 
                className="data-viewer-close"
                onClick={() => setShowDataViewer(false)}
                title="关闭"
              >
                <Icon name="close" size={14} />
              </span>
            </div>
            <div className="data-viewer-content">
              {selectedCell ? (
                <>
                  <div className="data-viewer-cell-info">
                    <span className="cell-column-name">{getSelectedCellColumnName()}</span>
                  </div>
                  <div className="data-viewer-toolbar">
                    <div className="toolbar-group format-menu-group" ref={dataViewerSettingsRef}>
                      <span 
                        className={`format-menu-trigger ${showDataViewerSettings ? 'active' : ''}`}
                        onClick={() => setShowDataViewerSettings(!showDataViewerSettings)}
                      >
                        <span className="format-label">
                          {dataViewerFormat === 'text' ? 'Text' : dataViewerFormat === 'json' ? 'JSON' : 'XML'}
                        </span>
                        <Icon name="chevron-down" size={12} />
                      </span>
                      {showDataViewerSettings && (
                        <div className="format-menu">
                          <div className="format-menu-section">
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'text' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('text'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'text' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">Text</span>
                            </div>
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'json' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('json'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'json' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">JSON</span>
                            </div>
                            <div 
                              className={`format-menu-item ${dataViewerFormat === 'xml' ? 'selected' : ''}`}
                              onClick={() => { setDataViewerFormat('xml'); setShowDataViewerSettings(false); }}
                            >
                              <span className="item-check">{dataViewerFormat === 'xml' && <Icon name="check" size={12} />}</span>
                              <span className="item-label">XML</span>
                            </div>
                          </div>
                          <div className="format-menu-divider" />
                          <div className="format-menu-section">
                            <div 
                              className="format-menu-item"
                              onClick={() => setDataViewerWordWrap(!dataViewerWordWrap)}
                            >
                              <span className="item-check">{dataViewerWordWrap && <Icon name="check" size={12} />}</span>
                              <span className="item-label">自动换行</span>
                            </div>
                            <div 
                              className="format-menu-item"
                              onClick={() => setDataViewerAutoFormat(!dataViewerAutoFormat)}
                            >
                              <span className="item-check">{dataViewerAutoFormat && <Icon name="check" size={12} />}</span>
                              <span className="item-label">自动格式化</span>
                            </div>
                          </div>
                          <div className="format-menu-divider" />
                          <div className="format-menu-section encoding-section">
                            <div className="section-title">编码</div>
                            {['utf-8', 'gbk', 'gb2312', 'iso-8859-1', 'ascii'].map((enc) => (
                              <div 
                                key={enc}
                                className={`format-menu-item ${dataViewerEncoding === enc ? 'selected' : ''}`}
                                onClick={() => { setDataViewerEncoding(enc); setShowDataViewerSettings(false); }}
                              >
                                <span className="item-check">{dataViewerEncoding === enc && <Icon name="check" size={12} />}</span>
                                <span className="item-label">{enc.toUpperCase()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`data-viewer-value ${dataViewerWordWrap ? 'word-wrap' : ''}`}>
                    <pre>{dataViewerAutoFormat ? formatCellValue(getSelectedCellValue(), dataViewerFormat) : String(getSelectedCellValue() ?? '')}</pre>
                  </div>
                </>
              ) : (
                <div className="data-viewer-empty">
                  <Icon name="table-properties" size={32} />
                  <p>选择单元格查看数据</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 列菜单 */}
      {columnMenu && (
        <ContextMenu
          items={buildColumnMenuItems(columnMenu.columnId)}
          position={columnMenu.position}
          onClose={handleCloseColumnMenu}
        />
      )}

      {/* 单元格工具栏 */}
      {cellToolbar && (
        <CellToolbar
          position={cellToolbar.position}
          cellValue={getCellValue(cellToolbar.rowId, cellToolbar.colId)}
          onClose={handleCloseCellToolbar}
          onFill={handleCellFill}
          onPolish={handleCellPolish}
          onTranslate={handleCellTranslate}
          onViewData={handleCellViewData}
          onSummarize={handleCellSummarize}
          onExtract={handleCellExtract}
          onSmartTag={handleCellSmartTag}
          onQuickAsk={handleCellQuickAsk}
        />
      )}

      {/* 模型下载确认对话框 */}
      <AlertDialog open={showModelDownloadDialog} onOpenChange={setShowModelDownloadDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>下载翻译模型</AlertDialogTitle>
            <AlertDialogDescription>
              检测到本地未安装翻译模型，是否在终端中下载？
              下载完成后可重新点击翻译按钮进行翻译。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmModelDownload}>下载</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 翻译面板 */}
      <TranslatePanel
        visible={showTranslatePanel}
        initialText={translateInitialText}
        position={translatePanelPosition}
        onClose={() => setShowTranslatePanel(false)}
        onApply={handleApplyTranslation}
      />
    </div>
  );
};

export default TableDesigner;
