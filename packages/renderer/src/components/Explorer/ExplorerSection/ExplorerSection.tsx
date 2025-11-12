/**
 * Explorer Section 组件
 * 资源管理器面板（简化版，无动画）
 * 支持：新建文件、新建文件夹、刷新等操作
 */

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
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
  expanded?: boolean; // 受控的展开状态
  actions?: ActionButton[];
  children: React.ReactNode;
  onExpandChange?: (expanded: boolean) => void;
}

const ExplorerSection: React.FC<ExplorerSectionProps> = ({
  title,
  icon,
  defaultExpanded = true,
  expanded: controlledExpanded,
  actions = [],
  children,
  onExpandChange,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);

  // 使用受控或非受控模式
  const isControlled = controlledExpanded !== undefined;
  const isExpanded = isControlled ? controlledExpanded : internalExpanded;

  // 在组件挂载时通知父组件初始展开状态
  useEffect(() => {
    onExpandChange?.(defaultExpanded);
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
          <div className="explorer-section-trigger" onClick={handleToggle}>
            <ChevronDown
              className="explorer-section-chevron"
              style={{
                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            />
            {icon && <span className="explorer-section-icon">{icon}</span>}
            <span className="explorer-section-title-text">{title}</span>
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
                      action.onClick();
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
