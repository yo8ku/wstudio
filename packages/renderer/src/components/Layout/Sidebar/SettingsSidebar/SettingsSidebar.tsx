/**
 * Settings sidebar category navigation.
 */

import React, { useState } from 'react';
import ikunAvatar from '@/assets/images/ikunAvtar.png';
import { Icon } from '../../../Icons/Icon';
import './SettingsSidebar.scss';

export type SettingsCategory =
  | 'commonly-used'
  | 'text-editor'
  | 'workbench'
  | 'window'
  | 'ai'
  | 'shortcuts'
  | 'cloud-backup'
  | 'cloud-backup-local'
  | 'cloud-backup-webdav'
  | 'cloud-backup-jianguoyun'
  | 'cloud-backup-gitee'
  | 'cloud-backup-custom'
  | 'data-settings'
  | 'data-settings-notion'
  | 'data-settings-yuque'
  | 'data-settings-joplin'
  | 'data-settings-obsidian'
  | 'data-settings-siyuan'
  | 'data-settings-custom'
  | 'document-processing'
  | 'application';

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

interface SubCategoryItem {
  id: SettingsCategory;
  label: string;
}

interface CategoryItem {
  id: SettingsCategory;
  label: string;
  children?: SubCategoryItem[];
}

const categories: CategoryItem[] = [
  { id: 'commonly-used', label: '常用设置' },
  { id: 'text-editor', label: '文本编辑器' },
  { id: 'workbench', label: '工作台' },
  { id: 'window', label: '窗口' },
  { id: 'ai', label: 'AI' },
  { id: 'shortcuts', label: '快捷键' },
  {
    id: 'cloud-backup',
    label: '云端备份',
    children: [
      { id: 'cloud-backup-local', label: '本地备份' },
      { id: 'cloud-backup-webdav', label: 'WebDav' },
      { id: 'cloud-backup-jianguoyun', label: '坚果云' },
      { id: 'cloud-backup-gitee', label: 'Gitee' },
      { id: 'cloud-backup-custom', label: '自定义' },
    ]
  },
  {
    id: 'data-settings',
    label: '数据设置',
    children: [
      { id: 'data-settings-notion', label: 'Notion' },
      { id: 'data-settings-yuque', label: '语雀' },
      { id: 'data-settings-joplin', label: 'Joplin' },
      { id: 'data-settings-obsidian', label: 'Obsidian' },
      { id: 'data-settings-siyuan', label: '思源笔记' },
      { id: 'data-settings-custom', label: '自定义' },
    ]
  },
  { id: 'document-processing', label: '文档处理' },
  { id: 'application', label: '应用程序' },
];

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onCategoryChange,
}) => {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['cloud-backup', 'data-settings'])
  );

  const userInfo = {
    name: 'ikun',
    email: 'ikun@example.com',
    avatar: ikunAvatar,
    membership: 'member' as const,
  };

  const toggleExpand = (categoryId: string): void => {
    setExpandedCategories(previous => {
      const next = new Set(previous);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const isChildActive = (category: CategoryItem): boolean => {
    if (!category.children) {
      return false;
    }
    return category.children.some(child => child.id === activeCategory);
  };

  return (
    <div className="settings-sidebar">
      <div className="settings-sidebar-user">
        <div className="user-avatar">
          <img src={userInfo.avatar} alt={userInfo.name} />
        </div>
        <div className="user-info">
          <div className="user-name-row">
            <span className="user-name">{userInfo.name}</span>
            {userInfo.membership === 'member' && (
              <span className="user-membership-badge">PRO</span>
            )}
          </div>
          <span className="user-email">{userInfo.email}</span>
        </div>
      </div>

      <div className="settings-sidebar-content">
        {categories.map(category => (
          <div key={category.id} className="settings-sidebar-group">
            <div
              className={`settings-sidebar-item ${
                activeCategory === category.id || isChildActive(category) ? 'active' : ''
              } ${category.children ? 'has-children' : ''}`}
              onClick={() => {
                if (category.children) {
                  toggleExpand(category.id);
                } else {
                  onCategoryChange(category.id);
                }
              }}
            >
              {category.children ? (
                <span className={`expand-icon ${expandedCategories.has(category.id) ? 'expanded' : ''}`}>
                  <Icon iconSet="ui" name="chevron-right" size={12} />
                </span>
              ) : (
                <span className="expand-icon-placeholder" />
              )}
              <span className="item-label">{category.label}</span>
            </div>

            {category.children && expandedCategories.has(category.id) && (
              <div className="settings-sidebar-children">
                {category.children.map(child => (
                  <div
                    key={child.id}
                    className={`settings-sidebar-item settings-sidebar-item--child ${
                      activeCategory === child.id ? 'active' : ''
                    }`}
                    onClick={() => onCategoryChange(child.id)}
                  >
                    {child.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
