/**
 * Sidebar 标题栏下拉菜单组件
 * 功能：为侧边栏标题栏提供下拉菜单
 */

import React, { useEffect, useRef } from 'react';
import './SidebarHeaderMenu.scss';

export interface SidebarHeaderMenuItem {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  actionIcon?: React.ReactNode;
  onClick?: () => void;
  onActionClick?: (e: React.MouseEvent) => void;
}

interface SidebarHeaderMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  items: SidebarHeaderMenuItem[];
}

export const SidebarHeaderMenu: React.FC<SidebarHeaderMenuProps> = ({
  isOpen,
  position,
  onClose,
  items,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="sidebar-header-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`separator-${index}`} className="sidebar-header-menu-separator" />;
        }

        return (
          <div
            key={item.id}
            className={`sidebar-header-menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={() => {
              if (!item.disabled && item.onClick) {
                item.onClick();
              }
            }}
          >
            <div className="sidebar-header-menu-check">
              {item.checked ? '✓' : ''}
            </div>
            {item.icon && (
              <div className="sidebar-header-menu-icon">{item.icon}</div>
            )}
            <div className="sidebar-header-menu-label">{item.label}</div>
            {item.action && (
              <div className="sidebar-header-menu-action">{item.action}</div>
            )}
            {item.actionIcon && (
              <div 
                className="sidebar-header-menu-action-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled && item.onActionClick) {
                    item.onActionClick(e);
                  }
                }}
              >
                {item.actionIcon}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
