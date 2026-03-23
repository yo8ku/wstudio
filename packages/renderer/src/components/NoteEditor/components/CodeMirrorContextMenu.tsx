import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './CodeMirrorContextMenu.scss';
import { ColorPicker } from './ColorPicker';

const SubmenuWrapper: React.FC<{
  children: React.ReactNode;
  statusBarHeight: number;
}> = ({ children, statusBarHeight }) => {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [adjustedStyle, setAdjustedStyle] = useState<React.CSSProperties>({});
  const [isPositionReady, setIsPositionReady] = useState(false);

  useLayoutEffect(() => {
    if (!submenuRef.current) {
      return;
    }

    const rect = submenuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableBottom = viewportHeight - statusBarHeight;
    let nextStyle: React.CSSProperties = {};

    if (rect.right > viewportWidth) {
      nextStyle = {
        left: 'auto',
        right: '100%',
      };
    }

    if (rect.bottom > availableBottom) {
      const overflow = rect.bottom - availableBottom;
      nextStyle = {
        ...nextStyle,
        top: -overflow,
      };
    }

    setAdjustedStyle(nextStyle);
    setIsPositionReady(true);
  }, [statusBarHeight]);

  return (
    <div
      ref={submenuRef}
      className="cm-context-submenu"
      style={{
        ...adjustedStyle,
        visibility: isPositionReady ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>
  );
};

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
  color?: string;
  isCustomColor?: boolean;
  onCustomColor?: (color: string) => void;
  onCustomColorPreview?: (color: string) => void;
  onCustomColorCancel?: () => void;
}

export interface CodeMirrorContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const CodeMirrorContextMenu: React.FC<CodeMirrorContextMenuProps> = ({
  visible,
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [isPositionReady, setIsPositionReady] = useState(false);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [colorPickerState, setColorPickerState] = useState<{
    visible: boolean;
    anchorRect?: DOMRect;
    onColorChange?: (color: string) => void;
    onColorConfirm?: (color: string) => void;
    onCancel?: () => void;
    sourceItemId?: string;
    sourceParentItemId?: string;
  }>({ visible: false });

  const STATUS_BAR_HEIGHT = 28;

  useEffect(() => {
    if (!visible) {
      setColorPickerState({ visible: false });
      setActiveSubmenu(null);
      setIsPositionReady(false);
    }
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 10;
    }

    if (y + rect.height > viewportHeight - STATUS_BAR_HEIGHT) {
      adjustedY = y - rect.height;
    }

    adjustedX = Math.max(10, adjustedX);
    adjustedY = Math.max(10, adjustedY);

    setPosition({ x: adjustedX, y: adjustedY });
    setIsPositionReady(true);
  }, [visible, x, y]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.closest('.custom-color-picker')) {
        return;
      }

      if (menuRef.current && !menuRef.current.contains(target)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (colorPickerState.visible) {
          setColorPickerState({ visible: false });
        } else {
          onClose();
        }
      }
    };

    setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose, colorPickerState.visible]);

  const openColorPicker = (
    anchorElement: HTMLElement,
    onColorChange?: (color: string) => void,
    onColorConfirm?: (color: string) => void,
    onCancel?: () => void,
    sourceItemId?: string,
    sourceParentItemId?: string
  ) => {
    const rect = anchorElement.getBoundingClientRect();
    setColorPickerState({
      visible: true,
      anchorRect: rect,
      onColorChange,
      onColorConfirm,
      onCancel,
      sourceItemId,
      sourceParentItemId,
    });
  };

  const closeColorPicker = () => {
    colorPickerState.onCancel?.();
    setColorPickerState({ visible: false });
  };

  if (!visible) {
    return null;
  }

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.submenu) {
      return;
    }

    if (item.action) {
      item.action();
    }

    onClose();
  };

  const renderSubmenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="cm-context-menu-separator" />;
    }

    if (item.isCustomColor) {
      return (
        <div
          key={item.id}
          className={`cm-context-menu-item cm-context-menu-custom-color ${colorPickerState.visible && colorPickerState.sourceItemId === item.id ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            openColorPicker(
              e.currentTarget as HTMLElement,
              item.onCustomColorPreview,
              (color) => {
                item.onCustomColor?.(color);
                closeColorPicker();
                onClose();
              },
              item.onCustomColorCancel,
              item.id,
              activeSubmenu ?? undefined
            );
          }}
        >
          <div className="cm-context-menu-item-label">{item.label}</div>
          <div className="cm-context-menu-color-trigger" />
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={`cm-context-menu-item ${item.disabled ? 'disabled' : ''} ${
          colorPickerState.visible && colorPickerState.sourceItemId === item.id ? 'active' : ''
        }`}
        onClick={() => handleItemClick(item)}
      >
        {item.color ? (
          <div
            className="cm-context-menu-color-dot"
            style={{ backgroundColor: item.color }}
          />
        ) : (
          <div className="cm-context-menu-item-icon">{item.icon}</div>
        )}
        <div className="cm-context-menu-item-label">{item.label}</div>
        {item.shortcut && (
          <div className="cm-context-menu-item-shortcut">{item.shortcut}</div>
        )}
      </div>
    );
  };

  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="cm-context-menu-separator" />;
    }

    const hasSubmenu = item.submenu && item.submenu.length > 0;

    if (item.isCustomColor) {
      return (
        <div
          key={item.id}
          className={`cm-context-menu-item cm-context-menu-custom-color ${
            colorPickerState.visible && colorPickerState.sourceItemId === item.id ? 'active' : ''
          }`}
          onMouseEnter={() => {
            if (colorPickerState.visible) {
              closeColorPicker();
            }

            setActiveSubmenu(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            openColorPicker(
              e.currentTarget as HTMLElement,
              item.onCustomColorPreview,
              (color) => {
                item.onCustomColor?.(color);
                closeColorPicker();
                onClose();
              },
              item.onCustomColorCancel,
              item.id
            );
          }}
        >
          <div className="cm-context-menu-item-label">{item.label}</div>
          <div className="cm-context-menu-color-trigger" />
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className={`cm-context-menu-item ${item.disabled ? 'disabled' : ''} ${hasSubmenu ? 'has-submenu' : ''} ${
          activeSubmenu === item.id ||
          (colorPickerState.visible && colorPickerState.sourceItemId === item.id) ||
          (colorPickerState.visible && colorPickerState.sourceParentItemId === item.id)
            ? 'active'
            : ''
        }`}
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => {
          if (colorPickerState.visible) {
            closeColorPicker();
          }

          if (hasSubmenu) {
            setActiveSubmenu(item.id);
          } else {
            setActiveSubmenu(null);
          }
        }}
      >
        {item.color ? (
          <div
            className="cm-context-menu-color-dot"
            style={{ backgroundColor: item.color }}
          />
        ) : (
          <div className="cm-context-menu-item-icon">{item.icon}</div>
        )}
        <div className="cm-context-menu-item-label">{item.label}</div>
        {item.shortcut && (
          <div className="cm-context-menu-item-shortcut">{item.shortcut}</div>
        )}
        {hasSubmenu && (
          <div className="cm-context-menu-item-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        )}
        {hasSubmenu && activeSubmenu === item.id && (
          <SubmenuWrapper statusBarHeight={STATUS_BAR_HEIGHT}>
            {item.submenu?.map((subItem) => renderSubmenuItem(subItem))}
          </SubmenuWrapper>
        )}
      </div>
    );
  };

  const menuContent = (
    <div
      ref={menuRef}
      className="cm-context-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        visibility: isPositionReady ? 'visible' : 'hidden',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => renderMenuItem(item))}
      {colorPickerState.visible && colorPickerState.anchorRect && (
        <ColorPicker
          anchorRect={colorPickerState.anchorRect}
          onColorChange={colorPickerState.onColorChange}
          onColorConfirm={colorPickerState.onColorConfirm}
          onCancel={closeColorPicker}
        />
      )}
    </div>
  );

  return createPortal(menuContent, document.body);
};
