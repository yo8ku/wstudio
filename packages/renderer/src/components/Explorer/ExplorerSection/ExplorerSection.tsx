/**
 * Explorer Section 组件
 * 统一资源管理器分区标题、折叠行为与操作按钮。
 */

import React, { useEffect, useState } from 'react';
import { Icon } from '../../Icons/Icon';
import './ExplorerSection.scss';

export interface ActionButton {
  id: string;
  icon: React.ReactNode;
  tooltip?: string;
  onClick: (event?: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}

export interface ExplorerSectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  preserveTitleCase?: boolean;
  toggleIconMode?: 'default' | 'folder-on-idle' | 'form-on-idle' | 'editors-on-idle';
  actions?: ActionButton[];
  children: React.ReactNode;
  onExpandChange?: (expanded: boolean) => void;
}

const ExplorerSection: React.FC<ExplorerSectionProps> = ({
  title,
  icon,
  defaultExpanded = true,
  expanded: controlledExpanded,
  preserveTitleCase = false,
  toggleIconMode = 'default',
  actions = [],
  children,
  onExpandChange,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;
  const useFolderIdleIcon = toggleIconMode === 'folder-on-idle';
  const useFormIdleIcon = toggleIconMode === 'form-on-idle';
  const useEditorsIdleIcon = toggleIconMode === 'editors-on-idle';

  useEffect(() => {
    if (!isControlled) {
      onExpandChange?.(defaultExpanded);
    }
  }, []);

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(newExpanded);
    }
    onExpandChange?.(newExpanded);
  };

  return (
    <div className="explorer-section-accordion">
      <div className="explorer-section-item">
        <div className="explorer-section-header-wrapper">
          <div
            className={`explorer-section-trigger ${
              useFolderIdleIcon ? 'explorer-section-trigger--folder-idle' : ''
            } ${
              useFormIdleIcon ? 'explorer-section-trigger--form-idle' : ''
            } ${
              useEditorsIdleIcon ? 'explorer-section-trigger--editors-idle' : ''
            }`}
            onClick={handleToggle}
          >
            <span className="explorer-section-toggle-icon">
              {useFolderIdleIcon && <i className="codicon codicon-folder explorer-section-folder-icon" />}
              {useFormIdleIcon && <Icon name="table-properties" size={16} className="explorer-section-form-icon" />}
              {useEditorsIdleIcon && <i className="codicon codicon-files explorer-section-editors-icon" />}
              <i
                className={`codicon ${
                  isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right'
                } explorer-section-chevron`}
              />
            </span>
            {icon && <span className="explorer-section-icon">{icon}</span>}
            <span
              className={`explorer-section-title-text ${
                preserveTitleCase ? 'explorer-section-title-text--preserve-case' : ''
              }`}
            >
              {title}
            </span>
          </div>
          {actions.length > 0 && (
            <div className="explorer-section-actions">
              {actions.map((action) => (
                <button
                  key={action.id}
                  className="explorer-action-button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!action.disabled) {
                      action.onClick(e);
                    }
                  }}
                  disabled={action.disabled}
                  title={action.tooltip}
                  aria-label={action.tooltip}
                >
                  {action.icon}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="explorer-section-content"
          style={{
            display: isExpanded ? 'flex' : 'none',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default ExplorerSection;
