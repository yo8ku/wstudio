/**
 * 设置内容区域组件
 * 设置内容区，包含顶部工具栏和设置列表
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { SettingsCategory } from '../../Layout/Sidebar/SettingsSidebar';
import { DropdownMenu } from '@/components/common/DropdownMenu';
import { SearchInput } from '@/components/common/SearchInput';
import { EmbeddingConfig } from '@/components/EmbeddingConfig';
import './SettingsContent.scss';

interface SettingDefinition {
  key: string;
  title: string;
  description: string;
  type: 'boolean' | 'number' | 'string' | 'select' | 'object';
  category: SettingsCategory;
  subcategory?: string;
  options?: string[];
  min?: number;
  max?: number;
  default?: any;
}

interface Extension {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  enabled?: boolean;
  categories?: string[];
}

interface SettingsContentProps {
  activeCategory: SettingsCategory;
  onActiveCategoryChange?: (category: SettingsCategory) => void;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

export const SettingsContent: React.FC<SettingsContentProps> = ({ 
  activeCategory, 
  onActiveCategoryChange,
  scrollContainerRef 
}) => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [jsonContent, setJsonContent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>('');
  const [extensions, setExtensions] = useState<Extension[]>([]);

  // 设置定义（根据分类组织）
  const settingDefinitions: SettingDefinition[] = [
    // 常用设置
    {
      key: 'editor.fontSize',
      title: 'Font Size',
      description: '控制字体大小（像素）',
      type: 'number',
      category: 'commonly-used',
      min: 8,
      max: 100,
      default: 14,
    },
    {
      key: 'editor.tabSize',
      title: 'Tab Size',
      description: '一个制表符等于的空格数',
      type: 'number',
      category: 'commonly-used',
      min: 1,
      max: 8,
      default: 4,
    },
    {
      key: 'files.autoSave',
      title: 'Auto Save',
      description: '控制脏文件的自动保存',
      type: 'select',
      category: 'commonly-used',
      options: ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
      default: 'off',
    },
    {
      key: 'workbench.colorTheme',
      title: 'Color Theme',
      description: '指定工作台中使用的颜色主题',
      type: 'string',
      category: 'commonly-used',
      default: 'One Dark Pro',
    },

    // 文本编辑
    {
      key: 'editor.lineHeight',
      title: 'Line Height',
      description: '控制行高',
      type: 'number',
      category: 'text-editor',
      min: 0,
      max: 100,
      default: 0,
    },
    {
      key: 'editor.insertSpaces',
      title: 'Insert Spaces',
      description: 'Tab 键时插入空格',
      type: 'boolean',
      category: 'text-editor',
      default: true,
    },
    {
      key: 'editor.wordWrap',
      title: 'Word Wrap',
      description: '控制折行方式',
      type: 'select',
      category: 'text-editor',
      options: ['off', 'on', 'wordWrapColumn', 'bounded'],
      default: 'off',
    },
    {
      key: 'editor.minimap.enabled',
      title: 'Minimap Enabled',
      description: '控制是否显示小地图',
      type: 'boolean',
      category: 'text-editor',
      default: true,
    },
    {
      key: 'editor.lineNumbers',
      title: 'Line Numbers',
      description: '控制行号的显示',
      type: 'select',
      category: 'text-editor',
      options: ['off', 'on', 'relative', 'interval'],
      default: 'on',
    },

    // 工作台
    {
      key: 'workbench.iconTheme',
      title: 'Icon Theme',
      description: '指定工作台中使用的图标主题',
      type: 'string',
      category: 'workbench',
      default: 'vs-seti',
    },
    {
      key: 'workbench.sideBar.location',
      title: 'Sidebar Location',
      description: '控制侧边栏的位置',
      type: 'select',
      category: 'workbench',
      options: ['left', 'right'],
      default: 'left',
    },
    {
      key: 'workbench.activityBar.visible',
      title: 'Activity Bar Visible',
      description: '控制活动栏的可见性',
      type: 'boolean',
      category: 'workbench',
      default: true,
    },

    // 窗口
    {
      key: 'window.zoomLevel',
      title: 'Zoom Level',
      description: '调整窗口的缩放级别',
      type: 'number',
      category: 'window',
      min: -5,
      max: 5,
      default: 0,
    },
    {
      key: 'window.title',
      title: 'Window Title',
      description: '控制窗口标题',
      type: 'string',
      category: 'window',
      default: '${activeEditorShort}${separator}${rootName}',
    },

    // AI
    {
      key: 'files.encoding',
      title: 'Files Encoding',
      description: '读写文件时使用的默认字符集编码',
      type: 'select',
      category: 'ai',
      options: ['utf8', 'utf8bom', 'utf16le', 'utf16be', 'gbk'],
      default: 'utf8',
    },
    {
      key: 'search.useIgnoreFiles',
      title: 'Use Ignore Files',
      description: '控制在搜索中是否使用 .gitignore 和 .ignore 文件',
      type: 'boolean',
      category: 'ai',
      default: true,
    },
    // Embedding 配置（特殊处理，使用自定义组件）
    {
      key: 'embedding.config',
      title: 'Embedding 配置',
      description: '配置云端 Embedding API，用于知识库向量化',
      type: 'object',
      category: 'ai',
    },
  ];

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadExtensions();
  }, []);

  // 加载扩展列表
  const loadExtensions = async () => {
    try {
      const result = await window.electronAPI?.extension?.list();
      if (result) {
        // 过滤掉主题扩展（categories 包含 "Themes" 的）
        const nonThemeExtensions = result.filter((ext: Extension) => 
          !ext.categories?.includes('Themes')
        );
        setExtensions(nonThemeExtensions);
      }
    } catch (error) {
      console.error('加载扩展列表失败:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await window.electronAPI?.settings?.getAll();
      if (result?.success && result.data) {
        setSettings(result.data);
        setJsonContent(JSON.stringify(result.data, null, 2));
      }
    } catch (error) {
      console.error('加载设置失败:', error);
      setError('加载设置失败');
    }
  };

  // 监听设置变化
  useEffect(() => {
    const handleSettingsChanged = (_event: any, newSettings: Record<string, any>) => {
      setSettings(newSettings);
      setJsonContent(JSON.stringify(newSettings, null, 2));
    };

    window.electronAPI?.on?.('settings:changed', handleSettingsChanged);
    return () => {
      window.electronAPI?.off?.('settings:changed', handleSettingsChanged);
    };
  }, []);

  // 更新设置
  const updateSetting = async (key: string, value: any) => {
    try {
      const result = await window.electronAPI?.settings?.update(key, value);
      if (result?.success) {
        setSettings(prev => ({ ...prev, [key]: value }));
        setModifiedKeys(prev => new Set([...prev, key]));
      } else {
        setError(result?.error || '更新失败');
      }
    } catch (error) {
      console.error('更新设置失败:', error);
      setError('更新设置失败');
    }
  };


  // 重置设置
  const handleReset = async (key?: string) => {
    try {
      const result = await window.electronAPI?.settings?.reset(key);
      if (result?.success) {
        await loadSettings();
        if (key) {
          setModifiedKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(key);
            return newSet;
          });
        } else {
          setModifiedKeys(new Set());
        }
      }
    } catch (error) {
      console.error('重置设置失败:', error);
      setError('重置设置失败');
    }
  };

  // 根据分类过滤设置
  const getCategorySettings = useCallback((category: SettingsCategory) => {
    return settingDefinitions.filter(def => {
      // 根据分类过滤
      if (def.category !== category) return false;
      
      // 根据搜索过滤
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          def.title.toLowerCase().includes(query) ||
          def.description.toLowerCase().includes(query) ||
          def.key.toLowerCase().includes(query)
        );
      }
      
      return true;
    });
  }, [searchQuery, settingDefinitions]);

  // 所有分类列表
  const allCategories: SettingsCategory[] = [
    'commonly-used',
    'text-editor', 
    'workbench',
    'window',
    'ai',
    'shortcuts',
    'cloud-backup',
    'cloud-backup-local',
    'cloud-backup-webdav',
    'cloud-backup-jianguoyun',
    'cloud-backup-gitee',
    'cloud-backup-custom',
    'data-settings',
    'data-settings-notion',
    'data-settings-yuque',
    'data-settings-joplin',
    'data-settings-obsidian',
    'data-settings-siyuan',
    'data-settings-custom',
    'document-processing',
    'application',
    'extensions'
  ];

  // 使用 IntersectionObserver 监听滚动并自动选中对应分类
  useEffect(() => {
    if (!scrollContainerRef?.current || !onActiveCategoryChange) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 找到当前可见且在视口顶部的分类
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          // 按照在视口中的位置排序，选择最靠近顶部的
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topEntry = visibleEntries[0];
          const categoryId = topEntry.target.id.replace('category-', '') as SettingsCategory;
          onActiveCategoryChange(categoryId);
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '-20% 0px -70% 0px', // 当分类进入视口上方20%时触发
        threshold: 0
      }
    );

    // 观察所有分类区域
    const categoryElements = scrollContainerRef.current.querySelectorAll('[id^="category-"]');
    categoryElements.forEach(element => observer.observe(element));

    return () => {
      categoryElements.forEach(element => observer.unobserve(element));
      observer.disconnect();
    };
  }, [scrollContainerRef, onActiveCategoryChange]);

  // 渲染设置控件
  const renderSettingControl = (def: SettingDefinition) => {
    const value = settings[def.key] ?? def.default;

    switch (def.type) {
      case 'boolean':
        return (
          <label>
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => updateSetting(def.key, e.target.checked)}
              className="control-checkbox"
            />
          </label>
        );

      case 'number':
        return (
          <input
            type="number"
            value={value}
            min={def.min}
            max={def.max}
            onChange={(e) => updateSetting(def.key, Number(e.target.value))}
            className="control-input"
          />
        );

      case 'string':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => updateSetting(def.key, e.target.value)}
            className="control-input"
          />
        );

      case 'select':
        return (
          <DropdownMenu
            value={value}
            onChange={(newValue: string) => updateSetting(def.key, newValue)}
            items={def.options?.map(option => ({ value: option, label: option })) || []}
          />
        );

      case 'object':
        // 特殊处理：Embedding 配置使用自定义组件
        if (def.key === 'embedding.config') {
          return <EmbeddingConfig />;
        }
        return null;

      default:
        return null;
    }
  };

  // 渲染主界面
  return (
    <div className="settings-content">
      {/* 顶部工具栏*/}
      <div className="settings-toolbar">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="搜索设置"
          alwaysExpanded={true}
          expandedWidth="100%"
        />
      </div>

      {/* 内容区域 */}
      <div className="content-area">
        {/* UI 模式 - 显示所有分类 */}
        <div className="content-scroll" ref={scrollContainerRef}>
            <div className="content-inner">
              {error && (
                <div className="error-message">
                  {error}
                </div>
              )}

              {/* 遍历所有分类并显示 */}
              {allCategories.map((category) => {
                // 特殊处理扩展分类
                if (category === 'extensions') {
                  return (
                    <div key={category} id={`category-${category}`} className="category-section">
                      <h2 className="category-title">扩展</h2>
                      {extensions.length === 0 ? (
                        <div className="empty-state">未找到扩展</div>
                      ) : (
                        <div className="extensions-list">
                          {extensions.map((ext) => (
                            <div key={ext.id} className="extension-item">
                              <div className="extension-content">
                                <div className="extension-info">
                                  <div className="extension-header">
                                    <h3 className="extension-name">{ext.displayName}</h3>
                                    <span className="extension-version">v{ext.version}</span>
                                  </div>
                                  <p className="extension-description">{ext.description}</p>
                                  <code className="extension-id">{ext.id}</code>
                                </div>
                                <div className="extension-status">
                                  <span className={`status-badge ${ext.enabled ? 'enabled' : 'disabled'}`}>
                                    {ext.enabled ? '已启用' : '已禁用'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                // 普通设置分类
                const categorySettings = getCategorySettings(category);
                const categoryLabels: Record<SettingsCategory, string> = {
                  'commonly-used': '常用设置',
                  'text-editor': '文本编辑器',
                  'workbench': '工作台',
                  'window': '窗口',
                  'ai': 'AI',
                  'shortcuts': '快捷键',
                  'cloud-backup': '云端备份',
                  'cloud-backup-local': '本地备份',
                  'cloud-backup-webdav': 'WebDav',
                  'cloud-backup-jianguoyun': '坚果云',
                  'cloud-backup-gitee': 'Gitee',
                  'cloud-backup-custom': '自定义备份',
                  'data-settings': '数据设置',
                  'data-settings-notion': 'Notion',
                  'data-settings-yuque': '语雀',
                  'data-settings-joplin': 'Joplin',
                  'data-settings-obsidian': 'Obsidian',
                  'data-settings-siyuan': '思源笔记',
                  'data-settings-custom': '自定义数据源',
                  'document-processing': '文档处理',
                  'application': '应用程序',
                  'extensions': '扩展'
                };

                if (categorySettings.length === 0) return null;

                return (
                  <div key={category} id={`category-${category}`} className="category-section">
                    <h2 className="category-title">{categoryLabels[category]}</h2>
                    <div className="settings-list">
                      {categorySettings.map((def) => {
                        const isModified = modifiedKeys.has(def.key);
                        
                        // 特殊处理：object 类型（如 Embedding 配置）使用自定义组件，占据整行
                        if (def.type === 'object') {
                          return (
                            <div key={def.key} className="setting-item setting-item--full">
                              {renderSettingControl(def)}
                            </div>
                          );
                        }
                        
                        return (
                          <div key={def.key} className="setting-item">
                            <div className="setting-row">
                              <div className="setting-info">
                                <div className="setting-header">
                                  <h3 className="setting-title">{def.title}</h3>
                                  {isModified && (
                                    <span className="modified-badge">已修改</span>
                                  )}
                                </div>
                                <p className="setting-description">{def.description}</p>
                                <code className="setting-key">{def.key}</code>
                              </div>
                              <div className="setting-controls">
                                {renderSettingControl(def)}
                                {isModified && (
                                  <div
                                    onClick={() => handleReset(def.key)}
                                    className="reset-action"
                                    title="重置为默认值"
                                  >
                                    重置
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* 页脚 */}
              <footer className="settings-footer">
                <div className="settings-footer__content">
                  <div className="settings-footer__brand">
                    <span className="settings-footer__name">Note WStudio</span>
                    <span className="settings-footer__version">v1.0.0</span>
                  </div>
                  <div className="settings-footer__slogan">
                    "韦"大的"思"想，从这里开始！
                  </div>
                  <div className="settings-footer__links">
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://github.com')}>GitHub</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/docs')}>用户协议</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/privacy')}>隐私政策</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/feedback')}>加入我们</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com/changelog')}>联系我们</span>
                    <span className="settings-footer__divider">|</span>
                    <span className="settings-footer__link" onClick={() => window.electron?.shell?.openExternal('https://example.com')}>进入官网</span>
                  </div>
                  <div className="settings-footer__copyright">
                    Copyright 2024-2025 Note WStudio. All rights reserved.
                  </div>
                  <div className="settings-footer__icp">
                    粤ICP备2024XXXXXX号-1
                  </div>
                </div>
              </footer>
            </div>
          </div>
      </div>
    </div>
  );
};
