/**
 * 下拉菜单组件
 * 功能：通用下拉菜单，支持分组、搜索、图标等功能
 * 描述：用于替代下拉选择器，使用菜单形式展示选项
 */

import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../Icons/Icon';
import './DropdownMenu.scss';

export interface DropdownMenuItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;  // 后缀图标（如深度思考图标）
  disabled?: boolean;
}

export interface DropdownMenuGroup {
  groupName: string;
  items: DropdownMenuItem[];
}

export interface DropdownMenuProps {
  /** 当前选中的值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 菜单项列表（支持分组或扁平列表） */
  items?: DropdownMenuItem[];
  /** 分组列表 */
  groups?: DropdownMenuGroup[];
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
}

/**
 * 下拉菜单组件
 */
export const DropdownMenu: React.FC<DropdownMenuProps> = ({
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
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
        onOpenChange?.(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
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
      // 使用 setTimeout 确保 DOM 已经渲染完成
      setTimeout(() => {
        if (selectedItemRef.current && menuListRef.current) {
          const menuList = menuListRef.current;
          const selectedItem = selectedItemRef.current;
          
          // 计算选中项相对于菜单列表的位置
          const itemOffsetTop = selectedItem.offsetTop;
          const itemHeight = selectedItem.offsetHeight;
          const menuHeight = menuList.offsetHeight;
          const menuScrollTop = menuList.scrollTop;
          
          // 如果选中项不在可视区域内，滚动到选中项
          if (itemOffsetTop < menuScrollTop) {
            // 选中项在可视区域上方
            menuList.scrollTop = itemOffsetTop;
          } else if (itemOffsetTop + itemHeight > menuScrollTop + menuHeight) {
            // 选中项在可视区域下方
            menuList.scrollTop = itemOffsetTop + itemHeight - menuHeight +5;
          }
        }
      }, 0);
    }
  }, [isOpen]);

  // 获取显示文本
  const getDisplayText = (): string => {
    if (!value) return placeholder;

    // 在分组中查找
    for (const group of groups) {
      const item = group.items.find(i => i.value === value);
      if (item) return item.label;
    }

    // 在扁平列表中查找
    const item = items.find(i => i.value === value);
    return item ? item.label : placeholder;
  };

  // 过滤菜单项
  const filterItems = (itemList: DropdownMenuItem[]): DropdownMenuItem[] => {
    if (!searchQuery) return itemList;
    return itemList.filter(item =>
      item.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  // 处理菜单项点击
  const handleItemClick = (itemValue: string, itemDisabled?: boolean) => {
    if (itemDisabled) return;
    onChange(itemValue);
    setIsOpen(false);
    setSearchQuery('');
    onOpenChange?.(false);
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
  const renderItem = (item: DropdownMenuItem) => {
    const isSelected = item.value === value;
    return (
      <div
        key={item.value}
        ref={isSelected ? selectedItemRef : null}
        className={`dropdown-menu-item ${isSelected ? 'selected' : ''} ${item.disabled ? 'disabled' : ''}`}
        onClick={() => handleItemClick(item.value, item.disabled)}
      >
        {item.icon && <span className="dropdown-menu-item-icon">{item.icon}</span>}
        <span className="dropdown-menu-item-label">{item.label}</span>
        {item.suffix && <span className="dropdown-menu-item-suffix">{item.suffix}</span>}
        {isSelected && <Icon name="check" size={14} />}
      </div>
    );
  };

  // 渲染菜单内容
  const renderMenuContent = () => {
    if (groups.length > 0) {
      // 渲染分组
      return groups.map(group => {
        const filteredItems = filterItems(group.items);
        if (filteredItems.length === 0) return null;

        return (
          <div key={group.groupName} className="dropdown-menu-group">
            <div className="dropdown-menu-group-title">{group.groupName}</div>
            {filteredItems.map(renderItem)}
          </div>
        );
      });
    } else {
      // 渲染扁平列表
      const filteredItems = filterItems(items);
      if (filteredItems.length === 0) {
        return <div className="dropdown-menu-empty">无匹配项</div>;
      }
      return filteredItems.map(renderItem);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`dropdown-menu ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''} ${placement === 'top' ? 'placement-top' : ''} ${className}`}
    >
      <div className="dropdown-menu-trigger" onClick={toggleMenu}>
        <span className="dropdown-menu-text">{getDisplayText()}</span>
        <Icon name="chevron-down" size={14} className="dropdown-menu-arrow" />
      </div>

      {isOpen && (
        <div className="dropdown-menu-content">
          {showSearch && (
            <div className="dropdown-menu-search">
              <Icon name="search" size={14} />
              <input
                ref={searchInputRef}
                type="text"
                className="dropdown-menu-search-input"
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          <div ref={menuListRef} className="dropdown-menu-list">
            {renderMenuContent()}
          </div>
        </div>
      )}
    </div>
  );
};

