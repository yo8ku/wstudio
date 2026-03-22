/**
 * 通用分组上下文菜单组件。
 * 用于渲染带分组、图标和快捷键的浮层菜单。
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './GroupedContextMenu.scss';

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface MenuGroup {
  id: string;
  items: MenuItem[];
}

export interface GroupedContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  menuGroups: MenuGroup[];
  onClose: () => void;
}

export const GroupedContextMenu: React.FC<GroupedContextMenuProps> = ({
  visible,
  x,
  y,
  menuGroups,
  onClose
}) => {
  
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [isPositionReady, setIsPositionReady] = useState(false);

  // 璋冩暣鑿滃崟浣嶇疆锛岄槻姝㈣秴鍑鸿鍥?
  useLayoutEffect(() => {
    if (!visible) {
      setIsPositionReady(false);
      return;
    }

    const menu = menuRef.current;
    if (!menu) {
      setPosition({ x, y });
      setIsPositionReady(true);
      return;
    }

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + menuWidth > viewportWidth) {
      adjustedX = viewportWidth - menuWidth - 10;
    }

    if (y + menuHeight > viewportHeight) {
      adjustedY = viewportHeight - menuHeight - 10;
    }

    adjustedX = Math.max(10, adjustedX);
    adjustedY = Math.max(10, adjustedY);

    setPosition({ x: adjustedX, y: adjustedY });
    setIsPositionReady(true);
  }, [visible, x, y, menuGroups]);

  // 鐐瑰嚮澶栭儴鍏抽棴鑿滃崟
  useEffect(() => {
    if (!visible) return;

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

    // 寤惰繜娣诲姞鐩戝惉鍣紝閬垮厤绔嬪嵆瑙﹀彂鍏抽棴
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose]);

  if (!visible) {
    return null;
  }

  const handleItemClick = (item: MenuItem) => {
  
    
    if (!item.disabled) {
      item.action();
      onClose();
    } else {
    }
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="grouped-context-menu"
      style={{
        left: `${position.x-13}px`,
        top: `${position.y}px`,
        opacity: isPositionReady ? 1 : 0,
        visibility: isPositionReady ? 'visible' : 'hidden',
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {menuGroups.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          {group.items.map((item) => {
            if (item.separator) {
              return (
                <div key={item.id} className="grouped-context-menu-separator" />
              );
            }

            return (
              <div
                key={item.id}
                className={`grouped-context-menu-item ${
                  item.disabled ? 'disabled' : ''
                }`}
                onClick={() => handleItemClick(item)}
              >
                <div className="grouped-context-menu-item-icon">
                  {item.icon}
                </div>
                <div className="grouped-context-menu-item-label">
                  {item.label}
                </div>
                {item.shortcut && (
                  <div className="grouped-context-menu-item-shortcut">
                    {item.shortcut}
                  </div>
                )}
              </div>
            );
          })}
          {groupIndex < menuGroups.length - 1 && (
            <div className="grouped-context-menu-separator" />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // 浣跨敤 Portal 娓叉煋鍒?body锛岄伩鍏嶈鐖跺鍣ㄨ鍓?
  return createPortal(menuContent, document.body);
};
















