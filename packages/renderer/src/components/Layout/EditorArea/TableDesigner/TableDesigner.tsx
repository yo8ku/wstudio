/**
 * 表格设计器组件
 * 功能：提供表格设计、编辑、AI生成功能
 * 描述：支持创建和编辑表格，可将结果插入到编辑器中
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
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
import { getTableDesignerSystemPrompt } from '../../../../services/ai/SystemPrompt';
import { aiService } from '../../../../services/ai/AIService';
import { getCachedModels, getModelConfig } from '../../../../services/ModelCacheService';
import { isModelEnabled } from '../../../../services/ai';
import { TableOperations, type QueryCondition } from './TableOperations';
import { QueryConditionPanel, type FillColorScope } from './QueryConditionPanel';
import { BatchTableGenerator } from './BatchTableGenerator';
import { HierarchyTableManager } from './HierarchyTableManager';
import { TanStackTableCore } from './TanStackTableCore';
import { FloatingCellEditor } from './FloatingCellEditor';
import { TableToolbar, type RowHeightType } from './TableToolbar';
import { getTableImportService } from '../../../../services/tableImport';
import { notification } from '../../../../stores/notificationStore';
import type {
  TableColumn,
  TableRow,
  TableConfig,
  ColumnType,
  CellValue,
} from './types';
import { COLUMN_TYPES } from './types';
import { getTableDataService } from '../../../../services/tableData';
import { translate } from '../../../../i18n';
import './TableDesigner.scss';

interface TableDesignerProps {
  initialConfig?: TableConfig;
  formId?: string;
}

/** 生成唯一ID */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

/** 创建默认列 */
const createDefaultColumn = (index: number): TableColumn => ({
  id: generateId(),
  name: translate('tableDesigner.defaults.columnPrefix', { defaultValue: 'Column' }) + ` ${index + 1}`,
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
  formId,
}) => {
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string, values?: Record<string, string>): string =>
    String(t(key, values ? { defaultValue, ...values } : { defaultValue }));
  // 表格数据服务
  const tableDataServiceRef = useRef(formId ? getTableDataService(formId) : null);
  const [isDataLoading, setIsDataLoading] = useState(!!formId);
  
  // 表格设计器状态
  const [name, setName] = useState(
    initialConfig?.name || translate('tableDesigner.defaults.untitledTable', { defaultValue: 'Untitled Table' })
  );
  const [columns, setColumns] = useState<TableColumn[]>(
    initialConfig?.columns || [createDefaultColumn(0), createDefaultColumn(1)]
  );
  const [rows, setRows] = useState<TableRow[]>(
    initialConfig?.rows || [createDefaultRow(columns)]
  );
  const [editingCell, setEditingCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [floatingEditorPosition, setFloatingEditorPosition] = useState({ top: 0, left: 0, width: 150, height: 35 });
  const [columnMenu, setColumnMenu] = useState<{ columnId: string; position: { x: number; y: number } } | null>(null);

  // 处理表格名称变更
  const handleNameChange = useCallback((newName: string) => {
    setName(newName);
    // 如果有 formId，触发事件通知标签页更新标题
    if (formId) {
      window.dispatchEvent(new CustomEvent('table-name-change', {
        detail: { formId, newName }
      }));
    }
  }, [formId]);
  const [cellContextMenu, setCellContextMenu] = useState<{ rowId: string; colId: string; position: { x: number; y: number } } | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; colId: string } | null>(null);
  // 固定位置的选择状态（添加行时使用，不跟随单元格移动）
  const [fixedSelectedCell, setFixedSelectedCell] = useState<{
    rowId: string;
    colId: string;
    position: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null); // 选中的列
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set()); // 隐藏的列
  const [rowHeight, setRowHeight] = useState<RowHeightType>('medium'); // 行高
  const [cellToolbar, setCellToolbar] = useState<{ rowId: string; colId: string; position: { x: number; y: number }; cellWidth: number } | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  // 单元格区域选择状态
  const [selectedCellRange, setSelectedCellRange] = useState<{
    startRowId: string;
    startColId: string;
    endRowId: string;
    endColId: string;
  } | null>(null);
  const [isDraggingCellSelect, setIsDraggingCellSelect] = useState(false);
  const cellDragStartRef = useRef<{ rowId: string; colId: string } | null>(null);
  const [showDataViewer, setShowDataViewer] = useState(false);
  const [showAIInputBar, setShowAIInputBar] = useState(false);
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
  const tableDesignerContentRef = useRef<HTMLDivElement>(null);
  const tableDesignerRef = useRef<HTMLDivElement>(null);
  const prevEditingCellRef = useRef<{ rowId: string; colId: string } | null>(null);
  const [needStickyColumn, setNeedStickyColumn] = useState(false);

  // 查询结果状态
  const [queryResult, setQueryResult] = useState<{ success: boolean; message: string; data: Record<string, CellValue>[] } | null>(null);
  const [originalQueryResult, setOriginalQueryResult] = useState<Record<string, CellValue>[]>([]); // 保存原始查询结果用于搜索过滤
  const [isQuerying, setIsQuerying] = useState(false);
  const [isQueryPanelFullscreen, setIsQueryPanelFullscreen] = useState(false);
  const [showQueryConditionPanel, setShowQueryConditionPanel] = useState(false);
  const [showFillColorPanel, setShowFillColorPanel] = useState(false);

  // 查询结果编辑状态
  const [editingQueryCell, setEditingQueryCell] = useState<{ rowIndex: number; columnName: string } | null>(null);
  const [editingQueryValue, setEditingQueryValue] = useState<string>('');

  // 搜索状态
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 100;

  // 当前命令类型状态
  const [currentCommandType, setCurrentCommandType] = useState<string | null>(null);

  // AI 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDiscardButton, setShowDiscardButton] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<string>('');
  const generatorRef = useRef<BatchTableGenerator | null>(null);
  const preGenerateDataRef = useRef<{ columns: TableColumn[]; rows: TableRow[] } | null>(null);

  // 拖动选择多行状态
  const [isDraggingSelect, setIsDraggingSelect] = useState(false);
  const dragStartRowIndex = useRef<number>(-1);
  const hasDraggedRef = useRef<boolean>(false); // 跟踪是否真正发生了拖拽

  // 拖动行排序状态
  const [isDraggingRow, setIsDraggingRow] = useState(false);
  const [dragRowIndex, setDragRowIndex] = useState<number>(-1);
  const [dropTargetIndex, setDropTargetIndex] = useState<number>(-1);
  const dragRowIndexRef = useRef<number>(-1);
  const dropTargetIndexRef = useRef<number>(-1);

  // 查询结果面板宽度拖动状态
  const [queryPanelWidth, setQueryPanelWidth] = useState(400);
  const [isResizingQueryPanel, setIsResizingQueryPanel] = useState(false);
  const queryPanelResizeStartX = useRef<number>(0);
  const queryPanelResizeStartWidth = useRef<number>(0);
  const QUERY_PANEL_MIN_WIDTH = 300;
  const QUERY_PANEL_MAX_WIDTH = 800;

  // 列宽拖动状态
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // 计算扁平化的层级行数据
  const flattenedRows = useMemo(() => {
    return HierarchyTableManager.flattenRows(rows);
  }, [rows]);

  // 加载表格数据（如果有 formId）
  useEffect(() => {
    if (!formId || !tableDataServiceRef.current) {
      setIsDataLoading(false);
      return;
    }

    const loadData = async () => {
      const service = tableDataServiceRef.current;
      if (!service) return;

      const snapshot = await service.initialize(formId);
      if (snapshot) {
        if (snapshot.name) setName(snapshot.name);
        if (snapshot.columns.length > 0) {
          setColumns(snapshot.columns);
        }
        if (snapshot.rows.length > 0) {
          setRows(snapshot.rows);
        }
      }
      setIsDataLoading(false);
    };

    loadData();
  }, [formId]);

  // 同步数据变更到服务（用于关闭时保存）
  useEffect(() => {
    if (!tableDataServiceRef.current) return;
    
    tableDataServiceRef.current.updateCurrentData({
      name,
      columns,
      rows,
    });
  }, [name, columns, rows]);

  // 自动保存（防抖，数据变更后 1 秒自动保存）
  useEffect(() => {
    if (!tableDataServiceRef.current || !formId || isDataLoading) return;
    
    const saveTimer = setTimeout(() => {
      const service = tableDataServiceRef.current;
      if (service && service.hasChanges()) {
        service.save();
      }
    }, 1000);
    
    return () => clearTimeout(saveTimer);
  }, [name, columns, rows, formId, isDataLoading]);

  // 检测是否需要固定列（有横向滚动条且已滚动）
  const needStickyColumnRef = useRef(false);
  useEffect(() => {
    const checkNeedStickyColumn = () => {
      if (!tableWrapperRef.current) return;
      const wrapper = tableWrapperRef.current;
      // 有横向滚动条且已滚动时才需要固定列
      const hasHorizontalScroll = wrapper.scrollWidth > wrapper.clientWidth;
      const hasScrolled = wrapper.scrollLeft > 0;
      const shouldSticky = hasHorizontalScroll && hasScrolled;
      // 只在状态真正变化时才更新，避免频繁重渲染导致抖动
      if (needStickyColumnRef.current !== shouldSticky) {
        needStickyColumnRef.current = shouldSticky;
        setNeedStickyColumn(shouldSticky);
      }
    };

    // 滚动时关闭编辑器和工具栏
    const handleScroll = () => {
      checkNeedStickyColumn();
      // 滚动时关闭浮动编辑器
      if (editingCell) {
        setEditingCell(null);
      }
      // 滚动时关闭单元格工具栏
      if (cellToolbar) {
        setCellToolbar(null);
      }
    };

    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', checkNeedStickyColumn);
    
    // 初始检测
    checkNeedStickyColumn();

    return () => {
      wrapper?.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkNeedStickyColumn);
    };
  }, [columns, editingCell, cellToolbar]);

  // 延伸线元素引用
  const topExtendLineRef = useRef<HTMLDivElement>(null);
  const bottomExtendLineRef = useRef<HTMLDivElement>(null);

  // 计算延伸线位置（直接操作 DOM 避免频繁 state 更新）
  useEffect(() => {
    const updateExtendLinePosition = () => {
      if (!tableRef.current || !tableDesignerContentRef.current || !tableWrapperRef.current) return;
      if (!topExtendLineRef.current || !bottomExtendLineRef.current) return;
      
      const scrollLeft = tableWrapperRef.current.scrollLeft;
      const scrollTop = tableWrapperRef.current.scrollTop;
      
      // 获取 table-designer-content 的宽度
      const contentWidth = tableDesignerContentRef.current.offsetWidth;
      
      // 计算表格右边界相对于 content 的位置（不包括添加列按钮的宽度40px）
      const tableWidth = tableRef.current.offsetWidth;
      const tableRightInContent = tableWidth + 12 - scrollLeft - 40; // 12 是 padding，40 是添加列按钮宽度
      
      // 计算延伸线宽度：从表格右边界到 content 右边界
      const extendLineWidth = contentWidth - tableRightInContent;
      
      // 获取添加行的位置（表格底部）- 考虑滚动偏移，减1避免与边框重叠
      const tableHeight = tableRef.current.offsetHeight;
      const addRowBottom = 12 + tableHeight - scrollTop - 1; // padding + 表格高度 - 滚动偏移 - 1px避免重叠
      
      // 直接操作 DOM 样式，避免 React 重新渲染
      const width = extendLineWidth > 0 ? extendLineWidth : 0;
      topExtendLineRef.current.style.top = `${12 - scrollTop}px`;
      topExtendLineRef.current.style.left = `${tableRightInContent}px`;
      topExtendLineRef.current.style.width = `${width}px`;
      
      bottomExtendLineRef.current.style.top = `${addRowBottom}px`;
      bottomExtendLineRef.current.style.left = `${tableRightInContent}px`;
      bottomExtendLineRef.current.style.width = `${width}px`;
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

  // 滚动时清除固定选择状态，恢复普通选择状态（不显示工具栏）
  useEffect(() => {
    const handleScroll = () => {
      if (fixedSelectedCell) {
        const { rowId, colId } = fixedSelectedCell;
        setFixedSelectedCell(null);
        // 恢复普通选择状态，但不显示工具栏（用户需要再次点击才能显示）
        setSelectedCell({ rowId, colId });
      }
    };
    
    const wrapper = tableWrapperRef.current;
    wrapper?.addEventListener('scroll', handleScroll);
    
    return () => {
      wrapper?.removeEventListener('scroll', handleScroll);
    };
  }, [fixedSelectedCell]);

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
      const target = event.target as HTMLElement;
      // 如果点击的是数据查看面板内部，不清除选中
      if (target.closest('.data-viewer-panel')) {
        return;
      }
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedCell(null);
        setCellToolbar(null);
        setSelectedColumn(null); // 同时清除列选中
      }
    };
    if (selectedCell) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [selectedCell]);

  // 点击表格外部取消编辑状态
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 如果点击的是浮动编辑器内部，不关闭
      if (target.closest('.floating-cell-editor')) {
        return;
      }
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setEditingCell(null);
      }
    };
    if (editingCell) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [editingCell]);

  // 点击表格外部取消多行选中
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedRows(new Set());
      }
    };
    if (selectedRows.size > 0) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [selectedRows.size]);

  // 点击表格外部取消单元格区域选中
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedCellRange(null);
      }
    };
    if (selectedCellRange) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [selectedCellRange]);


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

  // 列宽变化回调（供 TanStackTableCore 使用）
  const handleColumnWidthChange = useCallback((columnId: string, width: number) => {
    console.log('[handleColumnWidthChange] columnId:', columnId, 'width:', width);
    setColumns(prev =>
      prev.map(col => (col.id === columnId ? { ...col, width } : col))
    );
    // 清除固定选择状态和工具栏，因为列宽变化后位置不再准确
    setFixedSelectedCell(null);
    setCellToolbar(null);
  }, []);

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

  // 查询结果面板拖动开始
  const handleQueryPanelResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setIsResizingQueryPanel(true);
    queryPanelResizeStartX.current = event.clientX;
    queryPanelResizeStartWidth.current = queryPanelWidth;
  }, [queryPanelWidth]);

  // 查询结果面板拖动处理
  useEffect(() => {
    if (!isResizingQueryPanel) return;

    const handleResizeMove = (event: MouseEvent) => {
      const delta = queryPanelResizeStartX.current - event.clientX;
      const newWidth = Math.min(
        QUERY_PANEL_MAX_WIDTH,
        Math.max(QUERY_PANEL_MIN_WIDTH, queryPanelResizeStartWidth.current + delta)
      );
      setQueryPanelWidth(newWidth);
    };

    const handleResizeEnd = () => {
      setIsResizingQueryPanel(false);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizingQueryPanel]);

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

  // 切换列可见性
  const handleToggleColumnVisibility = useCallback((columnId: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return next;
    });
  }, []);

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
    // 只有切换到 checkbox 类型时才需要转换值，其他类型保留原值
    if (newType === 'checkbox') {
      setRows(prev => prev.map(row => ({
        ...row,
        cells: {
          ...row.cells,
          [columnId]: Boolean(row.cells[columnId]),
        },
      })));
    }
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
        // 先设置普通选择状态（用于编辑器定位）
        setSelectedCell({ rowId: newRow.id, colId: firstEditableCol.id });
        
        // 滚动到底部
        if (tableWrapperRef.current) {
          tableWrapperRef.current.scrollTop = tableWrapperRef.current.scrollHeight;
        }
        
        // 延迟计算固定位置（等待滚动和渲染完成）
        setTimeout(() => {
          if (tableRef.current && tableContainerRef.current) {
            const cell = tableRef.current.querySelector(`td[data-row-id="${newRow.id}"][data-col-id="${firstEditableCol.id}"]`) as HTMLTableCellElement;
            if (cell) {
              const containerRect = tableContainerRef.current.getBoundingClientRect();
              const cellRect = cell.getBoundingClientRect();
              // 设置固定选择状态
              setFixedSelectedCell({
                rowId: newRow.id,
                colId: firstEditableCol.id,
                position: {
                  top: cellRect.top - containerRect.top,
                  left: cellRect.left - containerRect.left,
                  width: cellRect.width,
                  height: cellRect.height,
                },
              });
              // 清除普通选择状态和工具栏，避免两个边框和工具栏位置错误
              setSelectedCell(null);
              setCellToolbar(null);
            }
          }
        }, 50);
      } else {
        // 滚动到底部
        if (tableWrapperRef.current) {
          tableWrapperRef.current.scrollTop = tableWrapperRef.current.scrollHeight;
        }
      }
    }, 0);
  }, [columns]);

  // 删除行（包括子行）
  const handleDeleteRow = useCallback((rowId: string) => {
    if (rows.length <= 1) return;
    // 使用 HierarchyTableManager 删除行及其所有子行
    setRows(prev => HierarchyTableManager.deleteRowWithChildren(prev, rowId));
    // 同时从选中行中移除
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.delete(rowId);
      // 也移除被删除的子行
      const childIds = HierarchyTableManager.getChildRowIds(rows, rowId);
      childIds.forEach(id => next.delete(id));
      return next;
    });
  }, [rows]);

  // 批量删除选中的行
  const handleDeleteSelectedRows = useCallback(() => {
    if (selectedRows.size === 0) return;
    // 至少保留一行
    if (selectedRows.size >= rows.length) {
      notification.warning('至少保留一行数据');
      return;
    }
    
    // 收集所有要删除的行ID（包括子行）
    const idsToDelete = new Set<string>();
    selectedRows.forEach(rowId => {
      idsToDelete.add(rowId);
      const childIds = HierarchyTableManager.getChildRowIds(rows, rowId);
      childIds.forEach(id => idsToDelete.add(id));
    });
    
    // 删除行
    setRows(prev => prev.filter(row => !idsToDelete.has(row.id)));
    // 清空选中状态
    setSelectedRows(new Set());
  }, [selectedRows, rows]);

  // 获取选中单元格区域内的所有单元格
  const getSelectedCells = useCallback((): Array<{ rowId: string; colId: string }> => {
    if (!selectedCellRange) return [];
    
    const { startRowId, startColId, endRowId, endColId } = selectedCellRange;
    
    // 使用 flattenedRows 获取行索引范围（因为表格显示的是扁平化后的数据）
    const startRowIndex = flattenedRows.findIndex(fr => fr.row.id === startRowId);
    const endRowIndex = flattenedRows.findIndex(fr => fr.row.id === endRowId);
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    
    // 获取列索引范围
    const startColIndex = columns.findIndex(c => c.id === startColId);
    const endColIndex = columns.findIndex(c => c.id === endColId);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);
    
    const cells: Array<{ rowId: string; colId: string }> = [];
    
    for (let rowIdx = minRowIndex; rowIdx <= maxRowIndex; rowIdx++) {
      const flatRow = flattenedRows[rowIdx];
      if (!flatRow) continue;
      for (let colIdx = minColIndex; colIdx <= maxColIndex; colIdx++) {
        const col = columns[colIdx];
        if (!col) continue;
        cells.push({ rowId: flatRow.row.id, colId: col.id });
      }
    }
    
    return cells;
  }, [selectedCellRange, flattenedRows, columns]);

  // 清空选中单元格的内容
  const handleClearSelectedCells = useCallback(() => {
    const cells = getSelectedCells();
    if (cells.length === 0) return;
    
    setRows(prev => {
      const newRows = [...prev];
      for (const { rowId, colId } of cells) {
        const rowIndex = newRows.findIndex(r => r.id === rowId);
        if (rowIndex === -1) continue;
        const col = columns.find(c => c.id === colId);
        if (!col) continue;
        
        // 根据列类型设置默认值
        const defaultValue = col.type === 'checkbox' ? false : '';
        newRows[rowIndex] = {
          ...newRows[rowIndex],
          cells: {
            ...newRows[rowIndex].cells,
            [colId]: defaultValue,
          },
        };
      }
      return newRows;
    });
    
    // 清空选中区域
    setSelectedCellRange(null);
  }, [getSelectedCells, columns]);

  // 监听键盘事件，支持 Delete/Backspace 删除选中行或清空选中单元格
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 如果正在编辑单元格，不处理删除
      if (editingCell) return;
      // 如果焦点在输入框中，不处理
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        // 优先处理单元格区域选择
        if (selectedCellRange) {
          handleClearSelectedCells();
        } else if (selectedRows.size > 0) {
          handleDeleteSelectedRows();
        }
      }
      
      // Tab 键：当有选中单元格但没有编辑时，移动选中单元格到下一列
      if (event.key === 'Tab' && selectedCell && !editingCell) {
        event.preventDefault();
        // 清空工具栏、单元格区域选择和翻译面板
        setCellToolbar(null);
        setSelectedCellRange(null);
        setShowTranslatePanel(false);
        
        const currentColIndex = columns.findIndex(c => c.id === selectedCell.colId);
        const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === selectedCell.rowId);
        
        // 辅助函数：设置选中单元格并滚动使其可见
        const selectAndScrollToCell = (rowId: string, colId: string) => {
          // 先查找目标单元格并滚动
          const cellElement = document.querySelector(`td[data-row-id="${rowId}"][data-col-id="${colId}"]`) as HTMLElement;
          if (cellElement && tableWrapperRef.current) {
            const cellRect = cellElement.getBoundingClientRect();
            const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
            
            // 获取固定列的宽度
            const firstDataColumn = document.querySelector('.design-table td.first-data-column') as HTMLElement;
            const stickyWidth = firstDataColumn 
              ? 56 + firstDataColumn.getBoundingClientRect().width 
              : 56;
            const stickyRightEdge = wrapperRect.left + stickyWidth;
            
            // 如果单元格被固定列遮挡，立即滚动
            if (cellRect.left < stickyRightEdge + 5) {
              const scrollAmount = stickyRightEdge - cellRect.left + 20;
              tableWrapperRef.current.scrollLeft -= scrollAmount;
            }
          }
          setSelectedCell({ rowId, colId });
        };
        
        if (event.shiftKey) {
          // Shift+Tab: 向前移动
          if (currentColIndex > 0) {
            selectAndScrollToCell(selectedCell.rowId, columns[currentColIndex - 1].id);
          } else if (currentRowIndex > 0) {
            // 移动到上一行最后一列
            selectAndScrollToCell(flattenedRows[currentRowIndex - 1].row.id, columns[columns.length - 1].id);
          }
        } else {
          // Tab: 向后移动
          if (currentColIndex < columns.length - 1) {
            selectAndScrollToCell(selectedCell.rowId, columns[currentColIndex + 1].id);
          } else if (currentRowIndex < flattenedRows.length - 1) {
            // 移动到下一行第一列
            selectAndScrollToCell(flattenedRows[currentRowIndex + 1].row.id, columns[0].id);
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingCell, selectedRows.size, selectedCellRange, selectedCell, columns, flattenedRows, handleDeleteSelectedRows, handleClearSelectedCells]);

  // 添加子记录
  const handleAddChildRow = useCallback((parentId: string) => {
    const { rows: newRows, newRow } = HierarchyTableManager.addChildRow(rows, columns, parentId);
    setRows(newRows);
    
    // 自动聚焦到新行的第一个可编辑列
    setTimeout(() => {
      const firstEditableCol = columns.find(col => col.type !== 'checkbox');
      if (firstEditableCol) {
        setEditingCell({ rowId: newRow.id, colId: firstEditableCol.id });
        setSelectedCell({ rowId: newRow.id, colId: firstEditableCol.id });
      }
    }, 0);
  }, [rows, columns]);

  // 切换行展开/折叠
  const handleToggleRowExpanded = useCallback((rowId: string) => {
    setRows(prev => HierarchyTableManager.toggleRowExpanded(prev, rowId));
  }, []);

  // 向上插入行（支持多行，继承父行关系）
  const handleInsertRowAbove = useCallback((rowId: string, count: number = 1) => {
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    const currentRow = rows[rowIndex];
    const newRows: TableRow[] = [];
    for (let i = 0; i < count; i++) {
      const newRow = createDefaultRow(columns);
      // 如果当前行是子记录，新行也继承相同的父行
      if (currentRow.parentId) {
        newRow.parentId = currentRow.parentId;
      }
      newRows.push(newRow);
    }
    setRows(prev => {
      const result = [...prev];
      result.splice(rowIndex, 0, ...newRows);
      return result;
    });
  }, [rows, columns]);

  // 向下插入行（支持多行，继承父行关系）
  const handleInsertRowBelow = useCallback((rowId: string, count: number = 1) => {
    const rowIndex = rows.findIndex(r => r.id === rowId);
    if (rowIndex === -1) return;
    const currentRow = rows[rowIndex];
    const newRows: TableRow[] = [];
    for (let i = 0; i < count; i++) {
      const newRow = createDefaultRow(columns);
      // 如果当前行是子记录，新行也继承相同的父行
      if (currentRow.parentId) {
        newRow.parentId = currentRow.parentId;
      }
      newRows.push(newRow);
    }
    setRows(prev => {
      const result = [...prev];
      result.splice(rowIndex + 1, 0, ...newRows);
      return result;
    });
  }, [rows, columns]);

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

  // 拖动选择开始
  const handleRowDragSelectStart = useCallback((rowIndex: number, event: React.MouseEvent) => {
    // 只响应左键
    if (event.button !== 0) return;
    // 如果正在编辑单元格，不触发拖拽选择
    if (editingCell) {
      return;
    }
    // 如果点击的是正在编辑的输入框，不触发拖拽选择
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' && target.classList.contains('editing')) {
      return;
    }
    event.preventDefault();
    setIsDraggingSelect(true);
    dragStartRowIndex.current = rowIndex;
    hasDraggedRef.current = false; // 重置拖拽标记
    // 开始拖动时，先选中当前行
    const rowId = rows[rowIndex]?.id;
    if (rowId) {
      setSelectedRows(new Set([rowId]));
    }
  }, [rows, editingCell]);

  // 拖动选择移动（通过行索引）
  const updateDragSelection = useCallback((rowIndex: number) => {
    if (dragStartRowIndex.current === -1) return;
    // 标记已经发生了拖拽
    if (rowIndex !== dragStartRowIndex.current) {
      hasDraggedRef.current = true;
    }
    const startIndex = Math.min(dragStartRowIndex.current, rowIndex);
    const endIndex = Math.max(dragStartRowIndex.current, rowIndex);
    const selectedIds = new Set<string>();
    for (let i = startIndex; i <= endIndex; i++) {
      if (rows[i]) {
        selectedIds.add(rows[i].id);
      }
    }
    setSelectedRows(selectedIds);
  }, [rows]);

  // 拖动选择：监听 document 的 mousemove 和 mouseup
  useEffect(() => {
    if (!isDraggingSelect) return;

    const handleMouseMove = (event: MouseEvent) => {
      // 找到鼠标所在的行
      const target = event.target as HTMLElement;
      const tr = target.closest('tr');
      if (!tr || !tableRef.current?.contains(tr)) return;
      
      // 获取行索引
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

  // 拖动行排序：开始拖动
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

  // 拖动行排序：监听 document 的 mousemove 和 mouseup
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
      // 执行行位置交换（基于扁平化索引）
      const fromFlatIndex = dragRowIndexRef.current;
      const toFlatIndex = dropTargetIndexRef.current;
      if (fromFlatIndex !== -1 && toFlatIndex !== -1 && fromFlatIndex !== toFlatIndex) {
        // 获取扁平化列表中对应的行
        const currentFlattenedRows = HierarchyTableManager.flattenRows(rows);
        const fromRow = currentFlattenedRows[fromFlatIndex]?.row;
        const toRow = currentFlattenedRows[toFlatIndex]?.row;
        
        if (fromRow && toRow) {
          // 在原始 rows 数组中找到对应的索引
          const fromOriginalIndex = rows.findIndex(r => r.id === fromRow.id);
          const toOriginalIndex = rows.findIndex(r => r.id === toRow.id);
          
          if (fromOriginalIndex !== -1 && toOriginalIndex !== -1) {
            setRows(prev => {
              const newRows = [...prev];
              const [movedRow] = newRows.splice(fromOriginalIndex, 1);
              // 如果目标位置在源位置之后，需要调整索引
              const adjustedToIndex = toOriginalIndex > fromOriginalIndex ? toOriginalIndex : toOriginalIndex;
              newRows.splice(adjustedToIndex, 0, movedRow);
              return newRows;
            });
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
  }, [isDraggingRow, rows]);

  // 更新单元格值
  const handleUpdateCell = useCallback((rowId: string, colId: string, value: CellValue) => {
    setRows(prev => prev.map(row =>
      row.id === rowId
        ? { ...row, cells: { ...row.cells, [colId]: value } }
        : row
    ));
  }, []);

  // 根据数据内容推断列类型
  const inferTypeFromData = useCallback((sampleValues: CellValue[]): ColumnType | null => {
    const nonEmptyValues = sampleValues.filter(val => val !== null && val !== undefined && val !== '');
    if (nonEmptyValues.length === 0) return null;

    // 检查是否全部是时间格式 (HH:MM 或 HH:MM:SS)
    const allTime = nonEmptyValues.every(val => 
      typeof val === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(val)
    );
    if (allTime) return 'time';

    // 检查是否全部是日期格式 (YYYY-MM-DD 或 YYYY/MM/DD)
    const allDate = nonEmptyValues.every(val => 
      typeof val === 'string' && /^\d{4}[-/]\d{2}[-/]\d{2}$/.test(val)
    );
    if (allDate) return 'date';

    // 检查是否全部是数字
    const allNumber = nonEmptyValues.every(val => 
      typeof val === 'number' || (typeof val === 'string' && /^-?\d+\.?\d*$/.test(val))
    );
    if (allNumber) return 'number';

    // 检查是否全部是布尔值
    const allBoolean = nonEmptyValues.every(val => 
      typeof val === 'boolean' || val === 'true' || val === 'false'
    );
    if (allBoolean) return 'checkbox';

    // 检查是否全部是邮箱
    const allEmail = nonEmptyValues.every(val => 
      typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)
    );
    if (allEmail) return 'email';

    // 检查是否全部是 URL
    const allUrl = nonEmptyValues.every(val => 
      typeof val === 'string' && /^https?:\/\//.test(val)
    );
    if (allUrl) return 'url';

    return null;
  }, []);

  // 验证并转换列类型（结合 AI 返回类型和数据内容）
  const validateColumnType = useCallback((
    colType: string, 
    colName: string,
    sampleValues: CellValue[]
  ): ColumnType => {
    const validTypes: ColumnType[] = ['text', 'number', 'date', 'time', 'checkbox', 'select', 'multiselect', 'tag', 'url', 'email'];
    
    // 先根据数据内容推断类型
    const inferredType = inferTypeFromData(sampleValues);
    
    // 如果 AI 返回的类型有效
    if (validTypes.includes(colType as ColumnType)) {
      const aiType = colType as ColumnType;
      
      // 如果推断出的类型与 AI 类型不同，且推断类型更具体，使用推断类型
      if (inferredType && inferredType !== aiType) {
        // 时间/日期类型优先级高于 text
        if ((inferredType === 'time' || inferredType === 'date') && aiType === 'text') {
          return inferredType;
        }
        // 数字类型优先级高于 text
        if (inferredType === 'number' && aiType === 'text') {
          return inferredType;
        }
      }
      
      return aiType;
    }
    
    // AI 返回的类型无效，使用推断类型或默认 text
    return inferredType || 'text';
  }, [inferTypeFromData]);

  // AI 生成表格数据处理
  const handleAIGenerate = useCallback((content: string) => {
    try {
      let jsonContent = content.trim();
      // 移除 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }
      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }
      jsonContent = jsonContent.trim();

      // 尝试提取有效的 JSON 对象
      const jsonStartIndex = jsonContent.indexOf('{');
      const jsonEndIndex = jsonContent.lastIndexOf('}');
      
      if (jsonStartIndex === -1 || jsonEndIndex === -1 || jsonEndIndex <= jsonStartIndex) {
        console.error('[TableDesigner] AI 生成表格解析失败: 未找到有效的 JSON 对象');
        return;
      }
      
      jsonContent = jsonContent.slice(jsonStartIndex, jsonEndIndex + 1);

      // 尝试直接解析
      let data: {
        columns: Array<{ name: string; type: string }>;
        rows: Array<Record<string, CellValue>>;
      } | null = null;

      try {
        data = JSON.parse(jsonContent);
      } catch {
        // 如果解析失败，尝试修复常见问题
        // 1. 移除尾部不完整的内容（找到最后一个完整的对象或数组）
        let fixedJson = jsonContent;
        
        // 尝试找到 rows 数组的结束位置
        const rowsMatch = fixedJson.match(/"rows"\s*:\s*\[/);
        if (rowsMatch) {
          const rowsStartIndex = fixedJson.indexOf(rowsMatch[0]);
          const afterRows = fixedJson.slice(rowsStartIndex);
          
          // 找到最后一个完整的 } 后跟 , 或 ]
          let lastValidIndex = -1;
          let depth = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < afterRows.length; i++) {
            const char = afterRows[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"' && !escapeNext) {
              inString = !inString;
              continue;
            }
            
            if (inString) continue;
            
            if (char === '{' || char === '[') depth++;
            if (char === '}' || char === ']') {
              depth--;
              if (depth === 1) {
                // 找到一个完整的行对象
                lastValidIndex = rowsStartIndex + i;
              }
            }
          }
          
          if (lastValidIndex > 0) {
            // 截断到最后一个完整对象，并补全结构
            fixedJson = fixedJson.slice(0, lastValidIndex + 1) + ']}';
            try {
              data = JSON.parse(fixedJson);
              console.log('[TableDesigner] JSON 修复成功');
            } catch {
              console.error('[TableDesigner] AI 生成表格解析失败: JSON 修复失败');
              return;
            }
          }
        }
        
        if (!data) {
          console.error('[TableDesigner] AI 生成表格解析失败: 无法解析 JSON');
          return;
        }
      }

      if (data && data.columns && Array.isArray(data.columns)) {
        // 收集每列的样本数据用于类型验证
        const sampleDataByColumn: Record<string, CellValue[]> = {};
        if (data.rows && Array.isArray(data.rows)) {
          data.columns.forEach((col) => {
            sampleDataByColumn[col.name] = data.rows
              .slice(0, 10)
              .map(row => row[col.name])
              .filter(val => val !== undefined);
          });
        }

        const newColumns: TableColumn[] = data.columns.map((col, index) => ({
          id: generateId(),
          name:
            col.name ||
            `${translateText('tableDesigner.defaults.columnPrefix', 'Column')} ${index + 1}`,
          type: validateColumnType(col.type || 'text', col.name, sampleDataByColumn[col.name] || []),
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
  }, [validateColumnType]);

  // 处理分批生成的表格数据
  const handleBatchGenerateData = useCallback((data: { columns: Array<{ name: string; type: string }>; rows: Array<Record<string, CellValue>> }) => {
    if (!data.columns || !Array.isArray(data.columns) || data.columns.length === 0) return;

    // 收集每列的样本数据用于类型验证
    const sampleDataByColumn: Record<string, CellValue[]> = {};
    if (data.rows && Array.isArray(data.rows)) {
      data.columns.forEach((col) => {
        sampleDataByColumn[col.name] = data.rows
          .slice(0, 10)
          .map(row => row[col.name])
          .filter(val => val !== undefined);
      });
    }

    const newColumns: TableColumn[] = data.columns.map((col, index) => ({
      id: generateId(),
      name:
        col.name ||
        `${translateText('tableDesigner.defaults.columnPrefix', 'Column')} ${index + 1}`,
      type: validateColumnType(col.type || 'text', col.name, sampleDataByColumn[col.name] || []),
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
    console.log('[TableDesigner] 分批生成表格成功:', { columns: newColumns.length, rows: newRows.length });
  }, [validateColumnType]);

  // 自定义生成函数（支持分批生成和流式更新）
  const customGenerateFunction = useCallback(async (
    input: string,
    modelId: string,
    callbacks: {
      onProgress?: (message: string) => void;
      onComplete: (content: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    const generator = new BatchTableGenerator(modelId);
    generatorRef.current = generator;
    
    // 保存生成前的数据
    preGenerateDataRef.current = {
      columns: [...columns],
      rows: [...rows],
    };
    
    setIsGenerating(true);
    setShowDiscardButton(false);
    setGenerateProgress('正在生成数据...');
    
    try {
      await generator.generate(input, {
        onProgress: (message) => {
          setGenerateProgress(message);
          callbacks.onProgress?.(message);
        },
        onStreamData: (data) => {
          // 流式更新表格显示
          handleBatchGenerateData(data);
        },
        onBatchComplete: (_batchIndex, _totalBatches, data) => {
          // 每批完成时更新表格显示
          handleBatchGenerateData(data);
        },
        onComplete: (data) => {
          console.log('[TableDesigner] 生成完成，显示放弃按钮');
          handleBatchGenerateData(data);
          setIsGenerating(false);
          setGenerateProgress('');
          setShowDiscardButton(true); // 生成完成后显示放弃按钮
          generatorRef.current = null;
          // 返回空字符串，因为我们已经直接处理了数据
          callbacks.onComplete('');
        },
        onError: (error) => {
          setIsGenerating(false);
          setGenerateProgress('');
          generatorRef.current = null;
          preGenerateDataRef.current = null;
          callbacks.onError?.(error);
        },
      });
    } catch (error) {
      setIsGenerating(false);
      generatorRef.current = null;
      preGenerateDataRef.current = null;
      callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [handleBatchGenerateData, columns, rows]);

  // 取消生成
  const handleCancelGenerate = useCallback(() => {
    if (generatorRef.current) {
      generatorRef.current.stop();
      generatorRef.current = null;
    }
    // 恢复生成前的数据
    if (preGenerateDataRef.current) {
      setColumns(preGenerateDataRef.current.columns);
      setRows(preGenerateDataRef.current.rows);
      preGenerateDataRef.current = null;
    }
    setIsGenerating(false);
    setShowDiscardButton(false);
    setGenerateProgress('');
  }, []);

  // 放弃生成的数据
  const handleDiscardGenerate = useCallback(() => {
    if (preGenerateDataRef.current) {
      setColumns(preGenerateDataRef.current.columns);
      setRows(preGenerateDataRef.current.rows);
      preGenerateDataRef.current = null;
    }
    setShowDiscardButton(false);
  }, []);

  // 确认保留生成的数据
  const handleAcceptGenerate = useCallback(() => {
    preGenerateDataRef.current = null;
    setShowDiscardButton(false);
  }, []);

  // 获取当前表格数据的 JSON 表示（用于 AI 查询）
  const getTableDataForAI = useCallback((): string => {
    const tableData = {
      columns: columns.map(col => ({ name: col.name, type: col.type })),
      rows: rows.map((row, index) => {
        const rowData: Record<string, CellValue> = { _rowIndex: index };
        columns.forEach(col => {
          rowData[col.name] = row.cells[col.id];
        });
        return rowData;
      }),
    };
    return JSON.stringify(tableData, null, 2);
  }, [columns, rows]);

  // 创建表格操作实例
  const tableOperations = useRef(new TableOperations(columns, rows));

  // 更新表格操作实例的数据源
  useEffect(() => {
    tableOperations.current.updateDataSource(columns, rows);
  }, [columns, rows]);

  // 处理查询命令（使用代码实现，不调用 AI）
  const handleQueryCommand = useCallback((queryContent: string) => {
    console.log('[TableDesigner] 执行查询命令:', queryContent);
    // 显示查询条件面板
    setShowQueryConditionPanel(true);
  }, []);

  // 处理查询条件面板的查询
  const handleQueryWithConditions = useCallback((conditions: QueryCondition[], logic: 'and' | 'or') => {
    const result = tableOperations.current.query({ conditions, conditionLogic: logic });
    setOriginalQueryResult(result.data); // 保存原始查询结果
    setSearchKeyword(''); // 清空搜索关键词
    setCurrentPage(1); // 重置分页
    setQueryResult({
      success: result.success,
      message: translateText(
        'tableDesigner.queryResult.foundCount',
        'Found {{count}} row(s)',
        { count: String(result.data.length) },
      ),
      data: result.data,
    });
  }, [t]);

  // 处理填色条件面板的填色 - 每个条件单独填色，支持不同范围
  const handleFillColorCondition = useCallback(
    (conditionsWithColor: Array<{ condition: QueryCondition; color: string; scope: FillColorScope }>) => {
      // 没有条件时不执行填色
      if (conditionsWithColor.length === 0) {
        return;
      }

      // 收集所有匹配的填色信息
      // rowColorMap: 整行填色
      // cellColorMap: 单元格填色 Map<rowId, Map<columnName, color>>
      // columnColorMap: 整列填色 Map<columnName, color>
      const rowColorMap = new Map<string, string>();
      const cellColorMap = new Map<string, Map<string, string>>();
      const columnColorMap = new Map<string, string>();

      // 遍历每个条件，查询匹配的行并设置颜色
      conditionsWithColor.forEach(({ condition, color, scope }) => {
        const result = tableOperations.current.query({
          conditions: [condition],
          conditionLogic: 'and',
        });
        
        result.data.forEach(row => {
          const rowId = row._rowId as string;
          
          switch (scope) {
            case 'row':
              // 整行填色
              rowColorMap.set(rowId, color);
              break;
            case 'cell':
              // 单元格填色
              if (!cellColorMap.has(rowId)) {
                cellColorMap.set(rowId, new Map());
              }
              cellColorMap.get(rowId)?.set(condition.columnName, color);
              break;
            case 'column':
              // 整列填色
              columnColorMap.set(condition.columnName, color);
              break;
          }
        });
      });

      // 更新行的背景色和单元格颜色（先清除旧的填色，再应用新的）
      setRows(prev =>
        prev.map(row => {
          // 先清除旧的填色
          const updatedRow = { ...row };
          delete updatedRow.backgroundColor;
          delete updatedRow.cellColors;
          
          // 整行填色
          const rowColor = rowColorMap.get(row.id);
          if (rowColor) {
            updatedRow.backgroundColor = rowColor;
          }
          
          // 单元格填色
          const cellColors = cellColorMap.get(row.id);
          if (cellColors && cellColors.size > 0) {
            updatedRow.cellColors = Object.fromEntries(cellColors);
          }
          
          return updatedRow;
        })
      );

      // 更新列的背景色（先清除旧的，再应用新的）
      setColumns(prev =>
        prev.map(col => {
          // 先清除旧的列背景色
          const { backgroundColor, ...rest } = col;
          const colColor = columnColorMap.get(col.name);
          if (colColor) {
            return { ...rest, backgroundColor: colColor };
          }
          return rest as TableColumn;
        })
      );
      // 填色后不关闭面板，方便用户继续操作
    },
    []
  );

  // 清除所有填色（行背景色、单元格颜色、列背景色）
  const handleClearAllFillColor = useCallback(() => {
    // 清除行的背景色和单元格颜色
    setRows(prev =>
      prev.map(row => {
        const updatedRow = { ...row };
        // 清除行背景色
        if (updatedRow.backgroundColor) {
          delete updatedRow.backgroundColor;
        }
        // 清除单元格颜色
        if (updatedRow.cellColors) {
          delete updatedRow.cellColors;
        }
        return updatedRow;
      })
    );
    // 清除列的背景色
    setColumns(prev =>
      prev.map(col => {
        if (col.backgroundColor) {
          const { backgroundColor, ...rest } = col;
          return rest as TableColumn;
        }
        return col;
      })
    );
  }, []);

  // 处理搜索（在查询结果中搜索关键词）
  const handleSearch = useCallback(() => {
    setCurrentPage(1); // 搜索时重置分页
    if (!searchKeyword.trim()) {
      // 空关键词返回原始查询结果
      setQueryResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          message: translateText(
            'tableDesigner.queryResult.foundCount',
            'Found {{count}} row(s)',
            { count: String(originalQueryResult.length) },
          ),
          data: originalQueryResult,
        };
      });
      return;
    }

    // 在原始查询结果中搜索
    const keyword = searchKeyword.trim().toLowerCase();
    const filteredData = originalQueryResult.filter(row => {
      return Object.entries(row).some(([key, value]) => {
        if (key === '_rowIndex' || key === '_rowId') return false;
        return String(value ?? '').toLowerCase().includes(keyword);
      });
    });

    setQueryResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        message: translateText(
          'tableDesigner.queryResult.foundCount',
          'Found {{count}} row(s)',
          { count: String(filteredData.length) },
        ),
        data: filteredData,
      };
    });
  }, [originalQueryResult, searchKeyword, t]);

  // 搜索框回车处理
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }, [handleSearch]);

  // 处理查询结果单元格双击编辑
  const handleQueryCellDoubleClick = useCallback((rowIndex: number, columnName: string, value: CellValue) => {
    setEditingQueryCell({ rowIndex, columnName });
    setEditingQueryValue(String(value ?? ''));
  }, []);

  // 处理查询结果单元格编辑完成
  const handleQueryCellEditComplete = useCallback(() => {
    if (!editingQueryCell || !queryResult) return;

    const { rowIndex, columnName } = editingQueryCell;
    const rowData = queryResult.data[rowIndex];
    const originalRowIndex = rowData._rowIndex as number;
    const originalRowId = rowData._rowId as string;

    // 找到对应的列
    const column = columns.find(col => col.name === columnName);
    if (!column) {
      setEditingQueryCell(null);
      return;
    }

    // 更新原始数据
    setRows(prev => {
      const newRows = [...prev];
      const targetRowIndex = newRows.findIndex(r => r.id === originalRowId);
      if (targetRowIndex !== -1) {
        newRows[targetRowIndex] = {
          ...newRows[targetRowIndex],
          cells: {
            ...newRows[targetRowIndex].cells,
            [column.id]: editingQueryValue,
          },
        };
      }
      return newRows;
    });

    // 更新查询结果显示
    setQueryResult(prev => {
      if (!prev) return prev;
      const newData = [...prev.data];
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnName]: editingQueryValue,
      };
      return { ...prev, data: newData };
    });

    setEditingQueryCell(null);
  }, [editingQueryCell, queryResult, columns, editingQueryValue]);

  // 处理查询结果单元格编辑取消
  const handleQueryCellEditCancel = useCallback(() => {
    setEditingQueryCell(null);
  }, []);

  // 处理查询结果单元格编辑键盘事件
  const handleQueryCellKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleQueryCellEditComplete();
    } else if (e.key === 'Escape') {
      handleQueryCellEditCancel();
    }
  }, [handleQueryCellEditComplete, handleQueryCellEditCancel]);


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
        placeholder={translateText('tableDesigner.contextMenu.placeholders.columnTitle', 'Enter a field title')}
        onClick={(e) => e.stopPropagation()}
      />
    );
  };

  // 生成列菜单项
  const buildColumnMenuItems = useCallback((columnId: string): ContextMenuItem[] => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return [];

    const columnIndex = columns.findIndex(c => c.id === columnId);
    const isFirstColumn = columnIndex === 0;

    // 字段类型子菜单
    const typeSubmenu: ContextMenuItem[] = COLUMN_TYPES.map(typeInfo => ({
      id: `type-${typeInfo.type}`,
      label: translateText(`tableDesigner.contextMenu.columnTypes.${typeInfo.type}`, typeInfo.label),
      icon: typeInfo.icon,
      selected: column.type === typeInfo.type,
      onClick: () => handleUpdateColumnType(columnId, typeInfo.type),
    }));

    // 基础菜单项
    const menuItems: ContextMenuItem[] = [
      {
        id: 'modify-field',
        label: translateText('tableDesigner.contextMenu.column.modifyField', 'Modify Field'),
        icon: 'edit',
        submenu: [
          {
            id: 'title-label',
            label: translateText('tableDesigner.contextMenu.column.title', 'Title'),
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
            label: translateText('tableDesigner.contextMenu.column.fieldType', 'Field Type'),
            submenu: typeSubmenu,
            submenuType: 'hover',
          },
        ],
      },
      {
        id: 'edit-description',
        label: translateText('tableDesigner.contextMenu.column.editDescription', 'Edit Field Description'),
        icon: 'info-circle',
        onClick: () => {
          // TODO: 实现字段描述编辑
          console.log('编辑字段描述:', columnId);
        },
      },
      {
        id: 'fill-color',
        label: translateText('tableDesigner.contextMenu.column.fillColumnColor', 'Fill Column Color'),
        icon: 'paint-bucket',
        onClick: () => {
          // TODO: 实现整列填色
          console.log('整列填色:', columnId);
        },
      },
      { id: 'sep-1', label: '', separator: true },
      // 第一列不显示复制字段
      ...(!isFirstColumn ? [{
        id: 'duplicate-field',
        label: translateText('tableDesigner.contextMenu.column.duplicateField', 'Duplicate Field'),
        icon: 'copy',
        onClick: () => handleDuplicateColumn(columnId),
      }] : []),
      // 第一列不显示隐藏字段
      ...(!isFirstColumn ? [{
        id: 'hide-field',
        label: translateText('tableDesigner.contextMenu.column.hideField', 'Hide Field'),
        icon: 'eye-off',
        onClick: () => {
          handleToggleColumnVisibility(columnId);
          handleCloseColumnMenu();
        },
      }] : []),
      { id: 'sep-2', label: '', separator: true },
      // 第一列不显示向左插入字段
      ...(!isFirstColumn ? [{
        id: 'insert-left',
        label: translateText('tableDesigner.contextMenu.column.insertFieldLeft', 'Insert Field to the Left'),
        icon: 'arrow-left',
        onClick: () => handleInsertColumnLeft(columnId),
      }] : []),
      {
        id: 'insert-right',
        label: translateText('tableDesigner.contextMenu.column.insertFieldRight', 'Insert Field to the Right'),
        icon: 'arrow-right',
        onClick: () => handleInsertColumnRight(columnId),
      },
      // 第一列不显示删除字段
      ...(!isFirstColumn ? [
        { id: 'sep-3', label: '', separator: true },
        {
          id: 'delete-field',
          label: translateText('tableDesigner.contextMenu.column.deleteField', 'Delete Field'),
          icon: 'delete',
          disabled: columns.length <= 1,
          onClick: () => handleDeleteColumn(columnId),
        },
      ] : []),
    ];

    return menuItems;
  }, [columns, handleUpdateColumnType, handleUpdateColumnName, handleDuplicateColumn, handleInsertColumnLeft, handleInsertColumnRight, handleDeleteColumn, handleToggleColumnVisibility, handleCloseColumnMenu, t]);

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

  // 打开列菜单（供 TanStackTableCore 使用，接收位置参数）
  const handleColumnMenuOpen = useCallback((columnId: string, position: { x: number; y: number }) => {
    setColumnMenu({
      columnId,
      position,
    });
  }, []);

  // 关闭单元格右键菜单
  const handleCloseCellContextMenu = useCallback(() => {
    setCellContextMenu(null);
  }, []);

  // 打开单元格右键菜单
  const handleOpenCellContextMenu = useCallback((rowId: string, colId: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // 关闭单元格工具栏
    setCellToolbar(null);
    // 自动选中对应的单元格
    setSelectedCell({ rowId, colId });
    setCellContextMenu({
      rowId,
      colId,
      position: { x: event.clientX, y: event.clientY },
    });
  }, []);

  // 打开单元格右键菜单（供 TanStackTableCore 使用，接收位置参数）
  const handleCellContextMenu = useCallback((rowId: string, colId: string, position: { x: number; y: number }) => {
    // 关闭单元格工具栏
    setCellToolbar(null);
    // 关闭列菜单
    setColumnMenu(null);
    // 自动选中对应的单元格
    setSelectedCell({ rowId, colId });
    setCellContextMenu({
      rowId,
      colId,
      position,
    });
  }, []);

  // 插入行数输入组件
  const InsertRowInput: React.FC<{ 
    direction: 'above' | 'below'; 
    rowId: string;
    onInsert: (rowId: string, count: number) => void;
    onClose: () => void;
  }> = ({ direction, rowId, onInsert, onClose }) => {
    const [value, setValue] = useState('1');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, []);

    const handleSubmit = () => {
      const count = parseInt(value, 10);
      if (!isNaN(count) && count >= 1 && count <= 100) {
        onInsert(rowId, count);
        onClose();
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      // 不允许空字符串
      if (inputValue === '') {
        setValue('1');
        return;
      }
      // 只允许输入数字
      if (!/^\d+$/.test(inputValue)) {
        return;
      }
      const num = parseInt(inputValue, 10);
      // 限制范围为1-100
      if (num > 100) {
        setValue('100');
      } else if (num < 1) {
        setValue('1');
      } else {
        setValue(String(num)); // 移除前导零
      }
    };

    return (
      <div className="insert-row-input-wrapper" onClick={(e) => e.stopPropagation()}>
        <span className="insert-row-label">
          {direction === 'above'
            ? translateText('tableDesigner.contextMenu.row.insertAboveLabel', 'Insert above')
            : translateText('tableDesigner.contextMenu.row.insertBelowLabel', 'Insert below')}
        </span>
        <input
          ref={inputRef}
          type="text"
          className="insert-row-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="insert-row-label">
          {translateText('tableDesigner.contextMenu.row.rowsUnit', 'row(s)')}
        </span>
      </div>
    );
  };

  // 构建单元格右键菜单项
  const buildCellContextMenuItems = useCallback((rowId: string): ContextMenuItem[] => {
    // 检查当前行是否是子记录
    const currentRow = rows.find(r => r.id === rowId);
    const isChildRow = !!currentRow?.parentId;
    
    const menuItems: ContextMenuItem[] = [
      {
        id: 'insert-row-above',
        label: translateText('tableDesigner.contextMenu.row.insertAbove', 'Insert Above'),
        icon: 'arrow-up',
        customOnly: true,
        customContent: (
          <InsertRowInput 
            direction="above" 
            rowId={rowId} 
            onInsert={handleInsertRowAbove}
            onClose={handleCloseCellContextMenu}
          />
        ),
      },
      {
        id: 'insert-row-below',
        label: translateText('tableDesigner.contextMenu.row.insertBelow', 'Insert Below'),
        icon: 'arrow-down',
        customOnly: true,
        customContent: (
          <InsertRowInput 
            direction="below" 
            rowId={rowId} 
            onInsert={handleInsertRowBelow}
            onClose={handleCloseCellContextMenu}
          />
        ),
      },
      { id: 'sep-1', label: '', separator: true },
      // 只有非子记录行才显示"添加子记录"选项
      ...(isChildRow ? [] : [{
        id: 'add-child-record',
        label: translateText('tableDesigner.contextMenu.row.addChildRecord', 'Add Child Record'),
        icon: 'plus',
        onClick: () => {
          handleAddChildRow(rowId);
          handleCloseCellContextMenu();
        },
      }]),
      {
        id: 'add-description',
        label: translateText('tableDesigner.contextMenu.row.addDescription', 'Add Description'),
        icon: 'file-text',
        onClick: () => {
          // TODO: 实现添加描述
          console.log('添加描述:', rowId);
          handleCloseCellContextMenu();
        },
      },
      {
        id: 'row-fill-color',
        label: translateText('tableDesigner.contextMenu.row.fillRowColor', 'Fill Row Color'),
        icon: 'paint-bucket',
        onClick: () => {
          // TODO: 实现整行填色
          console.log('整行填色:', rowId);
          handleCloseCellContextMenu();
        },
      },
      { id: 'sep-2', label: '', separator: true },
      {
        id: 'smart-summary',
        label: translateText('tableDesigner.contextMenu.row.smartSummary', 'Smart Summary'),
        icon: 'sparkles',
        onClick: () => {
          // TODO: 实现智能总结
          console.log('智能总结:', rowId);
          handleCloseCellContextMenu();
        },
      },
      { id: 'sep-3', label: '', separator: true },
      {
        id: 'delete-record',
        label: translateText('tableDesigner.contextMenu.row.deleteRecord', 'Delete Record'),
        icon: 'delete',
        disabled: rows.length <= 1,
        onClick: () => {
          handleDeleteRow(rowId);
          handleCloseCellContextMenu();
        },
      },
    ];
    
    return menuItems;
  }, [rows, handleInsertRowAbove, handleInsertRowBelow, handleDeleteRow, handleAddChildRow, handleCloseCellContextMenu, t]);

  // 渲染单元格
  const renderCell = (row: TableRow, column: TableColumn) => {
    const value = row.cells[column.id];

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

    // 单选类型显示文本
    if (column.type === 'select') {
      return (
        <input
          type="text"
          className="cell-text-input"
          value={String(value || '')}
          readOnly
          tabIndex={-1}
        />
      );
    }

    // 密码类型显示星号遮盖
    if (column.type === 'password') {
      const displayValue = value ? '••••••••' : '';
      return (
        <input
          type="text"
          className="cell-text-input"
          value={displayValue}
          readOnly
          tabIndex={-1}
        />
      );
    }

    // 链接类型显示为可点击链接样式
    if (column.type === 'url') {
      const urlValue = String(value || '');
      const handleLinkClick = (e: React.MouseEvent) => {
        // 阻止事件冒泡，由链接元素自己处理
        e.stopPropagation();
        
        // 使用 td 元素存储点击时间（更稳定）
        const td = (e.currentTarget as HTMLElement).closest('td');
        if (!td) return;
        
        // 检测双击
        const now = Date.now();
        const lastClick = td.dataset.linkLastClick;
        const lastClickTime = lastClick ? parseInt(lastClick, 10) : 0;
        td.dataset.linkLastClick = String(now);
        
        if (now - lastClickTime < 300) {
          // 双击 - 进入编辑模式
          const rowId = td.dataset.rowId;
          const colId = td.dataset.colId;
          if (rowId && colId) {
            // 触发自定义事件通知父组件进入编辑模式
            td.dispatchEvent(new CustomEvent('cell-double-click', { 
              bubbles: true, 
              detail: { rowId, colId } 
            }));
          }
        } else {
          // 单击 - 打开链接
          if (urlValue) {
            let url = urlValue;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
            }
            window.electron?.shell?.openExternal(url);
          }
        }
      };
      
      return (
        <span className="cell-url-wrapper">
          <span 
            className="cell-url-link" 
            title={urlValue}
            onClick={urlValue ? handleLinkClick : undefined}
            style={{ pointerEvents: urlValue ? 'auto' : 'none' }}
          >
            {urlValue}
          </span>
        </span>
      );
    }

    // 其他类型显示文本，编辑由 FloatingCellEditor 处理
    return (
      <input
        type="text"
        className="cell-text-input"
        value={String(value || '')}
        readOnly
        tabIndex={-1}
      />
    );
  };

  // 处理编辑状态的键盘事件
  const handleEditingKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, rowId: string, colId: string) => {
    const column = columns.find(c => c.id === colId);
    if (e.key === 'Enter') {
      e.preventDefault();
      const newValue = column?.type === 'number'
        ? ((e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : '')
        : (e.target as HTMLInputElement).value;
      handleUpdateCell(rowId, colId, newValue);
      // 移动到下一行
      const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === rowId);
      if (currentRowIndex < flattenedRows.length - 1) {
        setEditingCell({ rowId: flattenedRows[currentRowIndex + 1].row.id, colId });
        setSelectedCell({ rowId: flattenedRows[currentRowIndex + 1].row.id, colId });
      } else {
        setEditingCell(null);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = column?.type === 'number'
        ? ((e.target as HTMLInputElement).value ? Number((e.target as HTMLInputElement).value) : '')
        : (e.target as HTMLInputElement).value;
      handleUpdateCell(rowId, colId, newValue);
      // 移动到下一列或下一行
      const currentColIndex = columns.findIndex(c => c.id === colId);
      let nextColIndex = e.shiftKey ? currentColIndex - 1 : currentColIndex + 1;
      while (nextColIndex >= 0 && nextColIndex < columns.length && 
             (columns[nextColIndex].type === 'checkbox' || columns[nextColIndex].type === 'select')) {
        nextColIndex = e.shiftKey ? nextColIndex - 1 : nextColIndex + 1;
      }
      if (nextColIndex >= 0 && nextColIndex < columns.length) {
        setEditingCell({ rowId, colId: columns[nextColIndex].id });
        setSelectedCell({ rowId, colId: columns[nextColIndex].id });
      } else if (!e.shiftKey) {
        const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === rowId);
        if (currentRowIndex < flattenedRows.length - 1) {
          const firstEditableCol = columns.find(c => c.type !== 'checkbox' && c.type !== 'select');
          if (firstEditableCol) {
            setEditingCell({ rowId: flattenedRows[currentRowIndex + 1].row.id, colId: firstEditableCol.id });
            setSelectedCell({ rowId: flattenedRows[currentRowIndex + 1].row.id, colId: firstEditableCol.id });
          }
        } else {
          setEditingCell(null);
        }
      } else {
        setEditingCell(null);
      }
    }
  }, [columns, flattenedRows, handleUpdateCell]);

  // 渲染单元格内容（供 TanStackTableCore 使用的适配器）
  const renderCellContent = useCallback((row: TableRow, column: TableColumn, isEditing: boolean): React.ReactNode => {
    // 始终显示只读内容，编辑由 FloatingCellEditor 处理
    return renderCell(row, column);
  }, [renderCell]);

  // 通用函数：滚动使单元格完全可见（避免被固定列遮挡）
  const scrollCellToVisible = useCallback((cellElement: HTMLElement) => {
    if (!tableWrapperRef.current) return;
    
    const cellRect = cellElement.getBoundingClientRect();
    const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
    
    // 获取固定列的宽度（行选择器列 56px + 第一数据列宽度）
    const firstDataColumn = document.querySelector('.design-table td.first-data-column') as HTMLElement;
    const stickyWidth = firstDataColumn 
      ? 56 + firstDataColumn.getBoundingClientRect().width 
      : 56;
    
    // 计算固定列右边缘的绝对位置
    const stickyRightEdge = wrapperRect.left + stickyWidth;
    
    // 只处理被固定列遮挡的情况：向右滚动使单元格完全显示
    // 不处理右边缘超出视口的情况，避免选择列时自动向左移动
    if (cellRect.left < stickyRightEdge + 5) {
      const scrollAmount = stickyRightEdge - cellRect.left + 15;
      tableWrapperRef.current.scrollLeft -= scrollAmount;
    }
  }, []);

  // 处理单元格单击 - 选中单元格并显示工具栏
  const handleCellClick = useCallback((rowId: string, colId: string, event: React.MouseEvent<HTMLTableCellElement>) => {
    // 如果发生了拖拽选择，不触发单元格选中
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    
    const column = columns.find(c => c.id === colId);
    if (column?.type === 'checkbox') return;
    
    const colIndex = columns.findIndex(c => c.id === colId);
    const cellElement = event.currentTarget;
    
    // 清除固定选择状态
    setFixedSelectedCell(null);
    
    // 只有非固定列（colIndex > 0）且被固定列遮挡时才需要滚动
    let needScroll = false;
    if (colIndex > 0 && tableWrapperRef.current) {
      const cellRect = cellElement.getBoundingClientRect();
      const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
      // 固定列宽度：row-selector-cell(56px) + first-data-column(第一列宽度)
      const firstColumnWidth = columns[0]?.width || 150;
      const stickyWidth = 56 + firstColumnWidth;
      const stickyRight = wrapperRect.left + stickyWidth;
      
      // 只处理被固定列遮挡的情况
      if (cellRect.left < stickyRight) {
        needScroll = true;
        const scrollOffset = stickyRight - cellRect.left + 4;
        console.log('[handleCellClick] 滚动调整:', { cellLeft: cellRect.left, stickyRight, scrollOffset });
        tableWrapperRef.current.scrollLeft -= scrollOffset;
      }
    }
    
    // 如果点击的是其他单元格，关闭当前编辑状态
    if (editingCell && (editingCell.rowId !== rowId || editingCell.colId !== colId)) {
      setEditingCell(null);
    }
    
    // 关闭翻译面板
    setShowTranslatePanel(false);
    
    // 关闭右键菜单
    setCellContextMenu(null);
    
    // 清空单元格区域选择（单击选中和拖拽选中互斥）
    setSelectedCellRange(null);
    setSelectedCell({ rowId, colId });
    
    // 延迟设置工具栏位置，等待滚动完成后获取正确的位置
    setTimeout(() => {
      const updatedCellRect = cellElement.getBoundingClientRect();
      // 获取容器位置，计算相对坐标（因为 contain: paint 会影响 fixed 定位）
      const containerRect = tableDesignerRef.current?.getBoundingClientRect();
      const offsetX = containerRect?.left || 0;
      const offsetY = containerRect?.top || 0;
      setCellToolbar({
        rowId,
        colId,
        position: {
          x: updatedCellRect.left - offsetX,
          y: updatedCellRect.top - offsetY,
        },
        cellWidth: updatedCellRect.width,
      });
    }, needScroll ? 50 : 0);
  }, [columns, editingCell]);

  // 处理单元格双击 - 进入编辑模式
  const handleCellDoubleClick = useCallback((rowId: string, colId: string, event?: React.MouseEvent<HTMLTableCellElement>) => {
    const column = columns.find(c => c.id === colId);
    if (column?.type === 'checkbox' || column?.type === 'select') return;
    
    const colIndex = columns.findIndex(c => c.id === colId);
    const row = rows.find(r => r.id === rowId);
    const isChildRowFirstColumn = colIndex === 0 && row?.parentId;
    
    // 计算浮动编辑器位置
    if (event && tableContainerRef.current) {
      const cell = event.currentTarget as HTMLTableCellElement;
      const cellRect = cell.getBoundingClientRect();
      const containerRect = tableContainerRef.current.getBoundingClientRect();
      
      const leftOffset = isChildRowFirstColumn ? 1 : 0;
      // 向上偏移 1px，补偿文本位置差异
      setFloatingEditorPosition({
        top: cellRect.top - containerRect.top - 1,
        left: cellRect.left - containerRect.left + leftOffset,
        width: cellRect.width - leftOffset,
        height: cellRect.height,
      });
      
      // 更新 prevEditingCellRef，防止 useEffect 重复执行
      prevEditingCellRef.current = { rowId, colId };
    }
    
    setSelectedCell({ rowId, colId });
    setEditingCell({ rowId, colId });
    setCellToolbar(null);
  }, [columns, rows]);

  // 处理浮动编辑器关闭
  const handleFloatingEditorClose = useCallback(() => {
    setEditingCell(null);
  }, []);

  // 处理浮动编辑器键盘导航
  const handleFloatingEditorKeyNavigation = useCallback((key: string, shiftKey: boolean) => {
    if (!editingCell) return;
    
    const currentColIndex = columns.findIndex(c => c.id === editingCell.colId);
    const currentRowIndex = flattenedRows.findIndex(fr => fr.row.id === editingCell.rowId);
    
    // 辅助函数：同时更新 editingCell 和 selectedCell，并滚动使单元格可见
    const navigateToCell = (rowId: string, colId: string) => {
      // 先查找当前单元格，立即滚动（在状态更新前）
      const cellElement = document.querySelector(`td[data-row-id="${rowId}"][data-col-id="${colId}"]`) as HTMLElement;
      
      if (cellElement && tableWrapperRef.current) {
        const cellRect = cellElement.getBoundingClientRect();
        const wrapperRect = tableWrapperRef.current.getBoundingClientRect();
        
        // 获取固定列的宽度
        const firstDataColumn = document.querySelector('.design-table td.first-data-column') as HTMLElement;
        const stickyWidth = firstDataColumn 
          ? 56 + firstDataColumn.getBoundingClientRect().width 
          : 56;
        const stickyRightEdge = wrapperRect.left + stickyWidth;
        
        // 如果单元格被固定列遮挡，立即滚动
        if (cellRect.left < stickyRightEdge + 5) {
          const scrollAmount = stickyRightEdge - cellRect.left + 20;
          tableWrapperRef.current.scrollLeft -= scrollAmount;
        }
      }
      
      setEditingCell({ rowId, colId });
      setSelectedCell({ rowId, colId });
      // 清空工具栏、区域选择和翻译面板
      setCellToolbar(null);
      setSelectedCellRange(null);
      setShowTranslatePanel(false);
    };
    
    if (key === 'Tab') {
      if (shiftKey) {
        // Shift+Tab: 向前移动
        if (currentColIndex > 0) {
          let prevColIndex = currentColIndex - 1;
          while (prevColIndex >= 0 && (columns[prevColIndex].type === 'checkbox' || columns[prevColIndex].type === 'select')) {
            prevColIndex--;
          }
          if (prevColIndex >= 0) {
            navigateToCell(editingCell.rowId, columns[prevColIndex].id);
            return;
          }
        }
        // 移动到上一行最后一列
        if (currentRowIndex > 0) {
          let lastColIndex = columns.length - 1;
          while (lastColIndex >= 0 && (columns[lastColIndex].type === 'checkbox' || columns[lastColIndex].type === 'select')) {
            lastColIndex--;
          }
          if (lastColIndex >= 0) {
            navigateToCell(flattenedRows[currentRowIndex - 1].row.id, columns[lastColIndex].id);
            return;
          }
        }
        // 已经是第一行第一列，保持当前编辑状态
      } else {
        // Tab: 向后移动到下一列
        let nextColIndex = currentColIndex + 1;
        while (nextColIndex < columns.length && (columns[nextColIndex].type === 'checkbox' || columns[nextColIndex].type === 'select')) {
          nextColIndex++;
        }
        if (nextColIndex < columns.length) {
          navigateToCell(editingCell.rowId, columns[nextColIndex].id);
          return;
        }
        // 如果是最后一列，移动到下一行第一列
        if (currentRowIndex < flattenedRows.length - 1) {
          let firstColIndex = 0;
          while (firstColIndex < columns.length && (columns[firstColIndex].type === 'checkbox' || columns[firstColIndex].type === 'select')) {
            firstColIndex++;
          }
          if (firstColIndex < columns.length) {
            navigateToCell(flattenedRows[currentRowIndex + 1].row.id, columns[firstColIndex].id);
            return;
          }
        }
        // 是最后一行最后一列，添加新行
        const newRow = createDefaultRow(columns);
        setRows(prev => [...prev, newRow]);
        
        setTimeout(() => {
          const firstEditableCol = columns.find(col => col.type !== 'checkbox' && col.type !== 'select');
          if (firstEditableCol) {
            navigateToCell(newRow.id, firstEditableCol.id);
          }
          if (tableWrapperRef.current) {
            tableWrapperRef.current.scrollTop = tableWrapperRef.current.scrollHeight;
          }
        }, 0);
      }
    } else if (key === 'Enter') {
      // 找到第一个可编辑列
      const firstEditableCol = columns.find(col => col.type !== 'checkbox' && col.type !== 'select');
      
      // 检查是否是最后一行最后一个可编辑列
      const isLastRow = currentRowIndex === flattenedRows.length - 1;
      // 找到最后一个可编辑列的索引
      let lastEditableColIndex = columns.length - 1;
      while (lastEditableColIndex >= 0 && (columns[lastEditableColIndex].type === 'checkbox' || columns[lastEditableColIndex].type === 'select')) {
        lastEditableColIndex--;
      }
      const isLastEditableCol = currentColIndex === lastEditableColIndex;
      
      if (isLastRow && isLastEditableCol) {
        // 最后一行最后一个可编辑单元格，添加新行并进入编辑状态
        const newRow = createDefaultRow(columns);
        setRows(prev => [...prev, newRow]);
        
        // 自动聚焦到新行的第一个可编辑列
        setTimeout(() => {
          if (firstEditableCol) {
            navigateToCell(newRow.id, firstEditableCol.id);
          }
          // 滚动到底部
          if (tableWrapperRef.current) {
            tableWrapperRef.current.scrollTop = tableWrapperRef.current.scrollHeight;
          }
        }, 0);
      } else if (!isLastRow) {
        // 不是最后一行，移动到下一行的同一列
        navigateToCell(flattenedRows[currentRowIndex + 1].row.id, editingCell.colId);
      } else {
        // 是最后一行但不是最后一个可编辑单元格，退出编辑状态
        setEditingCell(null);
      }
    }
  }, [editingCell, columns, flattenedRows, scrollCellToVisible]);

  // 当 editingCell 变化时（Tab 键导航），更新浮动编辑器位置
  // 注意：双击进入编辑模式时，handleCellDoubleClick 已经设置了位置和 prevEditingCellRef
  useEffect(() => {
    if (!editingCell || !tableContainerRef.current) {
      prevEditingCellRef.current = null;
      return;
    }
    
    // 如果是同一个单元格，不需要重新计算位置（双击时会触发）
    if (prevEditingCellRef.current?.rowId === editingCell.rowId && 
        prevEditingCellRef.current?.colId === editingCell.colId) {
      return;
    }
    prevEditingCellRef.current = editingCell;
    
    // 查找对应的单元格 DOM 元素
    const cellSelector = `td[data-row-id="${editingCell.rowId}"][data-col-id="${editingCell.colId}"]`;
    const cell = tableContainerRef.current.querySelector(cellSelector) as HTMLElement;
    if (cell) {
      // 只有非固定列（colIndex > 0）才需要滚动使单元格完全可见
      const colIndex = columns.findIndex(c => c.id === editingCell.colId);
      const row = rows.find(r => r.id === editingCell.rowId);
      const isChildRowFirstColumn = colIndex === 0 && row?.parentId;
      
      if (colIndex > 0) {
        scrollCellToVisible(cell);
      }
      
      // 延迟更新位置，等待滚动完成
      setTimeout(() => {
        const cellRect = cell.getBoundingClientRect();
        const containerRect = tableContainerRef.current!.getBoundingClientRect();
        // 子记录第一列有左边框，需要调整位置
        const leftOffset = isChildRowFirstColumn ? 1 : 0;
        // 编辑框完全覆盖单元格内容区域，向上偏移 1px 补偿文本位置差异
        setFloatingEditorPosition({
          top: cellRect.top - containerRect.top - 1,
          left: cellRect.left - containerRect.left + leftOffset,
          width: cellRect.width - leftOffset,
          height: cellRect.height,
        });
      }, colIndex > 0 ? 50 : 0);
    }
  }, [editingCell, columns, rows, scrollCellToVisible]);

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

  const handleCellPolish = useCallback((value: string, type: string) => {
    console.log('[TableDesigner] 润色:', value, '类型:', type);
    // TODO: 根据类型调用不同的润色 API
  }, []);

  // 打开翻译面板
  const handleCellTranslate = useCallback((value: string) => {
    if (!selectedCell || !cellToolbar) return;
    
    // 翻译面板宽度
    const panelWidth = 320;
    
    // 获取容器位置，用于计算相对坐标
    const containerRect = tableDesignerRef.current?.getBoundingClientRect();
    const containerWidth = containerRect?.width || window.innerWidth;
    
    // 默认位置：紧贴单元格右侧（相对于容器的坐标）
    let panelX = cellToolbar.position.x + cellToolbar.cellWidth + 4;
    const panelY = cellToolbar.position.y;
    
    // 如果面板会溢出容器右边界，显示在单元格左侧
    if (panelX + panelWidth + 20 > containerWidth) {
      panelX = cellToolbar.position.x - panelWidth - 4;
      // 如果左侧也放不下，就贴着右边界显示
      if (panelX < 10) {
        panelX = containerWidth - panelWidth - 20;
      }
    }
    
    setTranslatePanelPosition({ x: panelX, y: panelY });
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

  // 导入表格文件
  const handleImportTable = useCallback(async () => {
    const importService = getTableImportService();
    const result = await importService.openAndImport();

    if (!result.success) {
      if (result.error !== '用户取消选择') {
        notification.error(`导入失败: ${result.error}`);
      }
      return;
    }

    if (result.columns.length === 0 || result.rows.length === 0) {
      notification.error('导入失败: 文件为空或格式不正确');
      return;
    }

    // 转换列信息
    const newColumns: TableColumn[] = result.columns.map(col => ({
      id: generateId(),
      name: col.name,
      type: col.type as ColumnType,
      width: 150,
    }));

    // 转换行数据
    const newRows: TableRow[] = result.rows.map(row => {
      const cells: Record<string, CellValue> = {};
      result.columns.forEach((col, index) => {
        const newColId = newColumns[index].id;
        const value = row[col.name];
        cells[newColId] = value as CellValue;
      });
      return {
        id: generateId(),
        cells,
      };
    });

    setColumns(newColumns);
    setRows(newRows);
    notification.success(`导入成功: 共 ${result.totalRows} 行数据`);
  }, []);


  return (
    <div className="table-designer" ref={tableDesignerRef}>
      {/* 头部 */}
      <div className="table-designer-header">
        <div className="header-left">
          <input
            type="text"
            className="table-name-input"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder={translateText('tableDesigner.header.namePlaceholder', 'Table Name')}
          />
        </div>
        <div className="header-actions">
          <span 
            className={`action-btn ${(isGenerating || showDiscardButton) ? 'disabled' : ''}`} 
            onClick={() => !(isGenerating || showDiscardButton) && handleImportTable()} 
            title={translateText('tableDesigner.header.importTableTitle', 'Import Table File (CSV, Excel)')}
          >
            <Icon name="import" iconSet="ui" size={16} />
          </span>
        </div>
      </div>

      {/* 表格工具栏 */}
      <TableToolbar
        columns={columns}
        hiddenColumns={hiddenColumns}
        rowHeight={rowHeight}
        onToggleColumnVisibility={handleToggleColumnVisibility}
        onFieldSettings={() => {
          // 字段设置菜单由 TableToolbar 内部管理
        }}
        onFilter={() => {
          // TODO: 筛选功能
        }}
        onSort={() => {
          // TODO: 排序功能
        }}
        onRowHeightChange={setRowHeight}
        onFillColor={() => {
          setShowFillColorPanel(!showFillColorPanel);
          // 打开填色面板时关闭查询条件面板
          if (!showFillColorPanel) {
            setShowQueryConditionPanel(false);
          }
        }}
        onAI={() => {
          const newShowAIInputBar = !showAIInputBar;
          setShowAIInputBar(newShowAIInputBar);
          // 关闭 AI 输入框时，同时关闭查询条件面板并重置命令类型
          if (!newShowAIInputBar) {
            setShowQueryConditionPanel(false);
            setCurrentCommandType(null);
          }
        }}
      />

      {/* 主体内容 */}
      <div className="table-designer-body">
        <div className="table-designer-content" ref={tableDesignerContentRef}>
          {/* 顶部延伸线 - 放在 table-designer-content 层级 */}
          <div 
            ref={topExtendLineRef}
            className="table-extend-line top-line" 
          />
          {/* 底部延伸线 */}
          <div 
            ref={bottomExtendLineRef}
            className="table-extend-line bottom-line" 
          />
          <div className="table-container" ref={tableContainerRef}>
            <TanStackTableCore
              columns={columns}
              rows={rows}
              hiddenColumns={hiddenColumns}
              rowHeight={rowHeight}
              selectedRows={selectedRows}
              selectedCell={selectedCell}
              selectedColumn={selectedColumn}
              editingCell={editingCell}
              contextMenuRowId={cellContextMenu?.rowId}
              isGenerating={isGenerating}
              tableWrapperRef={tableWrapperRef}
              tableRef={tableRef}
              selectedCellRange={selectedCellRange}
              onSelectedCellRangeChange={setSelectedCellRange}
              onRowsChange={setRows}
              onSelectedRowsChange={setSelectedRows}
              onSelectedCellChange={(cell) => {
                setSelectedCell(cell);
                setSelectedColumn(null); // 选中单元格时清除列选中
                if (!cell) {
                  setCellToolbar(null);
                }
              }}
              onSelectedColumnChange={setSelectedColumn}
              onEditingCellChange={(cell, event) => {
                if (cell && event) {
                  handleCellDoubleClick(cell.rowId, cell.colId, event);
                } else if (cell) {
                  setEditingCell(cell);
                } else {
                  setEditingCell(null);
                }
              }}
              onCellUpdate={handleUpdateCell}
              onAddRow={handleAddRow}
              onAddColumn={handleAddColumn}
              onColumnMenuOpen={handleColumnMenuOpen}
              onCellContextMenu={handleCellContextMenu}
              onCellClick={handleCellClick}
              onAddChildRow={handleAddChildRow}
              onToggleRowExpanded={handleToggleRowExpanded}
              onColumnWidthChange={handleColumnWidthChange}
              renderCellContent={renderCellContent}
            />
            {/* 固定位置的选择边框 - 添加行时使用 */}
            {fixedSelectedCell && !editingCell && (
              <div
                className="fixed-cell-selection"
                style={{
                  position: 'absolute',
                  top: fixedSelectedCell.position.top,
                  left: fixedSelectedCell.position.left,
                  width: fixedSelectedCell.position.width,
                  height: fixedSelectedCell.position.height,
                  border: '2px solid var(--ws-focus-border)',
                  pointerEvents: 'none',
                  zIndex: 15,
                  boxSizing: 'border-box',
                }}
              />
            )}
            {/* 浮动单元格编辑器 - 渲染在 table-container 内 */}
            {editingCell && (() => {
              // 计算子记录第一列的额外内边距
              const colIndex = columns.findIndex(c => c.id === editingCell.colId);
              const row = rows.find(r => r.id === editingCell.rowId);
              const isChildRowFirstColumn = colIndex === 0 && row?.parentId;
              const extraPaddingLeft = isChildRowFirstColumn ? 12 : 0;
              
              return (
                <FloatingCellEditor
                  key={`${editingCell.rowId}-${editingCell.colId}`}
                  visible={true}
                  position={floatingEditorPosition}
                  value={getCellValue(editingCell.rowId, editingCell.colId)}
                  columnType={columns.find(c => c.id === editingCell.colId)?.type || 'text'}
                  extraPaddingLeft={extraPaddingLeft}
                  onValueChange={(value) => {
                    handleUpdateCell(editingCell.rowId, editingCell.colId, value);
                  }}
                  onClose={handleFloatingEditorClose}
                  onKeyNavigation={handleFloatingEditorKeyNavigation}
                />
              );
            })()}
          </div>
          {/* 查询条件面板 */}
          {showQueryConditionPanel && (
            <QueryConditionPanel
              columns={columns}
              onQuery={handleQueryWithConditions}
              onClose={() => setShowQueryConditionPanel(false)}
            />
          )}
          {/* 填色条件面板 */}
          {showFillColorPanel && (
            <QueryConditionPanel
              columns={columns}
              mode="fillColor"
              onQuery={() => {}}
              onFillColor={handleFillColorCondition}
              onClearAllFillColor={handleClearAllFillColor}
              onClose={() => setShowFillColorPanel(false)}
            />
          )}
          {/* 生成操作栏：生成中显示进度和取消，生成完成显示放弃/保留 */}
          {(isGenerating || showDiscardButton) && (
            <div className="generate-action-bar">
              {isGenerating ? (
                <>
                  <span className="generate-progress-text">{generateProgress}</span>
                  <span className="generate-action-btn cancel" onClick={handleCancelGenerate}>
                    取消
                  </span>
                </>
              ) : (
                <>
                  <span className="generate-action-btn discard" onClick={handleDiscardGenerate}>
                    放弃
                  </span>
                  <span className="generate-action-btn accept" onClick={handleAcceptGenerate}>
                    保留
                  </span>
                </>
              )}
            </div>
          )}
          {/* AI 输入栏 */}
          {showAIInputBar && (
            <AIInputBar
              placeholder={translateText('tableDesigner.ai.placeholder', 'Describe what you want...')}
              systemPrompt={getTableDesignerSystemPrompt()}
              onGenerate={handleAIGenerate}
              customGenerate={customGenerateFunction}
              onCancel={handleCancelGenerate}
              enableCommands={true}
              disabled={currentCommandType === 'query'}
              hideLoadingIndicator={true}
              externalLoading={isGenerating}
              onCommand={(command) => {
                console.log('[TableDesigner] 收到命令:', command.type, command.content);
                if (command.type === 'query') {
                  handleQueryCommand(command.content);
                }
              }}
              onCommandChange={(commandType) => {
                // 保存当前命令类型
                setCurrentCommandType(commandType);
                // 当切换到查询命令时，显示查询条件面板
                if (commandType === 'query') {
                  setShowQueryConditionPanel(true);
                } else {
                  setShowQueryConditionPanel(false);
                }
              }}
              suggestions={[
                // 生成表格建议
                {
                  id: 'g1',
                  label: translateText('tableDesigner.ai.suggestions.userInfo.label', 'Generate User Info Table'),
                  prompt: translateText(
                    'tableDesigner.ai.suggestions.userInfo.prompt',
                    'Generate a user information table with name, age, email, phone, and address fields, plus 5 sample rows.',
                  ),
                  commandType: 'generate',
                },
                {
                  id: 'g2',
                  label: translateText('tableDesigner.ai.suggestions.productList.label', 'Generate Product List'),
                  prompt: translateText(
                    'tableDesigner.ai.suggestions.productList.prompt',
                    'Generate a product list table with product name, price, inventory, category, and availability fields, plus 5 sample rows.',
                  ),
                  commandType: 'generate',
                },
                {
                  id: 'g3',
                  label: translateText('tableDesigner.ai.suggestions.taskList.label', 'Generate Task List'),
                  prompt: translateText(
                    'tableDesigner.ai.suggestions.taskList.prompt',
                    'Generate a task list table with task name, owner, due date, priority, and completion status fields, plus 5 sample rows.',
                  ),
                  commandType: 'generate',
                },
                {
                  id: 'g4',
                  label: translateText('tableDesigner.ai.suggestions.orderLog.label', 'Generate Order Records'),
                  prompt: translateText(
                    'tableDesigner.ai.suggestions.orderLog.prompt',
                    'Generate an order records table with order number, customer name, product, amount, order time, and status fields, plus 5 sample rows.',
                  ),
                  commandType: 'generate',
                },
                {
                  id: 'g5',
                  label: translateText('tableDesigner.ai.suggestions.attendance.label', 'Generate Attendance Table'),
                  prompt: translateText(
                    'tableDesigner.ai.suggestions.attendance.prompt',
                    'Generate an attendance table with employee name, department, date, start time, end time, and work hours fields, plus 5 sample rows.',
                  ),
                  commandType: 'generate',
                },
              ]}
            />
          )}
        </div>


        {/* 查询结果面板 */}
        {(queryResult || isQuerying) && (
          <div 
            className={`query-result-panel ${isQueryPanelFullscreen ? 'fullscreen' : ''}`}
            style={!isQueryPanelFullscreen ? { width: queryPanelWidth } : undefined}
          >
            <div 
              className={`query-panel-resize-handle ${isResizingQueryPanel ? 'resizing' : ''}`}
              onMouseDown={handleQueryPanelResizeStart}
            />
            <div className="query-result-header">
              <span className="query-result-title">
                {translateText('tableDesigner.queryResult.title', 'Query Results')}
              </span>
              <div className="query-result-actions">
                <span 
                  className="query-result-fullscreen"
                  onClick={() => setIsQueryPanelFullscreen(!isQueryPanelFullscreen)}
                  title={isQueryPanelFullscreen
                    ? translateText('tableDesigner.queryResult.exitFullscreen', 'Exit Fullscreen')
                    : translateText('tableDesigner.queryResult.fullscreen', 'Fullscreen')}
                >
                  <Icon iconSet="ui" name={isQueryPanelFullscreen ? 'minimize-2' : 'maximize-2'} size={14} />
                </span>
                <span 
                  className="query-result-close"
                  onClick={() => { setQueryResult(null); setIsQueryPanelFullscreen(false); }}
                  title={translateText('tableDesigner.queryResult.close', 'Close')}
                >
                  <Icon name="close" size={14} />
                </span>
              </div>
            </div>
            <div className="query-result-content">
              {isQuerying ? (
                <div className="query-result-loading">
                  <Icon name="loader" size={24} />
                  <p>{translateText('tableDesigner.queryResult.loading', 'Querying...')}</p>
                </div>
              ) : queryResult ? (
                <>
                  <div className={`query-result-status ${queryResult.success ? 'success' : 'error'}`}>
                    <div className="query-result-status-left">
                      <Icon name={queryResult.success ? 'check' : 'error'} iconSet="ui" size={16} />
                      <span>{queryResult.message}</span>
                    </div>
                    <div className="query-result-search">
                      <input
                        type="text"
                        className="query-search-input"
                        placeholder={translateText('tableDesigner.queryResult.searchPlaceholder', 'Search...')}
                        value={searchKeyword}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                      />
                      <span
                        className="query-search-btn"
                        onClick={handleSearch}
                        title={translateText('tableDesigner.queryResult.searchPlaceholder', 'Search...')}
                      >
                        <Icon name="search" iconSet="ui" size={14} />
                      </span>
                    </div>
                  </div>
                  {queryResult.data && queryResult.data.length > 0 ? (
                    <div className="query-result-data">
                      <div className="query-result-table-wrapper">
                        <table className="query-result-table">
                          <thead>
                            <tr>
                              {Object.keys(queryResult.data[0]).filter(key => key !== '_rowIndex' && key !== '_rowId').map(key => (
                                <th key={key}>{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.data
                              .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                              .map((row, rowIndex) => {
                                const actualIndex = (currentPage - 1) * PAGE_SIZE + rowIndex;
                                return (
                                  <tr key={actualIndex}>
                                    {Object.entries(row).filter(([key]) => key !== '_rowIndex' && key !== '_rowId').map(([key, value]) => (
                                      <td 
                                        key={key}
                                        className={editingQueryCell?.rowIndex === actualIndex && editingQueryCell?.columnName === key ? 'editing' : ''}
                                        onDoubleClick={() => handleQueryCellDoubleClick(actualIndex, key, value)}
                                      >
                                        {editingQueryCell?.rowIndex === actualIndex && editingQueryCell?.columnName === key ? (
                                          <input
                                            type="text"
                                            className="query-cell-input"
                                            value={editingQueryValue}
                                            onChange={e => setEditingQueryValue(e.target.value)}
                                            onBlur={handleQueryCellEditComplete}
                                            onKeyDown={handleQueryCellKeyDown}
                                            autoFocus
                                          />
                                        ) : (
                                          String(value ?? '')
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                      {/* 分页控件 */}
                      {queryResult.data.length > PAGE_SIZE && (
                        <div className="query-result-pagination">
                          <span 
                            className={`pagination-btn ${currentPage === 1 ? 'disabled' : ''}`}
                            onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                            title={translateText('tableDesigner.queryResult.previousPage', 'Previous Page')}
                          >
                            <Icon name="chevron-left" size={14} />
                          </span>
                          <span className="pagination-info">
                            {currentPage} / {Math.ceil(queryResult.data.length / PAGE_SIZE)}
                          </span>
                          <span 
                            className={`pagination-btn ${currentPage >= Math.ceil(queryResult.data.length / PAGE_SIZE) ? 'disabled' : ''}`}
                            onClick={() => currentPage < Math.ceil(queryResult.data.length / PAGE_SIZE) && setCurrentPage(currentPage + 1)}
                            title={translateText('tableDesigner.queryResult.nextPage', 'Next Page')}
                          >
                            <Icon name="chevron-right" size={14} />
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="query-result-empty">
                      {translateText('tableDesigner.queryResult.empty', 'No data available')}
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* 数据查看器面板 */}
        {showDataViewer && (
          <div 
            className="data-viewer-panel"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="data-viewer-header">
              <span className="data-viewer-title">
                {translateText('tableDesigner.dataViewer.title', 'Data Viewer')}
              </span>
              <span 
                className="data-viewer-close"
                onClick={() => setShowDataViewer(false)}
                title={translateText('tableDesigner.dataViewer.close', 'Close')}
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
                              <span className="item-label">
                                {translateText('tableDesigner.dataViewer.wordWrap', 'Word Wrap')}
                              </span>
                            </div>
                            <div 
                              className="format-menu-item"
                              onClick={() => setDataViewerAutoFormat(!dataViewerAutoFormat)}
                            >
                              <span className="item-check">{dataViewerAutoFormat && <Icon name="check" size={12} />}</span>
                              <span className="item-label">
                                {translateText('tableDesigner.dataViewer.autoFormat', 'Auto Format')}
                              </span>
                            </div>
                          </div>
                          <div className="format-menu-divider" />
                          <div className="format-menu-section encoding-section">
                            <div className="section-title">
                              {translateText('tableDesigner.dataViewer.encoding', 'Encoding')}
                            </div>
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
                  <p>{translateText('tableDesigner.dataViewer.empty', 'Select a cell to view data')}</p>
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

      {/* 单元格右键菜单 */}
      {cellContextMenu && (
        <ContextMenu
          items={buildCellContextMenuItems(cellContextMenu.rowId)}
          position={cellContextMenu.position}
          onClose={handleCloseCellContextMenu}
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
            <AlertDialogTitle>
              {translateText('tableDesigner.downloadModelDialog.title', 'Download Translation Model')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translateText(
                'tableDesigner.downloadModelDialog.description',
                'No local translation model was found. Download it in the terminal and then try translating again.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translateText('tableDesigner.downloadModelDialog.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmModelDownload}>
              {translateText('tableDesigner.downloadModelDialog.download', 'Download')}
            </AlertDialogAction>
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
