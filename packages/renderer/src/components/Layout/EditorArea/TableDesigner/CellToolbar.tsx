/**
 * 单元格工具栏组件
 * 功能：在选中单元格上方显示操作工具栏
 * 描述：提供填充、润色、翻译等AI功能快捷操作
 */

import React, { useRef, useEffect, useState } from 'react';
import { Icon } from '../../../Icons/Icon';
import './CellToolbar.scss';

/** 润色类型 */
export type PolishType = 'polish' | 'imitate' | 'expand' | 'shorten' | 'improve' | 'grammar';

/** 工具栏菜单项 */
export interface CellToolbarMenuItem {
  id: string;
  label: string;
  icon?: string;
  onClick?: () => void;
  disabled?: boolean;
}

/** 工具栏属性 */
export interface CellToolbarProps {
  /** 工具栏位置 */
  position: { x: number; y: number };
  /** 单元格值 */
  cellValue: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 填充回调 */
  onFill?: (value: string) => void;
  /** 润色回调 */
  onPolish?: (value: string, type: PolishType) => void;
  /** 翻译回调 */
  onTranslate?: (value: string) => void;
  /** 数据查看回调 */
  onViewData?: (value: string) => void;
  /** 总结回调 */
  onSummarize?: (value: string) => void;
  /** 信息提取回调 */
  onExtract?: (value: string) => void;
  /** 智能标签回调 */
  onSmartTag?: (value: string) => void;
  /** 快速提问回调 */
  onQuickAsk?: (value: string) => void;
}

export const CellToolbar: React.FC<CellToolbarProps> = ({
  position,
  cellValue,
  onClose,
  onFill,
  onPolish,
  onTranslate,
  onViewData,
  onSummarize,
  onExtract,
  onSmartTag,
  onQuickAsk,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPolishMenu, setShowPolishMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<'right' | 'bottom'>('right');
  const moreButtonRef = useRef<HTMLSpanElement>(null);
  const polishButtonRef = useRef<HTMLSpanElement>(null);
  const prevPositionRef = useRef(position);

  // 当位置变化时（选中了新单元格），关闭所有菜单
  useEffect(() => {
    if (prevPositionRef.current.x !== position.x || prevPositionRef.current.y !== position.y) {
      setShowMoreMenu(false);
      setShowPolishMenu(false);
      prevPositionRef.current = position;
    }
  }, [position]);

  // 点击外部关闭工具栏和菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // 检查点击是否在工具栏内容或菜单上
      const toolbarContent = toolbarRef.current?.querySelector('.cell-toolbar-content');
      const moreMenu = toolbarRef.current?.querySelector('.cell-toolbar-more-menu');
      const polishMenu = toolbarRef.current?.querySelector('.cell-toolbar-polish-menu');
      
      const isInsideToolbar = toolbarContent?.contains(target) || moreMenu?.contains(target) || polishMenu?.contains(target);
      
      if (!isInsideToolbar) {
        setShowMoreMenu(false);
        setShowPolishMenu(false);
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 点击更多按钮，检测菜单位置
  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPolishMenu(false); // 关闭润色菜单
    if (!showMoreMenu && moreButtonRef.current) {
      const buttonRect = moreButtonRef.current.getBoundingClientRect();
      const menuWidth = 150;
      const viewportWidth = window.innerWidth;
      
      // 如果菜单会溢出视口右边界，显示在下方
      if (buttonRect.right + menuWidth + 10 > viewportWidth) {
        setMenuPosition('bottom');
      } else {
        setMenuPosition('right');
      }
    }
    setShowMoreMenu(!showMoreMenu);
  };

  // 点击润色按钮
  const handlePolishClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMoreMenu(false); // 关闭更多菜单
    setShowPolishMenu(!showPolishMenu);
  };

  // 处理润色选项点击
  const handlePolishOption = (type: PolishType) => {
    onPolish?.(cellValue, type);
    setShowPolishMenu(false);
  };

  // 处理填充
  const handleFill = () => {
    onFill?.(cellValue);
  };

  // 处理翻译
  const handleTranslate = () => {
    onTranslate?.(cellValue);
  };

  // 处理数据查看
  const handleViewData = () => {
    onViewData?.(cellValue);
  };

  // 处理总结
  const handleSummarize = () => {
    onSummarize?.(cellValue);
    setShowMoreMenu(false);
  };

  // 处理信息提取
  const handleExtract = () => {
    onExtract?.(cellValue);
    setShowMoreMenu(false);
  };

  // 处理智能标签
  const handleSmartTag = () => {
    onSmartTag?.(cellValue);
    setShowMoreMenu(false);
  };

  // 处理快速提问
  const handleQuickAsk = () => {
    onQuickAsk?.(cellValue);
    setShowMoreMenu(false);
  };

  // 润色菜单项
  const polishMenuItems: { id: PolishType; label: string }[] = [
    { id: 'polish', label: '润色' },
    { id: 'imitate', label: '仿写' },
    { id: 'expand', label: '扩写' },
    { id: 'shorten', label: '缩写' },
    { id: 'improve', label: '写作改进' },
    { id: 'grammar', label: '语法修正' },
  ];

  // 更多菜单项
  const moreMenuItems: CellToolbarMenuItem[] = [
    { id: 'summarize', label: '总结', icon: 'sparkles', onClick: handleSummarize },
    { id: 'extract', label: '信息提取', icon: 'sparkles', onClick: handleExtract },
    { id: 'smart-tag', label: '智能标签', icon: 'tag', onClick: handleSmartTag },
    { id: 'quick-ask', label: '快速提问', icon: 'sparkles', onClick: handleQuickAsk },
    { id: 'separator', label: '', disabled: true },
    { id: 'settings', label: '设置', icon: 'gear', onClick: () => setShowMoreMenu(false) },
  ];

  return (
    <div
      ref={toolbarRef}
      className={`cell-toolbar ${menuPosition === 'bottom' ? 'menu-bottom' : ''}`}
      style={{
        left: position.x,
        top: position.y - 48,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="cell-toolbar-content">
        <span className="cell-toolbar-item" onClick={handleFill} title="填充">
          <Icon name="cell-fill" size={20} />
        </span>
        <span 
          ref={polishButtonRef}
          className={`cell-toolbar-item ${showPolishMenu ? 'active' : ''}`} 
          onClick={handlePolishClick} 
          title="润色"
        >
          <Icon name="cell-polish" size={20} />
        </span>
        <span className="cell-toolbar-item" onClick={handleTranslate} title="翻译">
          <Icon name="cell-translate" size={20} />
        </span>
        <span className="cell-toolbar-item" onClick={handleViewData} title="数据查看">
          <Icon name="eye" size={20} />
        </span>
        <span className="cell-toolbar-divider" />
        <span
          ref={moreButtonRef}
          className={`cell-toolbar-item ${showMoreMenu ? 'active' : ''}`}
          onClick={handleMoreClick}
          title="更多"
        >
          <Icon name="cell-more" size={20} />
        </span>
      </div>

      {showPolishMenu && (
        <div className="cell-toolbar-polish-menu">
          {polishMenuItems.map((item) => (
            <div
              key={item.id}
              className="cell-toolbar-menu-item"
              onClick={() => handlePolishOption(item.id)}
            >
              <span className="menu-item-label">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {showMoreMenu && (
        <div className={`cell-toolbar-more-menu ${menuPosition}`}>
          {moreMenuItems.map((item) =>
            item.id === 'separator' ? (
              <div key={item.id} className="cell-toolbar-menu-separator" />
            ) : (
              <div
                key={item.id}
                className="cell-toolbar-menu-item"
                onClick={item.onClick}
              >
                {item.icon && <Icon name={item.icon} size={14} />}
                <span className="menu-item-label">{item.label}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default CellToolbar;
