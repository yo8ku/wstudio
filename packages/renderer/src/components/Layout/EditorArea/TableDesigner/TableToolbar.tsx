/**
 * Table toolbar component.
 * Provides field settings, filtering, sorting, row height, fill color, and AI actions.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../Icons/Icon';
import type { TableColumn, ColumnType } from './types';
import './TableToolbar.scss';

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

const ROW_HEIGHT_OPTIONS: Array<{ value: RowHeightType; label: string; icon: string }> = [
  { value: 'low', label: '\u4f4e', icon: 'row-height-low' },
  { value: 'medium', label: '\u4e2d\u7b49', icon: 'row-height-medium' },
  { value: 'high', label: '\u9ad8', icon: 'row-height-high' },
  { value: 'extra-high', label: '\u8d85\u9ad8', icon: 'row-height-extra-high' },
];

function getColumnTypeIcon(type: ColumnType): string {
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
}

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

  const handleFieldSettingsClick = () => {
    if (fieldSettingsRef.current) {
      const rect = fieldSettingsRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }

    setShowFieldMenu((value) => !value);
    onFieldSettings?.();
  };

  const handleToggleVisibility = (columnId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    onToggleColumnVisibility?.(columnId);
  };

  const handleRowHeightClick = () => {
    if (rowHeightRef.current) {
      const rect = rowHeightRef.current.getBoundingClientRect();
      setRowHeightMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }

    setShowRowHeightMenu((value) => !value);
    setShowFieldMenu(false);
  };

  const handleRowHeightSelect = (height: RowHeightType) => {
    onRowHeightChange?.(height);
    setShowRowHeightMenu(false);
  };

  const renderRowHeightMenu = () => {
    if (!showRowHeightMenu) {
      return null;
    }

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
        {ROW_HEIGHT_OPTIONS.map((option) => (
          <div
            key={option.value}
            className={`row-height-menu-item ${rowHeight === option.value ? 'active' : ''}`}
            onClick={() => handleRowHeightSelect(option.value)}
          >
            <span className="row-height-icon">
              <Icon name={option.icon} size={16} />
            </span>
            <span className="row-height-label">{option.label}</span>
            {rowHeight === option.value && (
              <span className="row-height-check">
                <Icon name="check" size={14} />
              </span>
            )}
          </div>
        ))}
      </div>,
      document.body
    );
  };

  const renderFieldMenu = () => {
    if (!showFieldMenu || columns.length === 0) {
      return null;
    }

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
        <div className="field-settings-menu-header">{'\u5b57\u6bb5\u8bbe\u7f6e'}</div>
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
                      <span className="field-lock-icon" title={'\u4e3b\u952e\u5217'}>
                        <Icon name="lock" size={14} />
                      </span>
                      <span
                        className="field-action-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        title={'\u66f4\u591a'}
                      >
                        <Icon name="cell-more" size={16} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="field-action-icon"
                        onClick={(event) => handleToggleVisibility(column.id, event)}
                        title={isHidden ? '\u663e\u793a\u5217' : '\u9690\u85cf\u5217'}
                      >
                        <Icon name={isHidden ? 'eye-off' : 'eye'} size={14} />
                      </span>
                      <span
                        className="field-action-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        title={'\u66f4\u591a'}
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
            title={'\u5b57\u6bb5\u8bbe\u7f6e'}
          >
            <Icon name="gear" size={16} />
            <span className="toolbar-item-label">{'\u5b57\u6bb5\u8bbe\u7f6e'}</span>
          </div>
          <div className="toolbar-item" onClick={onFilter} title={'\u7b5b\u9009'}>
            <Icon name="filter" size={16} className="toolbar-icon" />
            <span className="toolbar-item-label">{'\u7b5b\u9009'}</span>
          </div>
          <div className="toolbar-item" onClick={onSort} title={'\u6392\u5e8f'}>
            <Icon name="sort-az" size={16} />
            <span className="toolbar-item-label">{'\u6392\u5e8f'}</span>
          </div>
          <div
            ref={rowHeightRef}
            className={`toolbar-item ${showRowHeightMenu ? 'active' : ''}`}
            onClick={handleRowHeightClick}
            title={'\u884c\u9ad8'}
          >
            <Icon name={ROW_HEIGHT_OPTIONS.find((option) => option.value === rowHeight)?.icon || 'row-height-medium'} size={16} />
            <span className="toolbar-item-label">{'\u884c\u9ad8'}</span>
          </div>
          <div className="toolbar-item" onClick={onFillColor} title={'\u586b\u8272'}>
            <Icon name="paint-bucket" size={16} />
            <span className="toolbar-item-label">{'\u586b\u8272'}</span>
          </div>
        </div>
        <div className="table-toolbar-right">
          <div className="toolbar-item" onClick={onAI} title="AI">
            <Icon name="sparkles" size={18} className="toolbar-icon" />
          </div>
        </div>
      </div>
      {renderFieldMenu()}
      {renderRowHeightMenu()}
    </>
  );
};
