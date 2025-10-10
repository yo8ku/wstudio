import React from 'react';
import './TreeView.scss';

export interface TreeViewProps {
  children: React.ReactNode;
  className?: string;
  onBlankAreaClick?: () => void;
}

/**
 * 通用树形视图容器
 * 提供树形结构的基础样式和布局
 */
export const TreeView: React.FC<TreeViewProps> = ({ children, className, onBlankAreaClick }) => {
  const handleClick = (e: React.MouseEvent) => {
    // 只有当点击的是容器本身（空白区域），而不是子元素时才触发
    if (e.target === e.currentTarget && onBlankAreaClick) {
      onBlankAreaClick();
    }
  };

  return (
    <div 
      className={`tree-view ${className || ''}`} 
      role="tree"
      onClick={handleClick}
    >
      {children}
    </div>
  );
};

export default TreeView;




