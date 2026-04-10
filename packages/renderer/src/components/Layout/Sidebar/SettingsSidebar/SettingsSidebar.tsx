/**
 * Settings sidebar category navigation.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  | 'plugins'
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

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  activeCategory,
  onCategoryChange,
}) => {
  const { t } = useTranslation();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['cloud-backup', 'data-settings'])
  );
  const translateText = (key: string): string => String(t(key));

  const categories: CategoryItem[] = [
    { id: 'commonly-used', label: translateText('settings.categories.commonlyUsed') },
    { id: 'text-editor', label: translateText('settings.categories.textEditor') },
    { id: 'workbench', label: translateText('settings.categories.workbench') },
    { id: 'window', label: translateText('settings.categories.window') },
    { id: 'ai', label: translateText('settings.categories.ai') },
    { id: 'shortcuts', label: translateText('settings.categories.shortcuts') },
    {
      id: 'cloud-backup',
      label: translateText('settings.categories.cloudBackup'),
      children: [
        { id: 'cloud-backup-local', label: translateText('settings.categories.cloudBackupLocal') },
        { id: 'cloud-backup-webdav', label: translateText('settings.categories.cloudBackupWebdav') },
        {
          id: 'cloud-backup-jianguoyun',
          label: translateText('settings.categories.cloudBackupJianguoyun'),
        },
        { id: 'cloud-backup-gitee', label: translateText('settings.categories.cloudBackupGitee') },
        { id: 'cloud-backup-custom', label: translateText('settings.categories.cloudBackupCustom') },
      ]
    },
    {
      id: 'data-settings',
      label: translateText('settings.categories.dataSettings'),
      children: [
        { id: 'data-settings-notion', label: translateText('settings.categories.dataSettingsNotion') },
        { id: 'data-settings-yuque', label: translateText('settings.categories.dataSettingsYuque') },
        { id: 'data-settings-joplin', label: translateText('settings.categories.dataSettingsJoplin') },
        {
          id: 'data-settings-obsidian',
          label: translateText('settings.categories.dataSettingsObsidian'),
        },
        { id: 'data-settings-siyuan', label: translateText('settings.categories.dataSettingsSiyuan') },
        { id: 'data-settings-custom', label: translateText('settings.categories.dataSettingsCustom') },
      ]
    },
    { id: 'document-processing', label: translateText('settings.categories.documentProcessing') },
    { id: 'plugins', label: '插件' },
    { id: 'application', label: translateText('settings.categories.application') },
  ];

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
