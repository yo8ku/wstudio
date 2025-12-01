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

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('wheel', handleWheel, listenerOptions);
    window.addEventListener('touchmove', handleTouchMove, listenerOptions);
    document.addEventListener('wheel', handleWheel, listenerOptions);
    document.addEventListener('touchmove', handleTouchMove, listenerOptions);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('wheel', handleWheel, listenerOptions);
      window.removeEventListener('touchmove', handleTouchMove, listenerOptions);
      document.removeEventListener('wheel', handleWheel, listenerOptions);
      document.removeEventListener('touchmove', handleTouchMove, listenerOptions);
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

    // 检测是否在屏幕右侧（右半部分）
    const isRightSide = position.x > viewportWidth / 2;
    
    if (isRightSide) {
      // 在右侧时，菜单向左显示（菜单右边缘对齐点击位置）
      nextX = position.x - rect.width;
      // 确保不会超出左边界
      if (nextX < 8) {
        nextX = Math.max(8, viewportWidth - rect.width - 8);
      }
    } else {
      // 在左侧时，菜单向右显示（菜单左边缘对齐点击位置）
    if (nextX + rect.width > viewportWidth) {
      nextX = Math.max(8, viewportWidth - rect.width - 8);
    }
    }

    // 检测底部空间是否不足
    const hasBottomSpace = position.y + rect.height <= viewportHeight;
    const hasTopSpace = position.y - rect.height >= 0;

    if (!hasBottomSpace && hasTopSpace) {
      // 底部空间不足且有足够顶部空间，向上显示
      nextY = Math.max(8, position.y - rect.height);
    } else if (!hasBottomSpace) {
      // 底部和顶部空间都不足，尽量显示在可见区域
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







