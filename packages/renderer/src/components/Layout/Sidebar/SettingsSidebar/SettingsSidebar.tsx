/**
 * 设置侧边栏组件
 * 功能：设置界面的左侧分类导航栏
 */

import React from 'react';
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
  icon?: string;
}

const categories: CategoryItem[] = [
  { id: 'commonly-used', label: '常用设置' },
  { id: 'text-editor', label: '文本编辑器' },
  { id: 'workbench', label: '工作台' },
  { id: 'window', label: '窗口' },
  { id: 'features', label: '功能' },
  { id: 'application', label: '应用程序' },
  { id: 'extensions', label: '扩展' },
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onCategoryChange,
}) => {
  return (
    <div className="settings-sidebar">
      <div className="settings-sidebar-content">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`settings-sidebar-item ${
              activeCategory === category.id ? 'active' : ''
            }`}
            onClick={() => onCategoryChange(category.id)}
          >
            {category.label}
          </div>
        ))}
      </div>
    </div>
  );
};
