/**
 * @ 引用弹出菜单组件
 * 功能：在 CodeMirror 编辑器中输入 @ 时显示表单引用列表
 * 描述：支持搜索过滤、键盘导航、选择插入引用
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { tableReferenceService, type FormInfo } from '../../../services/tableReference/TableReferenceService';
import { Icon } from '../../Icons/Icon';
import './AtReferenceMenu.scss';

/** 菜单位置 */
interface MenuPosition {
  top: number;
  left: number;
}

/** 组件 Props */
interface AtReferenceMenuProps {
  /** 是否显示菜单 */
  visible: boolean;
  /** 菜单位置 */
  position: MenuPosition;
  /** 搜索关键词 */
  searchQuery: string;
  /** 选择表单回调 */
  onSelect: (form: FormInfo) => void;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 键盘事件回调（用于处理上下键和回车） */
  onKeyDown?: (e: KeyboardEvent) => boolean;
}

/**
 * @ 引用弹出菜单组件
 */
export const AtReferenceMenu: React.FC<AtReferenceMenuProps> = ({
  visible,
  position,
  searchQuery,
  onSelect,
  onClose,
}) => {
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [filteredForms, setFilteredForms] = useState<FormInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 加载表单列表
  useEffect(() => {
    if (visible) {
      setLoading(true);
      tableReferenceService.getAllForms().then((data) => {
        setForms(data);
        setFilteredForms(data);
        setSelectedIndex(0);
        setLoading(false);
      });
    }
  }, [visible]);

  // 根据搜索关键词过滤
  useEffect(() => {
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      const filtered = forms.filter((form) =>
        form.name.toLowerCase().includes(lowerQuery)
      );
      setFilteredForms(filtered);
      setSelectedIndex(0);
    } else {
      setFilteredForms(forms);
      setSelectedIndex(0);
    }
  }, [searchQuery, forms]);

  // 滚动选中项到可视区域
  useEffect(() => {
    const selectedItem = itemRefs.current[selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev < filteredForms.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredForms.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (filteredForms[selectedIndex]) {
            onSelect(filteredForms[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [visible, filteredForms, selectedIndex, onSelect, onClose]
  );

  // 注册键盘事件
  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => {
        document.removeEventListener('keydown', handleKeyDown, true);
      };
    }
  }, [visible, handleKeyDown]);

  // 点击外部关闭
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  // 滚动时关闭菜单
  useEffect(() => {
    if (!visible) return;

    const handleScroll = () => {
      onClose();
    };

    // 监听所有滚动事件（捕获阶段）
    document.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [visible, onClose]);

  // 处理选项点击
  const handleItemClick = (form: FormInfo) => {
    onSelect(form);
  };

  // 处理鼠标悬停
  const handleItemHover = (index: number) => {
    setSelectedIndex(index);
  };

  if (!visible) return null;

  const menuContent = (
    <div
      ref={menuRef}
      className="at-reference-menu"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="at-reference-menu-header">
        <Icon iconSet="ui" name="table-properties" size={14} />
        <span>引用表单</span>
      </div>
      <div className="at-reference-menu-list">
        {loading ? (
          <div className="at-reference-menu-loading">加载中...</div>
        ) : filteredForms.length === 0 ? (
          <div className="at-reference-menu-empty">
            {searchQuery ? '未找到匹配的表单' : '暂无表单'}
          </div>
        ) : (
          filteredForms.map((form, index) => (
            <div
              key={form.id}
              ref={(el) => (itemRefs.current[index] = el)}
              className={`at-reference-menu-item ${
                index === selectedIndex ? 'selected' : ''
              }`}
              onClick={() => handleItemClick(form)}
              onMouseEnter={() => handleItemHover(index)}
            >
              <Icon iconSet="ui" name="table-properties" size={14} />
              <span className="at-reference-menu-item-name">{form.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return createPortal(menuContent, document.body);
};

export default AtReferenceMenu;
