/**
 * CodeMirror 编辑器右键菜单组件
 * 功能：为 CodeMirror 编辑器提供自定义右键菜单
 * 描述：支持新建链接、外部链接、文本格式、段落设置、插入、剪切、复制、粘贴、全选等功能
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './CodeMirrorContextMenu.scss';
import { ColorPicker } from './ColorPicker';

/**
 * 二级菜单包装组件 - 自动调整位置避免超出视口
 */
const SubmenuWrapper: React.FC<{
  children: React.ReactNode;
  statusBarHeight: number;
}> = ({ children, statusBarHeight }) => {
  const submenuRef = useRef<HTMLDivElement>(null);
  const [adjustedStyle, setAdjustedStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (submenuRef.current) {
      const rect = submenuRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const availableBottom = viewportHeight - statusBarHeight;

      // 如果二级菜单底部超出可用区域，向上调整
      if (rect.bottom > availableBottom) {
        const overflow = rect.bottom - availableBottom;
        setAdjustedStyle({ top: -overflow });
      }
    }
  }, [statusBarHeight]);

  return (
    <div ref={submenuRef} className="cm-context-submenu" style={adjustedStyle}>
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
  /** 颜色标识（用于颜色菜单项显示圆形色块） */
  color?: string;
  /** 是否为自定义颜色选项 */
  isCustomColor?: boolean;
  /** 自定义颜色回调（确认选择时调用） */
  onCustomColor?: (color: string) => void;
  /** 自定义颜色预览回调（拖动时实时调用） */
  onCustomColorPreview?: (color: string) => void;
  /** 自定义颜色取消回调（取消选择时调用，用于清除预览） */
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
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  // 自定义颜色选择器状态
  const [colorPickerState, setColorPickerState] = useState<{
    visible: boolean;
    anchorRect?: DOMRect;
    onColorChange?: (color: string) => void;
    onColorConfirm?: (color: string) => void;
    onCancel?: () => void;
  }>({ visible: false });

  // 状态栏高度
  const STATUS_BAR_HEIGHT = 28;

  // 当菜单关闭时，重置状态
  useEffect(() => {
    if (!visible) {
      setColorPickerState({ visible: false });
      setActiveSubmenu(null);
    }
  }, [visible]);

  // 调整菜单位置，防止超出视图
  useEffect(() => {
    if (visible && menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      // 底部留出状态栏空间
      if (y + rect.height > viewportHeight - STATUS_BAR_HEIGHT) {
        adjustedY = viewportHeight - rect.height - STATUS_BAR_HEIGHT - 10;
      }

      adjustedX = Math.max(10, adjustedX);
      adjustedY = Math.max(10, adjustedY);

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [visible, x, y]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      // 如果颜色选择器打开，不关闭菜单
      if (colorPickerState.visible) return;

      const target = e.target as HTMLElement;

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

    // 使用 click 而不是 mousedown，因为颜色选择器在 mousedown 时会打开
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
      document.addEventListener('keydown', handleEscape);
    }, 0);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, onClose, colorPickerState.visible]);

  // 打开颜色选择器
  const openColorPicker = (
    anchorElement: HTMLElement,
    onColorChange?: (color: string) => void,
    onColorConfirm?: (color: string) => void,
    onCancel?: () => void
  ) => {
    const rect = anchorElement.getBoundingClientRect();
    setColorPickerState({
      visible: true,
      anchorRect: rect,
      onColorChange,
      onColorConfirm,
      onCancel,
    });
  };

  // 关闭颜色选择器
  const closeColorPicker = () => {
    // 调用取消回调
    colorPickerState.onCancel?.();
    setColorPickerState({ visible: false });
  };

  if (!visible) {
    return null;
  }

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled || item.submenu) return;
    if (item.action) {
      item.action();
    }
    onClose();
  };

  // 渲染二级菜单项（不触发 activeSubmenu 变化）
  const renderSubmenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="cm-context-menu-separator" />;
    }

    // 自定义颜色选项
    if (item.isCustomColor) {
      return (
        <div
          key={item.id}
          className="cm-context-menu-item cm-context-menu-custom-color"
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
              item.onCustomColorCancel
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
        className={`cm-context-menu-item ${item.disabled ? 'disabled' : ''}`}
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

  // 渲染一级菜单项
  const renderMenuItem = (item: ContextMenuItem) => {
    if (item.separator) {
      return <div key={item.id} className="cm-context-menu-separator" />;
    }

    const hasSubmenu = item.submenu && item.submenu.length > 0;

    // 自定义颜色选项
    if (item.isCustomColor) {
      return (
        <div
          key={item.id}
          className="cm-context-menu-item cm-context-menu-custom-color"
          onMouseEnter={() => {
            // 颜色选择器打开时不改变 activeSubmenu
            if (!colorPickerState.visible) {
              setActiveSubmenu(null);
            }
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
              item.onCustomColorCancel
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
        className={`cm-context-menu-item ${item.disabled ? 'disabled' : ''} ${hasSubmenu ? 'has-submenu' : ''}`}
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => {
          // 颜色选择器打开时不改变 activeSubmenu
          if (colorPickerState.visible) return;
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
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
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
