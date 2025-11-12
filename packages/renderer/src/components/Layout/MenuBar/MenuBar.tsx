/**
 * MenuBar 组件
 */

import React from 'react';

export interface MenuBarProps {
  onToggleSidebar?: () => void;
  onTogglePanel?: () => void;
  onToggleAIPanel?: () => void;
}

export const MenuBar: React.FC<MenuBarProps> = (props) => {
  return (
    <div className="menu-bar">
      {/* 菜单栏内*/}
    </div>
  );
};

export default MenuBar;
