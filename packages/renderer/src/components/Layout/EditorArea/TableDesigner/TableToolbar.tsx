/**
 * Table toolbar component.
 * Provides field settings, filtering, sorting, row height, fill color, and AI actions.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const ROW_HEIGHT_OPTIONS: Array<{ value: RowHeightType; key: string; defaultValue: string; icon: string }> = [
  { value: 'low', key: 'low', defaultValue: 'Low', icon: 'row-height-low' },
  { value: 'medium', key: 'medium', defaultValue: 'Medium', icon: 'row-height-medium' },
  { value: 'high', key: 'high', defaultValue: 'High', icon: 'row-height-high' },
  { value: 'extra-high', key: 'extraHigh', defaultValue: 'Extra High', icon: 'row-height-extra-high' },
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
  const { t } = useTranslation();
  const translateText = (key: string, defaultValue: string): string =>
    String(t(key, { defaultValue }));
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
            <span className="row-height-label">
              {translateText(
                `tableDesigner.toolbar.rowHeightOptions.${option.key}`,
                option.defaultValue,
              )}
            </span>
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
        <div className="field-settings-menu-header">
          {translateText('tableDesigner.toolbar.fieldSettings', 'Field Settings')}
        </div>
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
                      <span
                        className="field-lock-icon"
                        title={translateText('tableDesigner.toolbar.primaryKeyColumn', 'Primary Key Column')}
                      >
                        <Icon name="lock" size={14} />
                      </span>
                      <span
                        className="field-action-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        title={translateText('tableDesigner.toolbar.more', 'More')}
                      >
                        <Icon name="cell-more" size={16} />
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="field-action-icon"
                        onClick={(event) => handleToggleVisibility(column.id, event)}
                        title={translateText(
                          isHidden ? 'tableDesigner.toolbar.showColumn' : 'tableDesigner.toolbar.hideColumn',
                          isHidden ? 'Show Column' : 'Hide Column',
                        )}
                      >
                        <Icon name={isHidden ? 'eye-off' : 'eye'} size={14} />
                      </span>
                      <span
                        className="field-action-icon"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                        title={translateText('tableDesigner.toolbar.more', 'More')}
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
            title={translateText('tableDesigner.toolbar.fieldSettings', 'Field Settings')}
          >
            <Icon name="gear" size={16} />
            <span className="toolbar-item-label">
              {translateText('tableDesigner.toolbar.fieldSettings', 'Field Settings')}
            </span>
          </div>
          <div
            className="toolbar-item"
            onClick={onFilter}
            title={translateText('tableDesigner.toolbar.filter', 'Filter')}
          >
            <Icon name="filter" size={16} className="toolbar-icon" />
            <span className="toolbar-item-label">
              {translateText('tableDesigner.toolbar.filter', 'Filter')}
            </span>
          </div>
          <div
            className="toolbar-item"
            onClick={onSort}
            title={translateText('tableDesigner.toolbar.sort', 'Sort')}
          >
            <Icon name="sort-az" size={16} />
            <span className="toolbar-item-label">
              {translateText('tableDesigner.toolbar.sort', 'Sort')}
            </span>
          </div>
          <div
            ref={rowHeightRef}
            className={`toolbar-item ${showRowHeightMenu ? 'active' : ''}`}
            onClick={handleRowHeightClick}
            title={translateText('tableDesigner.toolbar.rowHeight', 'Row Height')}
          >
            <Icon name={ROW_HEIGHT_OPTIONS.find((option) => option.value === rowHeight)?.icon || 'row-height-medium'} size={16} />
            <span className="toolbar-item-label">
              {translateText('tableDesigner.toolbar.rowHeight', 'Row Height')}
            </span>
          </div>
          <div
            className="toolbar-item"
            onClick={onFillColor}
            title={translateText('tableDesigner.toolbar.fillColor', 'Fill Color')}
          >
            <Icon name="paint-bucket" size={16} />
            <span className="toolbar-item-label">
              {translateText('tableDesigner.toolbar.fillColor', 'Fill Color')}
            </span>
          </div>
        </div>
        <div className="table-toolbar-right">
          <div
            className="toolbar-item"
            onClick={onAI}
            title={translateText('tableDesigner.toolbar.ai', 'AI')}
          >
            <Icon name="sparkles" size={18} className="toolbar-icon" />
          </div>
        </div>
      </div>
      {renderFieldMenu()}
      {renderRowHeightMenu()}
    </>
  );
};
