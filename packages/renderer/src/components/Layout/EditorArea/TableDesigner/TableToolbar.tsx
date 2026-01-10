/**
 * 表格工具栏组件
 * 功能：提供表格的常用操作入口，包括字段设置、筛选、排序、行高、填色、AI等
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../Icons/Icon';
import type { TableColumn, ColumnType } from './types';
import './TableToolbar.scss';

/** 行高类型 */
export type RowHeightType = 'low' | 'medium' | 'high' | 'extra-high';

interface TableToolbarProps {
  columns?: TableColumn[];
  hiddenColumns?: Set<string>;
  rowHeight?: RowHeightType;
  onFieldSettings?: () => void;
  onToggleColumnVisibility?: (columnId: string) => void;
  onFilter?: () => void;
  onSort?: () => void;
  onRowHeightChange?: (height: RowHeightType) => void;
  onFillColor?: () => void;
  onAI?: () => void;
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
    password: 'eye-off',
  };
  return iconMap[type] || 'type-icon';
};


export const TableToolbar: React.FC<TableToolbarProps> = ({
  columns = [],
  hiddenColumns = new Set(),
  rowHeight = 'medium',
  onFieldSettings,
  onToggleColumnVisibility,
  onFilter,
  onSort,
  onRowHeightChange,
  onFillColor,
  onAI,
}) => {
  const [showFieldMenu, setShowFieldMenu] = useState(false);
  const [showRowHeightMenu, setShowRowHeightMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [rowHeightMenuPosition, setRowHeightMenuPosition] = useState({ top: 0, left: 0 });
  const fieldSettingsRef = useRef<HTMLDivElement>(null);
  const rowHeightRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowHeightMenuRef = useRef<HTMLDivElement>(null);

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
      if (
        rowHeightMenuRef.current &&
        !rowHeightMenuRef.current.contains(event.target as Node) &&
        rowHeightRef.current &&
        !rowHeightRef.current.contains(event.target as Node)
      ) {
        setShowRowHeightMenu(false);
      }
    };

    if (showFieldMenu || showRowHeightMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFieldMenu, showRowHeightMenu]);

  // 处理字段设置点击
  const handleFieldSettingsClick = () => {
    console.log('[TableToolbar] handleFieldSettingsClick, columns:', columns.length);
    if (fieldSettingsRef.current) {
      const rect = fieldSettingsRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowFieldMenu(!showFieldMenu);
    onFieldSettings?.();
  };

  // 处理列可见性切换
  const handleToggleVisibility = (columnId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onToggleColumnVisibility?.(columnId);
  };

  // 处理行高点击
  const handleRowHeightClick = () => {
    if (rowHeightRef.current) {
      const rect = rowHeightRef.current.getBoundingClientRect();
      setRowHeightMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
    setShowRowHeightMenu(!showRowHeightMenu);
    setShowFieldMenu(false); // 关闭其他菜单
  };

  // 处理行高选择
  const handleRowHeightSelect = (height: RowHeightType) => {
    onRowHeightChange?.(height);
    setShowRowHeightMenu(false);
  };

  // 行高选项配置
  const rowHeightOptions: { value: RowHeightType; label: string; icon: string }[] = [
    { value: 'low', label: '低', icon: 'row-height-low' },
    { value: 'medium', label: '中等', icon: 'row-height-medium' },
    { value: 'high', label: '高', icon: 'row-height-high' },
    { value: 'extra-high', label: '超高', icon: 'row-height-extra-high' },
  ];

  // 渲染行高菜单
  const renderRowHeightMenu = () => {
    if (!showRowHeightMenu) return null;

    return createPortal(
      <div
        ref={rowHeightMenuRef}
        className="row-height-menu"
        style={{
          position: 'fixed',
          top: rowHeightMenuPosition.top,
          left: rowHeightMenuPosition.left,
        }}
      >
        {rowHeightOptions.map((option) => (
          <div
            key={option.value}
            className={`row-height-menu-item ${rowHeight === option.value ? 'active' : ''}`}
            onClick={() => handleRowHeightSelect(option.value)}
          >
            <span className="row-height-icon">
              <Icon name={option.icon} iconSet="ui" size={16} />
            </span>
            <span className="row-height-label">{option.label}</span>
            {rowHeight === option.value && (
              <span className="row-height-check">
                <Icon name="check" iconSet="ui" size={14} />
              </span>
            )}
          </div>
        ))}
      </div>,
      document.body
    );
  };


  // 渲染字段设置菜单
  const renderFieldMenu = () => {
    if (!showFieldMenu || columns.length === 0) return null;

    return createPortal(
      <div
        ref={menuRef}
        className="field-settings-menu"
        style={{
          position: 'fixed',
          top: menuPosition.top,
          left: menuPosition.left,
        }}
      >
        <div className="field-settings-menu-header">字段设置</div>
        <div className="field-settings-menu-list">
          {columns.map((column, index) => {
            const isHidden = hiddenColumns.has(column.id);
            const isFirstColumn = index === 0;
            return (
              <div
                key={column.id}
                className={`field-settings-menu-item ${isHidden ? 'hidden-column' : ''}`}
              >
                <span className="field-type-icon">
                  <Icon name={getColumnTypeIcon(column.type)} size={14} />
                </span>
                <span className="field-name">{column.name}</span>
              <div className="field-actions">
                {isFirstColumn ? (
                  <>
                    <span className="field-lock-icon" title="主键列">
                      <Icon name="lock" size={14} />
                    </span>
                    <span
                      className="field-action-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: 更多操作
                      }}
                      title="更多"
                    >
                      <Icon name="cell-more" size={16} />
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className="field-action-icon"
                      onClick={(e) => handleToggleVisibility(column.id, e)}
                      title={isHidden ? '显示列' : '隐藏列'}
                    >
                      <Icon name={isHidden ? 'eye-off' : 'eye'} iconSet="ui" size={14} />
                    </span>
                    <span
                      className="field-action-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        // TODO: 更多操作
                      }}
                      title="更多"
                    >
                      <Icon name="cell-more" size={16} />
                    </span>
                  </>
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

  return (
    <>
      <div className="table-toolbar">
        <div className="table-toolbar-left">
          <div
            ref={fieldSettingsRef}
            className={`toolbar-item ${showFieldMenu ? 'active' : ''}`}
            onClick={handleFieldSettingsClick}
            title="字段设置"
          >
            <Icon name="gear" iconSet="ui" size={16} />
            <span className="toolbar-item-label">字段设置</span>
          </div>
          <div className="toolbar-item" onClick={onFilter} title="筛选">
            <i className="codicon codicon-filter" />
            <span className="toolbar-item-label">筛选</span>
          </div>
          <div className="toolbar-item" onClick={onSort} title="排序">
            <Icon name="sort-az" iconSet="ui" size={16} />
            <span className="toolbar-item-label">排序</span>
          </div>
          <div
            ref={rowHeightRef}
            className={`toolbar-item ${showRowHeightMenu ? 'active' : ''}`}
            onClick={handleRowHeightClick}
            title="行高"
          >
            <Icon name={rowHeightOptions.find(opt => opt.value === rowHeight)?.icon || 'row-height-medium'} iconSet="ui" size={16} />
            <span className="toolbar-item-label">行高</span>
          </div>
          <div className="toolbar-item" onClick={onFillColor} title="填色">
            <Icon name="paint-bucket" iconSet="ui" size={16} />
            <span className="toolbar-item-label">填色</span>
          </div>
        </div>
        <div className="table-toolbar-right">
          <div className="toolbar-item" onClick={onAI} title="AI">
            <i className="codicon codicon-sparkle" style={{ fontSize: '18px' }} />
          </div>
        </div>
      </div>
      {renderFieldMenu()}
      {renderRowHeightMenu()}
    </>
  );
};
