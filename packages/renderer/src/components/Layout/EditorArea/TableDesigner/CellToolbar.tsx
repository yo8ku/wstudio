/**
 * 单元格工具栏组件
 * 功能：在选中单元格上方显示操作工具栏
 * 描述：提供填充、润色、翻译等AI功能快捷操作
 */

import React, { useRef, useEffect, useState } from 'react';
import { Icon } from '../../../Icons/Icon';
import './CellToolbar.scss';

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
  onPolish?: (value: string) => void;
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
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭工具栏
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // 点击外部关闭更多菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  // 处理填充
  const handleFill = () => {
    onFill?.(cellValue);
  };

  // 处理润色
  const handlePolish = () => {
    onPolish?.(cellValue);
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
      className="cell-toolbar"
      style={{
        left: position.x,
        top: position.y - 48,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cell-toolbar-content">
        <span className="cell-toolbar-item" onClick={handleFill} title="填充">
          <Icon name="cell-fill" size={20} />
        </span>
        <span className="cell-toolbar-item" onClick={handlePolish} title="润色">
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
          className={`cell-toolbar-item ${showMoreMenu ? 'active' : ''}`}
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          title="更多"
        >
          <Icon name="cell-more" size={20} />
        </span>
      </div>

      {showMoreMenu && (
        <div ref={moreMenuRef} className="cell-toolbar-more-menu">
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
