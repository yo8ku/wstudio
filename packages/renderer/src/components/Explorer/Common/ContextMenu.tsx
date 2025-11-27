/**
 * 资源管理器通用右键菜单
 * 负责在 Explorer 区域内渲染上下文菜单及交互逻辑
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ContextMenu.scss';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  onClick?: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

/**
 * 右键菜单组件
 * 为文件树、编辑器等提供上下文菜单
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = position.x;
    let nextY = position.y;

    if (nextX + rect.width > viewportWidth) {
      nextX = Math.max(8, viewportWidth - rect.width - 8);
    }

    if (nextY + rect.height > viewportHeight) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    setAdjustedPosition((prev) => {
      if (prev.x === nextX && prev.y === nextY) {
        return prev;
      }
      return { x: nextX, y: nextY };
    });
  }, [position]);

  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="explorer-context-menu-separator" />;
    }

    return (
      <div
        key={item.id}
        className={`explorer-context-menu-item ${item.disabled ? 'disabled' : ''}`}
        onClick={() => {
          if (!item.disabled && item.onClick) {
            item.onClick();
            onClose();
          }
        }}
      >
        {item.icon && <span className="explorer-context-menu-icon">{item.icon}</span>}
        <span className="explorer-context-menu-label">{item.label}</span>
        {item.submenu && <span className="explorer-context-menu-arrow">›</span>}
      </div>
    );
  };

  return createPortal(
    <div
      ref={menuRef}
      className="explorer-context-menu"
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {items.map(renderMenuItem)}
    </div>,
    document.body
  );
};

export default ContextMenu;







