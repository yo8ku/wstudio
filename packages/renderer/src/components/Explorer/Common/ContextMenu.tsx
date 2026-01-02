/**
 * 资源管理器通用右键菜单
 * 功能：支持钻取式和悬浮式多级菜单的上下文菜单组件
 * 描述：支持两种子菜单模式：drill（钻取式，点击切换）和 hover（悬浮式，向右弹出）
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icons/Icon';
import './ContextMenu.scss';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  /** 子菜单类型：drill（钻取式，默认）或 hover（悬浮式） */
  submenuType?: 'drill' | 'hover';
  onClick?: () => void;
  /** 自定义渲染内容，用于输入框等特殊组件 */
  customContent?: React.ReactNode;
  /** 是否只显示自定义内容（不显示图标和标签） */
  customOnly?: boolean;
  /** 是否选中状态，显示勾选图标 */
  selected?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

interface MenuLevel {
  items: ContextMenuItem[];
  title?: string;
  parentId?: string;
}

interface HoverSubmenuState {
  itemId: string;
  items: ContextMenuItem[];
  position: { x: number; y: number };
  parentLeft: number;
}

/**
 * 悬浮子菜单组件
 */
const HoverSubmenu: React.FC<{
  items: ContextMenuItem[];
  position: { x: number; y: number };
  parentLeft: number;
  onClose: () => void;
  onItemClick: (item: ContextMenuItem) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({ items, position, parentLeft, onItemClick, onMouseEnter, onMouseLeave }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = position.x;
    let nextY = position.y;

    // 检测右侧空间是否足够
    if (nextX + rect.width > viewportWidth - 8) {
      // 向左展开：子菜单右边界对齐父菜单左边界
      nextX = parentLeft - rect.width - 4;
    }

    // 检测底部空间
    if (nextY + rect.height > viewportHeight - 8) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    // 确保不超出左边界
    if (nextX < 8) {
      nextX = 8;
    }

    setAdjustedPosition({ x: nextX, y: nextY });
  }, [position, parentLeft]);

  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="explorer-context-menu-separator" />;
    }

    return (
      <div
        key={item.id}
        className={`explorer-context-menu-item ${item.disabled ? 'disabled' : ''} ${!item.icon ? 'no-icon' : ''} ${item.selected ? 'selected' : ''}`}
        onClick={() => {
          if (!item.disabled && item.onClick) {
            onItemClick(item);
          }
        }}
      >
        {item.icon && (
          <span className="explorer-context-menu-icon">
            <Icon name={item.icon} size={14} />
          </span>
        )}
        <span className="explorer-context-menu-label">{item.label}</span>
        {item.selected && (
          <span className="explorer-context-menu-check">
            <Icon name="check" size={14} />
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      ref={menuRef}
      className="explorer-context-menu hover-submenu"
      style={{
        position: 'fixed',
        left: `${adjustedPosition.x}px`,
        top: `${adjustedPosition.y}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="explorer-context-menu-content">
        {items.map(renderMenuItem)}
      </div>
    </div>
  );
};

/**
 * 右键菜单组件
 * 为文件树、编辑器等提供上下文菜单，支持钻取式和悬浮式多级菜单
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  // 菜单层级栈，用于实现钻取式导航
  const [menuStack, setMenuStack] = useState<MenuLevel[]>([{ items }]);
  // 悬浮子菜单状态
  const [hoverSubmenu, setHoverSubmenu] = useState<HoverSubmenuState | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 当前显示的菜单层级
  const currentLevel = menuStack[menuStack.length - 1];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // 检查点击是否在任何菜单内
      const menus = document.querySelectorAll('.explorer-context-menu');
      let isInsideMenu = false;
      menus.forEach(menu => {
        if (menu.contains(target)) {
          isInsideMenu = true;
        }
      });
      if (!isInsideMenu) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (hoverSubmenu) {
          setHoverSubmenu(null);
        } else if (menuStack.length > 1) {
          // 返回上一级
          setMenuStack(prev => prev.slice(0, -1));
        } else {
          onClose();
        }
      }
    };

    const handleWheel = (event: WheelEvent) => {
      // 允许菜单内部滚动
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
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
  }, [onClose, menuStack.length, hoverSubmenu]);

  useEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = position.x;
    let nextY = position.y;

    // 检测右侧空间是否足够显示菜单
    const hasRightSpace = position.x + rect.width <= viewportWidth - 8;

    if (!hasRightSpace) {
      // 右侧空间不足，菜单右对齐到视口右边界
      nextX = viewportWidth - rect.width - 8;
      // 确保不超出左边界
      if (nextX < 8) {
        nextX = 8;
      }
    }

    const hasBottomSpace = position.y + rect.height <= viewportHeight;
    const hasTopSpace = position.y - rect.height >= 0;

    if (!hasBottomSpace && hasTopSpace) {
      nextY = Math.max(8, position.y - rect.height);
    } else if (!hasBottomSpace) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    setAdjustedPosition((prev) => {
      if (prev.x === nextX && prev.y === nextY) {
        return prev;
      }
      return { x: nextX, y: nextY };
    });
  }, [position, currentLevel]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // 进入钻取式子菜单
  const handleEnterDrillSubmenu = useCallback((item: ContextMenuItem) => {
    if (item.submenu && item.submenu.length > 0) {
      setHoverSubmenu(null);
      setMenuStack(prev => [...prev, {
        items: item.submenu!,
        title: item.label,
        parentId: item.id,
      }]);
    }
  }, []);

  // 显示悬浮子菜单
  const handleShowHoverSubmenu = useCallback((item: ContextMenuItem, event: React.MouseEvent) => {
    if (item.submenu && item.submenu.length > 0) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      // 获取父菜单的左边界位置
      const parentMenu = target.closest('.explorer-context-menu');
      const parentRect = parentMenu?.getBoundingClientRect();
      setHoverSubmenu({
        itemId: item.id,
        items: item.submenu,
        position: {
          x: rect.right + 4,
          y: rect.top,
        },
        parentLeft: parentRect?.left ?? rect.left,
      });
    }
  }, []);

  // 返回上一级
  const handleGoBack = useCallback(() => {
    if (menuStack.length > 1) {
      setMenuStack(prev => prev.slice(0, -1));
    }
  }, [menuStack.length]);

  // 处理菜单项点击
  const handleItemClick = useCallback((item: ContextMenuItem, e: React.MouseEvent) => {
    if (item.disabled) return;
    // 如果有自定义内容，不处理点击
    if (item.customOnly) return;

    if (item.submenu && item.submenu.length > 0) {
      if (item.submenuType === 'hover') {
        // 悬浮式子菜单
        handleShowHoverSubmenu(item, e);
      } else {
        // 钻取式子菜单（默认）
        handleEnterDrillSubmenu(item);
      }
    } else if (item.onClick) {
      // 执行点击回调并关闭菜单
      item.onClick();
      onClose();
    }
  }, [handleEnterDrillSubmenu, handleShowHoverSubmenu, onClose]);

  // 处理悬浮子菜单项点击
  const handleHoverSubmenuItemClick = useCallback((item: ContextMenuItem) => {
    if (item.onClick) {
      item.onClick();
    }
    onClose();
  }, [onClose]);

  // 处理鼠标进入菜单项
  const handleMouseEnter = useCallback((item: ContextMenuItem, e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    if (item.submenu && item.submenu.length > 0 && item.submenuType === 'hover') {
      // 在定时器外部先保存位置信息，因为事件对象在异步回调中可能失效
      const target = e.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      // 获取父菜单的左边界位置
      const parentMenu = target.closest('.explorer-context-menu');
      const parentRect = parentMenu?.getBoundingClientRect();
      const position = {
        x: rect.right + 4,
        y: rect.top,
      };
      const parentLeft = parentRect?.left ?? rect.left;

      hoverTimeoutRef.current = setTimeout(() => {
        setHoverSubmenu({
          itemId: item.id,
          items: item.submenu!,
          position,
          parentLeft,
        });
      }, 150);
    } else {
      // 关闭悬浮子菜单
      hoverTimeoutRef.current = setTimeout(() => {
        setHoverSubmenu(null);
      }, 150);
    }
  }, []);

  // 处理鼠标离开菜单项
  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // 鼠标离开菜单项时，延迟关闭悬浮子菜单
    // 如果鼠标移入子菜单，子菜单的 onMouseEnter 会清除这个定时器
    if (hoverSubmenu) {
      hoverTimeoutRef.current = setTimeout(() => {
        setHoverSubmenu(null);
      }, 150);
    }
  }, [hoverSubmenu]);

  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="explorer-context-menu-separator" />;
    }

    // 只显示自定义内容
    if (item.customOnly && item.customContent) {
      return (
        <div key={item.id} className="explorer-context-menu-custom">
          {item.customContent}
        </div>
      );
    }

    const hasSubmenu = item.submenu && item.submenu.length > 0;
    const isHoverActive = hoverSubmenu?.itemId === item.id;

    return (
      <div
        key={item.id}
        className={`explorer-context-menu-item ${item.disabled ? 'disabled' : ''} ${!item.icon ? 'no-icon' : ''} ${isHoverActive ? 'active' : ''}`}
        onClick={(e) => handleItemClick(item, e)}
        onMouseEnter={(e) => handleMouseEnter(item, e)}
        onMouseLeave={handleMouseLeave}
      >
        {item.icon && (
          <span className="explorer-context-menu-icon">
            <Icon name={item.icon} size={14} />
          </span>
        )}
        <span className="explorer-context-menu-label">{item.label}</span>
        {hasSubmenu && (
          <span className="explorer-context-menu-arrow">
            <Icon name="chevron-right" size={12} />
          </span>
        )}
        {item.customContent && !item.customOnly && (
          <div className="explorer-context-menu-custom-inline">
            {item.customContent}
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <>
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
        {/* 返回按钮和标题 */}
        {menuStack.length > 1 && (
          <div className="explorer-context-menu-header">
            <span className="explorer-context-menu-back" onClick={handleGoBack}>
              <Icon name="chevron-left" size={14} />
            </span>
            <span className="explorer-context-menu-title">{currentLevel.title}</span>
          </div>
        )}
        {/* 菜单项 */}
        <div className="explorer-context-menu-content">
          {currentLevel.items.map(renderMenuItem)}
        </div>
      </div>
      {/* 悬浮子菜单 */}
      {hoverSubmenu && (
        <HoverSubmenu
          items={hoverSubmenu.items}
          position={hoverSubmenu.position}
          parentLeft={hoverSubmenu.parentLeft}
          onClose={() => setHoverSubmenu(null)}
          onItemClick={handleHoverSubmenuItemClick}
          onMouseEnter={() => {
            // 清除关闭定时器，保持子菜单打开
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
            // 鼠标离开子菜单时，延迟关闭
            hoverTimeoutRef.current = setTimeout(() => {
              setHoverSubmenu(null);
            }, 150);
          }}
        />
      )}
    </>,
    document.body
  );
};

export default ContextMenu;
