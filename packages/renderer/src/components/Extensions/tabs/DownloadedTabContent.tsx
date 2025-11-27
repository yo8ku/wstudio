/**
 * 已下载标签页内容
 * 功能：显示已下载的所有扩展，支持分类和搜索
 */

import React, { useEffect, useState } from 'react';
import { useExtensionsStore, DownloadedCategory } from '../../../stores/extensionsStore';
import { Icon } from '../../Icons/Icon';

interface Extension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  type: 'theme' | 'plugin' | 'icon' | 'template' | 'widget';
  extensionPath: string;
}

const CATEGORIES = [
  { id: 'all' as DownloadedCategory, label: '全部', icon: 'list' },
  { id: 'themes' as DownloadedCategory, label: '主题', icon: 'palette' },
  { id: 'plugins' as DownloadedCategory, label: '插件', icon: 'puzzle' },
  { id: 'icons' as DownloadedCategory, label: '图标', icon: 'image' },
  { id: 'templates' as DownloadedCategory, label: '模板', icon: 'file-text' },
  { id: 'widgets' as DownloadedCategory, label: '挂件', icon: 'box' },
];

export const DownloadedTabContent: React.FC = () => {
  const { downloadedCategory, searchQuery, setDownloadedCategory, setSearchQuery } = useExtensionsStore();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExtensions();
  }, []);

  const loadExtensions = async () => {
    try {
      setLoading(true);
      // 从主进程获取扩展列表
      const result = await window.electron?.ipcRenderer.invoke('extension:list');
      if (result) {
        setExtensions(result);
      }
    } catch (error) {
      console.error('[DownloadedTab] 加载扩展失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExtension = async (extensionId: string) => {
    try {
      const extension = extensions.find(e => e.id === extensionId);
      if (extension) {
        const newEnabled = !extension.enabled;
        await window.electron?.ipcRenderer.invoke('extension:toggle', extensionId, newEnabled);
        
        setExtensions(extensions.map(e => 
          e.id === extensionId ? { ...e, enabled: newEnabled } : e
        ));
      }
    } catch (error) {
      console.error('[DownloadedTab] 切换扩展失败:', error);
    }
  };

  // 过滤扩展
  const filteredExtensions = extensions.filter((ext) => {
    // 按分类过滤
    if (downloadedCategory !== 'all' && ext.type !== downloadedCategory.slice(0, -1)) {
      return false;
    }
    
    // 按搜索关键词过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        ext.name.toLowerCase().includes(query) ||
        ext.description.toLowerCase().includes(query) ||
        ext.author.toLowerCase().includes(query)
      );
    }
    
    return true;
  });

  return (
    <div className="downloaded-tab">
      {/* 工具栏 */}
      <div className="downloaded-toolbar">
        {/* 分类选择 */}
        <div className="category-buttons">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`category-button ${downloadedCategory === category.id ? 'active' : ''}`}
              onClick={() => setDownloadedCategory(category.id)}
            >
              <Icon name={category.icon} size={14} />
              <span>{category.label}</span>
            </button>
          ))}
        </div>

        {/* 搜索框 */}
        <div className="search-box">
          <Icon name="search" size={14} />
          <input
            type="text"
            placeholder="搜索扩展..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="clear-search"
              onClick={() => setSearchQuery('')}
              title="清除搜索"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 扩展列表 */}
      <div className="extensions-list">
        {loading ? (
          <div className="empty-state">
            <Icon name="loading" size={32} />
            <p>加载中...</p>
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div className="empty-state">
            <Icon name="inbox" size={48} />
            <p>{searchQuery ? '未找到匹配的扩展' : '暂无已下载的扩展'}</p>
           
          </div>
        ) : (
          <div className="extension-grid">
            {filteredExtensions.map((ext) => (
              <div key={ext.id} className="extension-card">
                <div className="extension-header">
                  <div className="extension-info">
                    <h3 className="extension-name">{ext.name}</h3>
                    <p className="extension-version">v{ext.version}</p>
                  </div>
                  <button
                    className={`toggle-button ${ext.enabled ? 'enabled' : 'disabled'}`}
                    onClick={() => toggleExtension(ext.id)}
                    title={ext.enabled ? '禁用' : '启用'}
                  >
                    {ext.enabled ? '已启用' : '已禁用'}
                  </button>
                </div>
                <p className="extension-description">{ext.description}</p>
                <div className="extension-footer">
                  <span className="extension-author">{ext.author}</span>
                  <span className="extension-type">{getTypeLabel(ext.type)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    theme: '主题',
    plugin: '插件',
    icon: '图标',
    template: '模板',
    widget: '挂件',
  };
  return labels[type] || type;
}


