/**
 * Monaco 编辑器右键菜单组件
 * 功能：为 Monaco 编辑器提供自定义右键菜单
 * 描述：完全继承主题配色，支持复制、粘贴、剪切等基础功能，以及打开内联聊天
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './MonacoContextMenu.scss';

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

export interface MonacoContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  menuGroups: MenuGroup[];
  onClose: () => void;
}

export const MonacoContextMenu: React.FC<MonacoContextMenuProps> = ({
  visible,
  x,
  y,
  menuGroups,
  onClose
}) => {
  console.log('[MonacoContextMenu] ========== 组件渲染 ==========');
  console.log('[MonacoContextMenu] visible:', visible);
  console.log('[MonacoContextMenu] menuGroups:', menuGroups);
  console.log('[MonacoContextMenu] menuGroups.length:', menuGroups.length);
  if (menuGroups.length > 0 && menuGroups[0].items.length > 0) {
    console.log('[MonacoContextMenu] 第一个菜单项:', menuGroups[0].items[0]);
    console.log('[MonacoContextMenu] inline-chat action:', menuGroups[0].items[0]?.action);
    console.log('[MonacoContextMenu] inline-chat disabled:', menuGroups[0].items[0]?.disabled);
  }
  
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // 调整菜单位置，防止超出视图
  useEffect(() => {
    if (visible && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // 检查右边界
      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // 检查底部边界
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      // 确保不超出左边界和顶部边界
      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [visible, x, y]);

  // 点击外部关闭菜单
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

    // 延迟添加监听器，避免立即触发关闭
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
    console.log('[MonacoContextMenu] ========== handleItemClick 被调用 ==========');
    console.log('[MonacoContextMenu] item:', item);
    console.log('[MonacoContextMenu] item.disabled:', item.disabled);
    console.log('[MonacoContextMenu] item.action:', item.action);
    
    if (!item.disabled) {
      console.log('[MonacoContextMenu] 执行 item.action()');
      item.action();
      onClose();
    } else {
      console.warn('[MonacoContextMenu] 菜单项被禁用，不执行 action');
    }
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="monaco-context-menu"
      style={{
        left: `${position.x-13}px`,
        top: `${position.y}px`,
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
                <div key={item.id} className="monaco-context-menu-separator" />
              );
            }

            return (
              <div
                key={item.id}
                className={`monaco-context-menu-item ${
                  item.disabled ? 'disabled' : ''
                }`}
                onClick={() => handleItemClick(item)}
              >
                <div className="monaco-context-menu-item-icon">
                  {item.icon}
                </div>
                <div className="monaco-context-menu-item-label">
                  {item.label}
                </div>
                {item.shortcut && (
                  <div className="monaco-context-menu-item-shortcut">
                    {item.shortcut}
                  </div>
                )}
              </div>
            );
          })}
          {groupIndex < menuGroups.length - 1 && (
            <div className="monaco-context-menu-separator" />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  // 使用 Portal 渲染到 body，避免被父容器裁剪
  return createPortal(menuContent, document.body);
};















