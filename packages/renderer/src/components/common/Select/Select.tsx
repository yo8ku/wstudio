/**
 * Select 组件 - 基于 Portal 的下拉选择器
 * 功能：使用 Portal 将下拉菜单渲染到 body，避免层级遮挡问题
 * 描述：用于替代 DropdownMenu，解决边框遮挡下拉菜单的问题
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../Icons/Icon';
import './Select.scss';

export interface SelectItem {
  value: string;
  label: string | React.ReactNode;
  icon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  disabled?: boolean;
  /** 数据类型标识，用于区分文件或文件夹等 */
  dataType?: string;
  /** 深度层级，用于文件树缩进（从0开始） */
  depth?: number;
}

export interface SelectGroup {
  groupName: string;
  items: SelectItem[];
  /** 是否在分组上方显示分割线 */
  showDivider?: boolean;
}

export interface SelectProps {
  /** 当前选中的值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 菜单项列表（支持分组或扁平列表） */
  items?: SelectItem[];
  /** 分组列表 */
  groups?: SelectGroup[];
  /** 占位符 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 是否显示搜索框 */
  showSearch?: boolean;
  /** 菜单弹出位置 */
  placement?: 'top' | 'bottom';
  /** 菜单打开/关闭状态变化回调 */
  onOpenChange?: (isOpen: boolean) => void;
  /** 受控模式：菜单是否打开 */
  open?: boolean;
  /** 头部左侧图标（用于显示后退箭头等） */
  headerLeftIcon?: React.ReactNode;
  /** 头部左侧图标点击回调 */
  onHeaderLeftClick?: () => void;
  /** 菜单项点击回调，返回 false 时不关闭菜单 */
  onItemClick?: (value: string) => boolean | void;
}

/**
 * Select 组件
 */
export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  items = [],
  groups = [],
  placeholder = '请选择',
  disabled = false,
  className = '',
  showSearch = false,
  placement = 'bottom',
  onOpenChange,
  open,
  headerLeftIcon,
  onHeaderLeftClick,
  onItemClick,
}) => {
  // 如果提供了 open 属性，使用受控模式；否则使用内部状态
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalIsOpen;
  const setIsOpen = (newIsOpen: boolean) => {
    if (open === undefined) {
      setInternalIsOpen(newIsOpen);
    }
    onOpenChange?.(newIsOpen);
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const [actualPlacement, setActualPlacement] = useState<'top' | 'bottom'>('bottom');
  const [isPositionReady, setIsPositionReady] = useState(false); // 位置是否已计算完成
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // 计算下拉菜单位置
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    // 计算下拉菜单的预估高度
    // 如果菜单已经渲染，使用实际高度；否则使用预估高度
    let menuHeight = 300; // 默认预估高度
    if (contentRef.current) {
      const actualHeight = contentRef.current.offsetHeight;
      if (actualHeight > 0) {
        menuHeight = actualHeight;
      }
    } else if (menuListRef.current) {
      // 如果菜单列表已渲染但容器未渲染，使用列表高度加上搜索框高度（如果有）
      const listHeight = menuListRef.current.scrollHeight;
      const searchHeight = showSearch ? 40 : 0; // 搜索框高度约 40px
      menuHeight = Math.min(listHeight + searchHeight, 500); // 最大高度限制为 500px
    }

    // 计算可用空间
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spacing = 4; // 间距

    // 判断应该向上还是向下显示
    // 如果底部空间不够且上方空间足够，则向上显示
    const shouldShowTop = spaceBelow < menuHeight + spacing && spaceAbove > menuHeight + spacing;

    // 如果 placement 是 'top'，或者应该向上显示，则向上弹出
    const calculatedPlacement = placement === 'top' || shouldShowTop ? 'top' : 'bottom';
    
    // 保存实际方向
    setActualPlacement(calculatedPlacement);

    setPosition({
      top: calculatedPlacement === 'top' 
        ? rect.top + scrollY - menuHeight - spacing  // 向上弹出，减去菜单高度和间距
        : rect.bottom + scrollY + spacing, // 向下弹出，加上间距
      left: rect.left + scrollX,
      width: rect.width,
    });
    
    // 标记位置已计算完成
    setIsPositionReady(true);
  }, [placement, showSearch]);

  // 打开菜单时更新位置
  useEffect(() => {
    if (isOpen) {
      // 重置位置就绪状态，在位置计算完成前隐藏菜单
      setIsPositionReady(false);
      
      // 先立即计算一次位置（使用预估高度）
      updatePosition();
      
      // 延迟更新位置，确保菜单内容已渲染，可以获取实际高度并重新计算
      const timer = setTimeout(() => {
        updatePosition();
      }, 0);
      
      // 使用 requestAnimationFrame 再次更新，确保 DOM 完全渲染
      const rafTimer = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updatePosition();
        });
      });
      
      // 监听窗口大小变化和滚动
      const handleResize = () => updatePosition();
      const handleScroll = () => updatePosition();
      
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      
      return () => {
        clearTimeout(timer);
        cancelAnimationFrame(rafTimer);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    } else {
      // 菜单关闭时重置位置就绪状态
      setIsPositionReady(false);
    }
  }, [isOpen, placement, updatePosition]);

  // 当选中值变化时，提前更新位置以避免位置跳动
  // 如果菜单关闭，提前计算位置，这样下次打开时位置就是正确的
  // 如果菜单打开，也需要更新位置以保持对齐
  useEffect(() => {
    if (containerRef.current) {
      // 使用 requestAnimationFrame 确保 DOM 已经更新（文本内容已变化）
      requestAnimationFrame(() => {
        updatePosition();
      });
    }
  }, [value, updatePosition]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && 
        !containerRef.current.contains(target) &&
        contentRef.current &&
        !contentRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
        onOpenChange?.(false);
      }
    };

    if (isOpen) {
      // 使用 setTimeout 确保 Portal 内容已经渲染
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onOpenChange]);

  // 失去焦点时关闭菜单
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowBlur = () => {
      // 窗口失去焦点时关闭菜单
      setIsOpen(false);
      setSearchQuery('');
      onOpenChange?.(false);
    };

    // 监听窗口失去焦点事件
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [isOpen, onOpenChange]);

  // 打开菜单时聚焦搜索框
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, showSearch]);

  // 打开菜单时滚动到选中的项
  useEffect(() => {
    if (isOpen && selectedItemRef.current && menuListRef.current) {
      setTimeout(() => {
        if (selectedItemRef.current && menuListRef.current) {
          const menuList = menuListRef.current;
          const selectedItem = selectedItemRef.current;
          
          const itemOffsetTop = selectedItem.offsetTop;
          const itemHeight = selectedItem.offsetHeight;
          const menuHeight = menuList.offsetHeight;
          const menuScrollTop = menuList.scrollTop;
          
          if (itemOffsetTop < menuScrollTop) {
            menuList.scrollTop = itemOffsetTop;
          } else if (itemOffsetTop + itemHeight > menuScrollTop + menuHeight) {
            menuList.scrollTop = itemOffsetTop + itemHeight - menuHeight + 5;
          }
        }
      }, 0);
    }
  }, [isOpen]);

  // 获取显示文本
  const getDisplayText = (): string => {
    if (!value) return placeholder;

    for (const group of groups) {
      const item = group.items.find(i => i.value === value);
      if (item) {
        if (typeof item.label === 'string') {
          return item.label;
        }
        // 如果是 React 元素，尝试提取文本或返回默认值
        return '已选择';
      }
    }

    const item = items.find(i => i.value === value);
    if (item) {
      if (typeof item.label === 'string') {
        return item.label;
      }
      return '已选择';
    }
    return placeholder;
  };

  // 过滤菜单项
  const filterItems = (itemList: SelectItem[]): SelectItem[] => {
    if (!searchQuery) return itemList;
    return itemList.filter(item => {
      if (typeof item.label === 'string') {
        return item.label.toLowerCase().includes(searchQuery.toLowerCase());
      }
      // 如果是 React 元素，暂时不过滤（可以根据需要实现文本提取）
      return true;
    });
  };

  // 处理菜单项点击
  const handleItemClick = (itemValue: string, itemDisabled?: boolean) => {
    if (itemDisabled) return;
    onChange(itemValue);
    
    // 如果提供了 onItemClick 回调，使用它的返回值决定是否关闭菜单
    // 如果返回 false，则不关闭菜单；否则或未提供回调，默认关闭菜单
    const shouldClose = onItemClick ? onItemClick(itemValue) !== false : true;
    
    if (shouldClose) {
      setIsOpen(false);
      setSearchQuery('');
      onOpenChange?.(false);
    } else {
      // 即使不关闭菜单，也清空搜索框，以便下次显示时是干净的
      setSearchQuery('');
    }
  };

  // 切换菜单打开/关闭
  const toggleMenu = () => {
    if (!disabled) {
      const newIsOpen = !isOpen;
      setIsOpen(newIsOpen);
      onOpenChange?.(newIsOpen);
    }
  };

  // 渲染菜单项
  const renderItem = (item: SelectItem) => {
    const isSelected = item.value === value;
    return (
      <div
        key={item.value}
        ref={isSelected ? selectedItemRef : null}
        className={`select-item ${isSelected ? 'selected' : ''} ${item.disabled ? 'disabled' : ''}`}
        onClick={() => handleItemClick(item.value, item.disabled)}
        data-type={item.dataType}
        data-depth={item.depth !== undefined ? item.depth : undefined}
      >
        {item.icon && <span className="select-item-icon">{item.icon}</span>}
        <span className="select-item-label">{item.label}</span>
        {item.rightIcon && <span className="select-item-right-icon">{item.rightIcon}</span>}
        {isSelected && !item.rightIcon && <Icon name="check" size={14} />}
      </div>
    );
  };

  // 渲染菜单内容
  const renderMenuContent = () => {
    if (groups.length > 0) {
      return groups.map((group, groupIndex) => {
        const filteredItems = filterItems(group.items);
        if (filteredItems.length === 0) return null;

        // 使用索引和 groupName 组合作为 key，确保唯一性
        const groupKey = group.groupName ? `${group.groupName}-${groupIndex}` : `group-${groupIndex}`;

        return (
          <div 
            key={groupKey} 
            className={`select-group ${group.showDivider ? 'show-divider' : ''}`}
          >
            {group.groupName && <div className="select-group-title">{group.groupName}</div>}
            {filteredItems.map(renderItem)}
          </div>
        );
      });
    } else {
      const filteredItems = filterItems(items);
      if (filteredItems.length === 0) {
        return <div className="select-empty">无匹配项</div>;
      }
      return filteredItems.map(renderItem);
    }
  };

  // 渲染下拉菜单内容（使用 Portal）
  const renderDropdownContent = () => {
    if (!isOpen) return null;

    return createPortal(
      <div
        ref={contentRef}
        className={`select-content ${actualPlacement === 'top' ? 'placement-top' : ''} ${className ? `${className}-content` : ''}`}
        style={{
          '--select-content-top': `${position.top}px`,
          '--select-content-left': `${position.left}px`,
          '--select-content-width': `${position.width}px`,
          opacity: isPositionReady ? 1 : 0,
          visibility: isPositionReady ? 'visible' : 'hidden',
        } as React.CSSProperties}
      >
        {headerLeftIcon && (
          <div className="select-header">
            <div 
              className="select-header-left"
              onClick={(e) => {
                e.stopPropagation();
                onHeaderLeftClick?.();
              }}
            >
              {headerLeftIcon}
            </div>
            {showSearch && (
              <div className="select-search">
                <Icon name="search" size={14} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="select-search-input"
                  placeholder="搜索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}
        {!headerLeftIcon && showSearch && (
          <div className="select-search">
            <Icon name="search" size={14} />
            <input
              ref={searchInputRef}
              type="text"
              className="select-search-input"
              placeholder="搜索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div ref={menuListRef} className="select-list">
          {renderMenuContent()}
        </div>
      </div>,
      document.body
    );
  };

  return (
    <>
      <div
        ref={containerRef}
        className={`select ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      >
        <div className="select-trigger" onClick={toggleMenu}>
          <span className="select-text">{getDisplayText()}</span>
          <Icon name="chevron-down" size={14} className="select-arrow" />
        </div>
      </div>
      {renderDropdownContent()}
    </>
  );
};

