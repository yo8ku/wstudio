/**
 * 设置视图组件
 * 设置界面（侧边栏+ 内容区）
 */

import React, { useState, useRef } from 'react';
import { SettingsSidebar, type SettingsCategory } from '../../Layout/Sidebar/SettingsSidebar';
import { SettingsContent } from '../../Editor/SettingsContent';
import './SettingsView.scss';

export const SettingsView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('commonly-used');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 处理侧边栏分类点击：更新活动分类并滚动到对应区域
  const handleCategoryChange = (category: SettingsCategory) => {
    setActiveCategory(category);
    
    // 滚动到对应的分类区域
    if (scrollContainerRef.current) {
      const targetElement = scrollContainerRef.current.querySelector(`#category-${category}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <div className="settings-view">
      {/* 左侧分类侧边栏*/}
      <div className="settings-sidebar-container">
        <SettingsSidebar 
          activeCategory={activeCategory}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      {/* 右侧内容区域 */}
      <div className="settings-content-container">
        <SettingsContent 
          activeCategory={activeCategory}
          onActiveCategoryChange={setActiveCategory}
          scrollContainerRef={scrollContainerRef}
        />
      </div>
    </div>
  );
};