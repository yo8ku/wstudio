/**
 * 设置侧边栏 - 显示设置分类
 * VSCode 风格的设置分类导航（树形结构，可展开/收缩）
 */

import React, { useState, useEffect } from 'react';
import './SettingsSidebar.scss';

export type SettingsCategory = 
  | 'commonly-used'
  | 'text-editor'
  | 'workbench'
  | 'window'
  | 'features'
  | 'application'
  | 'extensions';

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

interface CategoryItem {
  id: SettingsCategory;
  label: string;
  icon?: React.ReactNode;
}

const categories: CategoryItem[] = [
  {
    id: 'commonly-used',
    label: '常用设置',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    )
  },
  {
    id: 'text-editor',
    label: '文本编辑器',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    )
  },
  {
    id: 'workbench',
    label: '工作台',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    id: 'window',
    label: '窗口',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
      </svg>
    )
  },
  {
    id: 'features',
    label: '功能',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    )
  },
  {
    id: 'application',
    label: '应用程序',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    )
  },
  {
    id: 'extensions',
    label: '扩展',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )
  }
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ 
  activeCategory, 
  onCategoryChange 
}) => {
  // 维护每个分类的展开/收缩状态
  const [expandedCategories, setExpandedCategories] = useState<Set<SettingsCategory>>(new Set([activeCategory]));

  // 当 activeCategory 变化时，自动展开该分类
  useEffect(() => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      newSet.add(activeCategory);
      return newSet;
    });
  }, [activeCategory]);

  // 切换分类的展开/收缩状态
  const toggleCategory = (categoryId: SettingsCategory) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // 选中分类（展开并滚动到对应区域）
  const handleCategorySelect = (categoryId: SettingsCategory) => {
    // 展开该分类
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      newSet.add(categoryId);
      return newSet;
    });
    // 通知父组件
    onCategoryChange(categoryId);
  };

  return (
    <div className="settings-sidebar">
      {/* 搜索框 */}
      <div className="sidebar-search">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="搜索设置"
            className="search-input"
          />
          <svg 
            className="search-icon" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* 分类列表（树形结构） */}
      <div className="categories-list">
        {categories.map((category) => {
          const isExpanded = expandedCategories.has(category.id);
          const isActive = activeCategory === category.id;

          return (
            <div key={category.id} className="category-item">
              <div className={`category-header ${isActive ? 'active' : ''}`}>
                {/* 展开/收缩箭头 */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className={`expand-button ${isExpanded ? 'expanded' : ''}`}
                >
                  <svg className="expand-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>

                {/* 分类图标和名称 */}
                <button
                  onClick={() => handleCategorySelect(category.id)}
                  className="category-button"
                >
                  {category.icon && (
                    <span className="category-icon">
                      {category.icon}
                    </span>
                  )}
                  <span className="category-label">{category.label}</span>
                </button>
              </div>

              {/* 折叠内容（暂时为空，可以添加子项） */}
              {isExpanded && (
                <div className="category-children">
                  {/* 这里可以添加子设置项，目前留空 */}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
