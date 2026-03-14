import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icons/Icon';
import './ContextMenu.scss';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  colorDot?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  submenuType?: 'drill' | 'hover';
  onClick?: () => void;
  customContent?: React.ReactNode;
  customOnly?: boolean;
  selected?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  horizontalAnchor?: 'left' | 'right';
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
  parentRight: number;
  parentTop: number;
  parentBottom: number;
  horizontalAnchor: 'left' | 'right';
}

const HoverSubmenu: React.FC<{
  items: ContextMenuItem[];
  position: { x: number; y: number };
  parentLeft: number;
  parentRight: number;
  parentTop: number;
  parentBottom: number;
  horizontalAnchor?: 'left' | 'right';
  onClose: () => void;
  onItemClick: (item: ContextMenuItem) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({
  items,
  position,
  parentLeft,
  parentRight,
  parentTop,
  parentBottom,
  horizontalAnchor = 'left',
  onItemClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  useLayoutEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = horizontalAnchor === 'right'
      ? position.x - rect.width
      : position.x;
    let nextY = parentTop;

    if (horizontalAnchor === 'right') {
      if (nextX < 8) {
        nextX = parentRight + 4;
      }
    } else if (nextX + rect.width > viewportWidth - 8) {
      nextX = parentLeft - rect.width - 4;
    }

    if (nextX + rect.width > viewportWidth - 8) {
      nextX = viewportWidth - rect.width - 8;
    }

    if (nextY + rect.height > viewportHeight - 8) {
      nextY = parentBottom - rect.height;
    }

    if (nextX < 8) {
      nextX = 8;
    }

    if (nextY < 8) {
      nextY = 8;
    }

    if (nextY + rect.height > viewportHeight - 8) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    setAdjustedPosition({ x: nextX, y: nextY });
  }, [horizontalAnchor, parentBottom, parentLeft, parentRight, parentTop, position]);

  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="explorer-context-menu-separator" />;
    }

    return (
      <div
        key={item.id}
        className={`explorer-context-menu-item ${item.disabled ? 'disabled' : ''} ${!item.icon && !item.colorDot ? 'no-icon' : ''} ${item.selected ? 'selected' : ''}`}
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
        {item.colorDot && (
          <span
            className="explorer-context-menu-color-dot"
            style={{ '--context-menu-color-dot': item.colorDot } as React.CSSProperties}
          />
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

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  position,
  horizontalAnchor = 'left',
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [menuStack, setMenuStack] = useState<MenuLevel[]>([{ items }]);
  const [hoverSubmenu, setHoverSubmenu] = useState<HoverSubmenuState | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentLevel = menuStack[menuStack.length - 1];

  useEffect(() => {
    const isInsideAnyContextMenu = (target: EventTarget | null): boolean => {
      if (target instanceof Element) {
        return Boolean(target.closest('.explorer-context-menu'));
      }

      if (target instanceof Node) {
        return Boolean(target.parentElement?.closest('.explorer-context-menu'));
      }

      return false;
    };

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const menus = document.querySelectorAll('.explorer-context-menu');
      let isInsideMenu = false;

      menus.forEach((menu) => {
        if (menu.contains(target)) {
          isInsideMenu = true;
        }
      });

      if (!isInsideMenu) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (hoverSubmenu) {
        setHoverSubmenu(null);
        return;
      }

      if (menuStack.length > 1) {
        setMenuStack((previous) => previous.slice(0, -1));
        return;
      }

      onClose();
    };

    const handleResize = () => {
      onClose();
    };

    const handleWheel = (event: WheelEvent) => {
      if (isInsideAnyContextMenu(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (isInsideAnyContextMenu(event.target)) {
        return;
      }

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
    window.addEventListener('resize', handleResize);
    window.addEventListener('wheel', handleWheel, listenerOptions);
    window.addEventListener('touchmove', handleTouchMove, listenerOptions);
    document.addEventListener('wheel', handleWheel, listenerOptions);
    document.addEventListener('touchmove', handleTouchMove, listenerOptions);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('wheel', handleWheel, listenerOptions);
      window.removeEventListener('touchmove', handleTouchMove, listenerOptions);
      document.removeEventListener('wheel', handleWheel, listenerOptions);
      document.removeEventListener('touchmove', handleTouchMove, listenerOptions);
    };
  }, [hoverSubmenu, menuStack.length, onClose]);

  useLayoutEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextX = horizontalAnchor === 'right'
      ? position.x - rect.width
      : position.x;
    let nextY = position.y;

    if (nextX + rect.width > viewportWidth - 8) {
      nextX = viewportWidth - rect.width - 8;
    }

    if (nextX < 8) {
      nextX = 8;
    }

    const hasBottomSpace = position.y + rect.height <= viewportHeight;
    const hasTopSpace = position.y - rect.height >= 0;

    if (!hasBottomSpace && hasTopSpace) {
      nextY = Math.max(8, position.y - rect.height);
    } else if (!hasBottomSpace) {
      nextY = Math.max(8, viewportHeight - rect.height - 8);
    }

    setAdjustedPosition((previous) => {
      if (previous.x === nextX && previous.y === nextY) {
        return previous;
      }

      return { x: nextX, y: nextY };
    });
  }, [currentLevel, horizontalAnchor, position]);

  useEffect(() => {
    menuRef.current?.focus();
  }, [currentLevel]);

  useEffect(() => () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  const handleEnterDrillSubmenu = useCallback((item: ContextMenuItem) => {
    if (!item.submenu || item.submenu.length === 0) {
      return;
    }

    setHoverSubmenu(null);
    setMenuStack((previous) => [...previous, {
      items: item.submenu!,
      title: item.label,
      parentId: item.id,
    }]);
  }, []);

  const buildHoverSubmenuState = useCallback((item: ContextMenuItem, target: HTMLElement): HoverSubmenuState | null => {
    if (!item.submenu || item.submenu.length === 0) {
      return null;
    }

    const rect = target.getBoundingClientRect();
    const parentMenu = target.closest('.explorer-context-menu');
    const parentRect = parentMenu?.getBoundingClientRect();
    const submenuHorizontalAnchor = horizontalAnchor === 'right' ? 'right' : 'left';

    return {
      itemId: item.id,
      items: item.submenu,
      position: {
        x: submenuHorizontalAnchor === 'right' ? rect.left - 4 : rect.right + 4,
        y: rect.top,
      },
      parentLeft: parentRect?.left ?? rect.left,
      parentRight: parentRect?.right ?? rect.right,
      parentTop: rect.top,
      parentBottom: rect.bottom,
      horizontalAnchor: submenuHorizontalAnchor,
    };
  }, [horizontalAnchor]);

  const handleShowHoverSubmenu = useCallback((item: ContextMenuItem, event: React.MouseEvent) => {
    const nextHoverSubmenu = buildHoverSubmenuState(item, event.currentTarget as HTMLElement);
    if (nextHoverSubmenu) {
      setHoverSubmenu(nextHoverSubmenu);
    }
  }, [buildHoverSubmenuState]);

  const handleGoBack = useCallback(() => {
    if (menuStack.length > 1) {
      setMenuStack((previous) => previous.slice(0, -1));
    }
  }, [menuStack.length]);

  const handleItemClick = useCallback((item: ContextMenuItem, event: React.MouseEvent) => {
    if (item.disabled || item.customOnly) {
      return;
    }

    if (item.submenu && item.submenu.length > 0) {
      if (item.submenuType === 'hover') {
        handleShowHoverSubmenu(item, event);
      } else {
        handleEnterDrillSubmenu(item);
      }
      return;
    }

    if (item.onClick) {
      item.onClick();
      onClose();
    }
  }, [handleEnterDrillSubmenu, handleShowHoverSubmenu, onClose]);

  const handleHoverSubmenuItemClick = useCallback((item: ContextMenuItem) => {
    if (item.onClick) {
      item.onClick();
    }
    onClose();
  }, [onClose]);

  const handleMouseEnter = useCallback((item: ContextMenuItem, event: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    if (hoverSubmenu?.itemId && hoverSubmenu.itemId !== item.id) {
      setHoverSubmenu(null);
    }

    if (item.submenu && item.submenu.length > 0 && item.submenuType === 'hover') {
      if (hoverSubmenu?.itemId === item.id) {
        return;
      }

      const nextHoverSubmenu = buildHoverSubmenuState(item, event.currentTarget as HTMLElement);
      if (!nextHoverSubmenu) {
        return;
      }

      hoverTimeoutRef.current = setTimeout(() => {
        setHoverSubmenu(nextHoverSubmenu);
      }, 150);
      return;
    }

    setHoverSubmenu(null);
  }, [buildHoverSubmenuState, hoverSubmenu]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

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

    if (item.customOnly && item.customContent) {
      return (
        <div key={item.id} className="explorer-context-menu-custom">
          {item.customContent}
        </div>
      );
    }

    const hasSubmenu = item.submenu && item.submenu.length > 0;
    const isHoverActive = hoverSubmenu?.itemId === item.id;
    const submenuArrowName = 'chevron-right';

    return (
      <div
        key={item.id}
        className={`explorer-context-menu-item ${item.disabled ? 'disabled' : ''} ${!item.icon && !item.colorDot ? 'no-icon' : ''} ${isHoverActive ? 'active' : ''}`}
        onClick={(event) => handleItemClick(item, event)}
        onMouseEnter={(event) => handleMouseEnter(item, event)}
        onMouseLeave={handleMouseLeave}
      >
        {item.icon && (
          <span className="explorer-context-menu-icon">
            <Icon name={item.icon} size={14} />
          </span>
        )}
        {item.colorDot && (
          <span
            className="explorer-context-menu-color-dot"
            style={{ '--context-menu-color-dot': item.colorDot } as React.CSSProperties}
          />
        )}
        <span className="explorer-context-menu-label">{item.label}</span>
        {hasSubmenu && (
          <span className="explorer-context-menu-arrow">
            <Icon name={submenuArrowName} size={12} />
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
        tabIndex={-1}
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
        {menuStack.length > 1 && (
          <div className="explorer-context-menu-header">
            <span className="explorer-context-menu-back" onClick={handleGoBack}>
              <Icon name="chevron-left" size={14} />
            </span>
            <span className="explorer-context-menu-title">{currentLevel.title}</span>
          </div>
        )}
        <div className="explorer-context-menu-content">
          {currentLevel.items.map(renderMenuItem)}
        </div>
      </div>
      {hoverSubmenu && (
        <HoverSubmenu
          items={hoverSubmenu.items}
          position={hoverSubmenu.position}
          parentLeft={hoverSubmenu.parentLeft}
          parentRight={hoverSubmenu.parentRight}
          parentTop={hoverSubmenu.parentTop}
          parentBottom={hoverSubmenu.parentBottom}
          horizontalAnchor={hoverSubmenu.horizontalAnchor}
          onClose={() => setHoverSubmenu(null)}
          onItemClick={handleHoverSubmenuItemClick}
          onMouseEnter={() => {
            if (hoverTimeoutRef.current) {
              clearTimeout(hoverTimeoutRef.current);
            }
          }}
          onMouseLeave={() => {
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
