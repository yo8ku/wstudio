/**
 * Explorer section container.
 * Handles section header rendering, expand state, and action buttons.
 */

import React, { useEffect, useState } from 'react';
import { Icon } from '../../Icons/Icon';
import './ExplorerSection.scss';

export interface ActionButton {
  id: string;
  icon: React.ReactNode;
  tooltip?: string;
  onClick: () => void;
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
    const nextExpanded = !isExpanded;
    if (!isControlled) {
      setInternalExpanded(nextExpanded);
    }
    onExpandChange?.(nextExpanded);
  };

  const handleActionKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    action: ActionButton,
  ): void => {
    if (action.disabled || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();
    action.onClick();
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
              {useFolderIdleIcon && (
                <Icon name="folder" size={16} className="explorer-section-folder-icon" />
              )}
              {useFormIdleIcon && (
                <Icon name="table-properties" size={16} className="explorer-section-form-icon" />
              )}
              {useEditorsIdleIcon && (
                <Icon name="files-folder" size={16} className="explorer-section-editors-icon" />
              )}
              <Icon
                name={isExpanded ? 'chevron-down' : 'chevron-right'}
                size={16}
                className="explorer-section-chevron"
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
                <div
                  key={action.id}
                  role="button"
                  tabIndex={action.disabled ? -1 : 0}
                  className={`explorer-action-button${action.disabled ? ' is-disabled' : ''}`}
                  aria-disabled={action.disabled}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    if (!action.disabled) {
                      action.onClick();
                    }
                  }}
                  onKeyDown={(event) => handleActionKeyDown(event, action)}
                  title={action.tooltip}
                  aria-label={action.tooltip}
                >
                  {action.icon}
                </div>
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
