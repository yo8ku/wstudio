/**
 * 内联表格预览组件
 * 功能：在 CodeMirror 编辑器中渲染表单引用为可视化表格
 * 描述：显示表单的列结构和数据预览
 */

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icons/Icon';
import { tableReferenceService, type FormDetail } from '../../../services/tableReference/TableReferenceService';
import type { TableColumn, TableRow, CellValue } from '../../Layout/EditorArea/TableDesigner/types';
import { CustomScrollbar, CustomScrollbarRef } from '../../common/CustomScrollbar';
import './InlineTablePreview.scss';

/** 组件 Props */
interface InlineTablePreviewProps {
  /** 表单 ID */
  formId: string;
  /** 表单名称 */
  formName: string;
  /** 初始展开状态 */
  initialExpanded?: boolean;
  /** 初始显示全部行状态 */
  initialShowAllRows?: boolean;
  /** 初始隐藏列集合 */
  initialHiddenColumns?: Set<string>;
  /** 展开状态变化回调 */
  onExpandedChange?: (expanded: boolean) => void;
  /** 显示全部行状态变化回调 */
  onShowAllRowsChange?: (showAll: boolean) => void;
  /** 隐藏列变化回调 */
  onHiddenColumnsChange?: (hidden: Set<string>) => void;
  /** 点击表格回调 */
  onClick?: () => void;
  /** 删除引用回调 */
  onDelete?: () => void;
}

/**
 * 格式化单元格值显示
 */
function formatCellValue(value: CellValue, columnType: string): string {
  if (value === null || value === undefined) {
    return '-';
  }

  switch (columnType) {
    case 'checkbox':
      return value ? '[x]' : '[ ]';
    case 'multiselect':
    case 'tag':
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return String(value);
    case 'password':
      return '******';
    default:
      return String(value);
  }
}

/**
 * 获取列类型图标
 */
function getColumnIcon(type: string): string {
  const iconMap: Record<string, string> = {
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
    password: 'eye-off',
  };
  return iconMap[type] || 'type-icon';
}

/** 带层级信息的行 */
interface RowWithLevel extends TableRow {
  level: number;
}

/**
 * 构建层级行列表
 * 将扁平的行数据转换为带层级的树形结构
 */
function buildHierarchicalRows(rows: TableRow[]): RowWithLevel[] {
  const result: RowWithLevel[] = [];
  const rowMap = new Map<string, TableRow>();
  
  // 建立 ID 到行的映射
  rows.forEach(row => rowMap.set(row.id, row));
  
  // 计算每行的层级
  const getLevel = (row: TableRow, visited: Set<string> = new Set()): number => {
    if (!row.parentId || visited.has(row.id)) return 0;
    visited.add(row.id);
    const parent = rowMap.get(row.parentId);
    if (!parent) return 0;
    return 1 + getLevel(parent, visited);
  };
  
  // 递归添加行及其子行
  const addRowWithChildren = (parentId: string | null, level: number) => {
    rows
      .filter(row => (row.parentId || null) === parentId)
      .forEach(row => {
        result.push({ ...row, level });
        addRowWithChildren(row.id, level + 1);
      });
  };
  
  // 从顶级行开始构建
  addRowWithChildren(null, 0);
  
  // 如果结果为空（可能数据没有正确的父子关系），返回原始行
  if (result.length === 0) {
    return rows.map(row => ({ ...row, level: getLevel(row) }));
  }
  
  return result;
}

/**
 * 内联表格预览组件
 */
export const InlineTablePreview: React.FC<InlineTablePreviewProps> = ({
  formId,
  formName,
  initialExpanded = false,
  initialShowAllRows = false,
  initialHiddenColumns,
  onExpandedChange,
  onShowAllRowsChange,
  onHiddenColumnsChange,
  onClick,
  onDelete,
}) => {
  const [formDetail, setFormDetail] = useState<FormDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const [showAllRows, setShowAllRows] = useState(initialShowAllRows);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(initialHiddenColumns ?? new Set());
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedCell, setSelectedCell] = useState<{ rowId: string; columnId: string; value: CellValue; columnName: string; columnType: string } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [cellDetailPosition, setCellDetailPosition] = useState({ top: 0, left: 0, showAbove: false });
  const fieldSettingsRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cellDetailRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<CustomScrollbarRef>(null);

  // 加载表单详情
  useEffect(() => {
    let mounted = true;

    const loadFormDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const detail = await tableReferenceService.getFormDetail(formId);
        
        if (!mounted) return;

        if (detail) {
          setFormDetail(detail);
        } else {
          setError('表单不存在');
        }
      } catch (err) {
        if (!mounted) return;
        setError('加载失败');
        console.error('[InlineTablePreview] 加载表单详情失败:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadFormDetail();

    return () => {
      mounted = false;
    };
  }, [formId]);

  // 切换展开/收起
  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandedChange?.(newExpanded);
  };

  // 处理删除
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  // 阻止右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 切换显示全部行
  const handleShowAllRows = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newShowAll = !showAllRows;
    setShowAllRows(newShowAll);
    onShowAllRowsChange?.(newShowAll);
  };

  // 处理字段设置点击
  const handleFieldSettingsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (fieldSettingsRef.current) {
      const rect = fieldSettingsRef.current.getBoundingClientRect();
      const menuWidth = 220; // 菜单固定宽度
      const menuHeight = 350; // 菜单预估高度
      const viewportHeight = window.innerHeight;
      
      // 菜单右边缘与图标右边缘对齐
      const left = rect.right - menuWidth;
      
      // 计算顶部位置，如果底部溢出则显示在上方
      let top = rect.bottom + 4;
      if (top + menuHeight > viewportHeight - 20) {
        top = rect.top - menuHeight - 4;
      }
      
      setMenuPosition({ top, left });
    }
    setShowFieldMenu(!showFieldMenu);
  };

  // 切换列可见性
  const handleToggleColumnVisibility = (columnId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      onHiddenColumnsChange?.(next);
      return next;
    });
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        fieldSettingsRef.current &&
        !fieldSettingsRef.current.contains(event.target as Node)
      ) {
        setShowFieldMenu(false);
      }
      // 点击外部关闭单元格详情
      if (
        cellDetailRef.current &&
        !cellDetailRef.current.contains(event.target as Node)
      ) {
        setSelectedCell(null);
      }
    };

    if (showFieldMenu || selectedCell) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFieldMenu, selectedCell]);

  // 滚动时关闭弹窗（排除弹窗内部滚动）
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as Node;
      // 如果滚动发生在弹窗内部，不关闭
      if (cellDetailRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      if (selectedCell) {
        setSelectedCell(null);
      }
      if (showFieldMenu) {
        setShowFieldMenu(false);
      }
    };

    if (selectedCell || showFieldMenu) {
      // 监听所有可能的滚动容器
      window.addEventListener('scroll', handleScroll, true);
    }
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [selectedCell, showFieldMenu]);

  // 处理单元格点击
  const handleCellClick = (
    e: React.MouseEvent,
    rowId: string,
    columnId: string,
    columnName: string,
    columnType: string,
    value: CellValue
  ) => {
    e.stopPropagation();
    const cellElement = e.target as HTMLElement;
    const rect = cellElement.getBoundingClientRect();
    const detailWidth = 300;
    const detailMaxHeight = 250; // 与 CSS 中的 max-height 保持一致
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 滚动使单元格完整显示
    const contentElement = scrollbarRef.current?.getContentElement();
    if (contentElement) {
      const wrapperRect = contentElement.getBoundingClientRect();
      
      // 检查单元格是否被左边遮挡
      if (rect.left < wrapperRect.left) {
        const scrollAmount = wrapperRect.left - rect.left + 10;
        scrollbarRef.current?.setScrollLeft(scrollbarRef.current.getScrollLeft() - scrollAmount);
      }
      // 检查单元格是否被右边遮挡
      else if (rect.right > wrapperRect.right) {
        const scrollAmount = rect.right - wrapperRect.right + 10;
        scrollbarRef.current?.setScrollLeft(scrollbarRef.current.getScrollLeft() + scrollAmount);
      }
    }

    // 重新获取单元格位置（滚动后可能变化）
    const newRect = cellElement.getBoundingClientRect();

    // 计算位置，避免溢出
    let left = newRect.left;
    if (left + detailWidth > viewportWidth - 20) {
      left = newRect.right - detailWidth;
    }

    let top = newRect.bottom + 4;
    // 使用 max-height 来判断是否需要向上显示
    if (top + detailMaxHeight > viewportHeight - 20) {
      // 向上显示时，弹窗底部紧贴单元格顶部
      top = newRect.top - 4;
    }

    // 存储是否向上显示
    const showAbove = newRect.bottom + 4 + detailMaxHeight > viewportHeight - 20;

    setCellDetailPosition({ top, left, showAbove });
    setSelectedCell({ rowId, columnId, value, columnName, columnType });
    setSelectedRowId(null); // 选择单元格时清除行选择
    setShowFieldMenu(false);
  };

  // 处理行号点击（选择整行）
  const handleRowSelect = (e: React.MouseEvent, rowId: string) => {
    e.stopPropagation();
    setSelectedRowId(rowId === selectedRowId ? null : rowId);
    setSelectedCell(null); // 选择行时清除单元格选择
  };

  // 渲染加载状态
  if (loading) {
    return (
      <div className="inline-table-preview inline-table-preview--loading">
        <Icon iconSet="ui" name="table-properties" size={14} />
        <span className="inline-table-preview__name">{formName}</span>
        <span className="inline-table-preview__status">加载中...</span>
      </div>
    );
  }

  // 渲染错误状态
  if (error || !formDetail) {
    return (
      <div className="inline-table-preview inline-table-preview--error">
        <Icon iconSet="ui" name="table-properties" size={14} />
        <span className="inline-table-preview__name">{formName}</span>
        <span className="inline-table-preview__status">{error || '未找到'}</span>
        {onDelete && (
          <span className="inline-table-preview__delete" onClick={handleDelete}>
            <Icon iconSet="ui" name="delete" size={14} />
          </span>
        )}
      </div>
    );
  }

  const { columns, rows } = formDetail;
  // 过滤隐藏的列
  const visibleColumns = columns.filter(col => !hiddenColumns.has(col.id));
  // 构建层级行列表
  const hierarchicalRows = buildHierarchicalRows(rows);
  // 过滤掉没有数据的空行（cells 为空对象的行）
  const nonEmptyRows = hierarchicalRows.filter(
    (row: RowWithLevel) => Object.keys(row.cells).length > 0
  );
  const displayRows = showAllRows ? nonEmptyRows : nonEmptyRows.slice(0, 5);
  const hasMoreRows = nonEmptyRows.length > 5;

  // 渲染字段设置菜单
  const renderFieldMenu = () => {
    if (!showFieldMenu || columns.length === 0) return null;

    return createPortal(
      <div
        ref={menuRef}
        className="inline-table-field-menu"
        style={{
          position: 'fixed',
          top: menuPosition.top,
          left: menuPosition.left,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-table-field-menu__header">字段设置</div>
        <div className="inline-table-field-menu__list">
          {columns.map((column, index) => {
            const isHidden = hiddenColumns.has(column.id);
            const isFirstColumn = index === 0;
            return (
              <div
                key={column.id}
                className={`inline-table-field-menu__item ${isHidden ? 'hidden-column' : ''}`}
              >
                <span className="field-type-icon">
                  <Icon iconSet="ui" name={getColumnIcon(column.type)} size={14} />
                </span>
                <span className="field-name">{column.name}</span>
                <div className="field-actions">
                  {isFirstColumn ? (
                    <span className="field-lock-icon" title="主键列">
                      <Icon iconSet="ui" name="lock" size={14} />
                    </span>
                  ) : (
                    <span
                      className="field-action-icon"
                      onClick={(e) => handleToggleColumnVisibility(column.id, e)}
                      title={isHidden ? '显示列' : '隐藏列'}
                    >
                      <Icon iconSet="ui" name={isHidden ? 'eye-off' : 'eye'} size={14} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>,
      document.body
    );
  };

  // 格式化完整单元格值（用于详情显示）
  const formatFullCellValue = (value: CellValue, columnType: string): string => {
    if (value === null || value === undefined) {
      return '(空)';
    }

    switch (columnType) {
      case 'checkbox':
        return value ? '已勾选' : '未勾选';
      case 'multiselect':
      case 'tag':
        if (Array.isArray(value)) {
          return value.join('\n');
        }
        return String(value);
      case 'password':
        return String(value);
      default:
        return String(value);
    }
  };

  // 渲染单元格详情弹窗
  const renderCellDetail = () => {
    if (!selectedCell) return null;

    const style: React.CSSProperties = {
      position: 'fixed',
      left: cellDetailPosition.left,
    };

    // 向上显示时，使用 bottom 定位，弹窗底部紧贴单元格顶部
    if (cellDetailPosition.showAbove) {
      style.bottom = window.innerHeight - cellDetailPosition.top;
    } else {
      style.top = cellDetailPosition.top;
    }

    return createPortal(
      <div
        ref={cellDetailRef}
        className="inline-table-cell-detail"
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-table-cell-detail__header">
          <Icon iconSet="ui" name={getColumnIcon(selectedCell.columnType)} size={14} />
          <span className="inline-table-cell-detail__title">{selectedCell.columnName}</span>
          <span 
            className="inline-table-cell-detail__close" 
            onClick={() => setSelectedCell(null)}
          >
            <Icon iconSet="ui" name="close" size={14} />
          </span>
        </div>
        <div className="inline-table-cell-detail__content">
          <pre>{formatFullCellValue(selectedCell.value, selectedCell.columnType)}</pre>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div 
      className={`inline-table-preview ${isExpanded ? 'inline-table-preview--expanded' : ''}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    >
      {/* 表头 */}
      <div className="inline-table-preview__header">
        <span className="inline-table-preview__toggle" onClick={handleToggleExpand}>
          <Icon 
            iconSet="ui" 
            name={isExpanded ? 'chevron-down' : 'chevron-right'} 
            size={14} 
          />
        </span>
        <Icon iconSet="ui" name="table-properties" size={14} />
        <span className="inline-table-preview__name">{formDetail.name}</span>
        <span className="inline-table-preview__info">
          {columns.length} 列 · {nonEmptyRows.length} 行
        </span>
        <span
          ref={fieldSettingsRef}
          className={`inline-table-preview__settings ${showFieldMenu ? 'active' : ''}`}
          onClick={handleFieldSettingsClick}
          title="字段设置"
        >
          <Icon iconSet="ui" name="gear" size={14} />
        </span>
        {onDelete && (
          <span className="inline-table-preview__delete" onClick={handleDelete}>
            <Icon iconSet="ui" name="delete" size={14} />
          </span>
        )}
      </div>

      {/* 展开的表格内容 */}
      {isExpanded && visibleColumns.length > 0 && (
        <div className="inline-table-preview__content" onClick={(e) => e.stopPropagation()}>
          <CustomScrollbar
            ref={scrollbarRef}
            className="inline-table-preview__table-wrapper"
            direction="horizontal"
          >
            <table className="inline-table-preview__table">
              <thead>
                <tr>
                  <th className="row-number-header">#</th>
                  {visibleColumns.map((column: TableColumn) => (
                    <th key={column.id}>
                      <div className="th-content">
                        <Icon iconSet="ui" name={getColumnIcon(column.type)} size={12} />
                        <span>{column.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row: RowWithLevel, rowIndex: number) => {
                  const isRowSelected = selectedRowId === row.id;
                  return (
                    <tr key={row.id} className={`${row.level > 0 ? 'child-row' : ''} ${isRowSelected ? 'row-selected' : ''}`}>
                      <td 
                        className="row-number-cell"
                        onClick={(e) => handleRowSelect(e, row.id)}
                      >
                        {rowIndex + 1}
                      </td>
                      {visibleColumns.map((column: TableColumn, colIndex: number) => {
                        // 尝试用 column.id 或 column.name 获取单元格值
                        const cellValue = row.cells[column.id] ?? row.cells[column.name];
                        // 第一列添加层级缩进
                        const indent = colIndex === 0 ? row.level * 16 : 0;
                        const isSelected = selectedCell?.rowId === row.id && selectedCell?.columnId === column.id;
                        return (
                          <td 
                            key={column.id} 
                            className={isSelected ? 'selected' : ''}
                            style={indent > 0 ? { paddingLeft: `${10 + indent}px` } : undefined}
                            onClick={(e) => handleCellClick(e, row.id, column.id, column.name, column.type, cellValue)}
                          >
                            {formatCellValue(cellValue, column.type)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CustomScrollbar>
          {hasMoreRows && (
            <div 
              className={`inline-table-preview__more ${showAllRows ? 'expanded' : ''}`} 
              onClick={handleShowAllRows}
              title={showAllRows ? '收起' : `还有 ${nonEmptyRows.length - 5} 行`}
            >
              <Icon iconSet="ui" name="chevrons-down" size={16} />
            </div>
          )}
        </div>
      )}
      {renderFieldMenu()}
      {renderCellDetail()}
    </div>
  );
};

export default InlineTablePreview;
