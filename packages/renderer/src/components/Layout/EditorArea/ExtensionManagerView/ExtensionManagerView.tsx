/**
 * 扩展管理标签页视图组件
 * 功能：展示扩展管理界面（已下载、主题、文件图标、插件、片段、挂件、模板）
 * 描述：在 EditorArea 中以标签页形式显示的扩展管理器，使用卡片布局
 */

import React, { useState, useEffect } from 'react';
import './ExtensionManagerView.scss';

// 扩展类型定义
type ExtensionCategory = 'downloaded' | 'themes' | 'file-icons' | 'plugins' | 'snippets' | 'widgets' | 'templates';

interface ExtensionItem {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  icon?: string;
  enabled?: boolean;
  category: ExtensionCategory;
}

export const ExtensionManagerView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ExtensionCategory>('downloaded');
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 分类选项
  const categories = [
    { id: 'downloaded' as ExtensionCategory, label: '已下载' },
    { id: 'themes' as ExtensionCategory, label: '主题' },
    { id: 'file-icons' as ExtensionCategory, label: '文件图标' },
    { id: 'plugins' as ExtensionCategory, label: '插件' },
    { id: 'snippets' as ExtensionCategory, label: '片段' },
    { id: 'widgets' as ExtensionCategory, label: '挂件' },
    { id: 'templates' as ExtensionCategory, label: '模板' },
  ];

  // 加载扩展数据
  useEffect(() => {
    loadExtensions();
  }, [activeCategory]);

  const loadExtensions = async () => {
    setLoading(true);
    try {
      // TODO: 根据不同的分类加载不同的数据
      // 这里暂时使用模拟数据
      const mockData: ExtensionItem[] = [];
      
      if (activeCategory === 'downloaded') {
        // 加载已下载的所有扩展
        const result = await window.electron?.ipcRenderer.invoke('extension:list');
        if (result) {
          const mappedExtensions = result.map((ext: any) => ({
            id: ext.id,
            name: ext.name,
            description: ext.description,
            version: ext.version,
            author: ext.author,
            enabled: ext.enabled,
            category: 'downloaded' as ExtensionCategory
          }));
          setExtensions(mappedExtensions);
        } else {
          setExtensions([]);
        }
      } else {
        // 其他分类暂时显示空数据
        setExtensions(mockData);
      }
    } catch (error) {
      console.error('[ExtensionManagerView] 加载扩展失败:', error);
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  };

  // 过滤扩展
  const filteredExtensions = extensions.filter(ext => 
    ext.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ext.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ext.author?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 切换扩展启用状态
  const toggleExtension = async (extensionId: string) => {
    try {
      const extension = extensions.find(e => e.id === extensionId);
      if (extension) {
        const newEnabled = !extension.enabled;
        await window.electron?.ipcRenderer.invoke('extension:toggle', extensionId, newEnabled);
        
        setExtensions(prev => prev.map(e => 
          e.id === extensionId ? { ...e, enabled: newEnabled } : e
        ));
      }
    } catch (error) {
      console.error('[ExtensionManagerView] 切换扩展失败:', error);
    }
  };

  return (
    <div className="extension-manager-view">
      {/* 顶部搜索框 */}
      <div className="extension-manager-search">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path 
              d="M7 12a5 5 0 100-10 5 5 0 000 10zM14 14l-2.9-2.9" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="搜索扩展..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button 
              className="clear-button"
              onClick={() => setSearchQuery('')}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 分类选项卡 */}
      <div className="extension-manager-categories">
        {categories.map(category => (
          <button
            key={category.id}
            className={`category-tab ${activeCategory === category.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* 扩展卡片内容区 */}
      <div className="extension-manager-view-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>加载中...</p>
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="16" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2"/>
              <path d="M28 28h8M28 36h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <p className="empty-title">
              {searchQuery ? '未找到匹配的扩展' : `暂无${categories.find(c => c.id === activeCategory)?.label}`}
            </p>
            <p className="empty-subtitle">
              {searchQuery ? '请尝试其他搜索关键词' : '从扩展市场安装扩展'}
            </p>
          </div>
        ) : (
          <div className="extensions-grid">
            {filteredExtensions.map(ext => (
              <div key={ext.id} className="extension-card">
                <div className="extension-card-header">
                  <div className="extension-icon">
                    {ext.icon ? (
                      <img src={ext.icon} alt={ext.name} />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <rect width="40" height="40" rx="8" fill="var(--ws-button-secondary-background)"/>
                        <text x="20" y="26" fontSize="16" fill="currentColor" textAnchor="middle" fontWeight="600">
                          {(ext.name || 'E').charAt(0).toUpperCase()}
                        </text>
                      </svg>
                    )}
                  </div>
                  <div className="extension-info">
                    <h3 className="extension-name">{ext.name || '未命名扩展'}</h3>
                    <p className="extension-author">{ext.author || '未知作者'}</p>
                  </div>
                </div>

                <p className="extension-description">{ext.description || '暂无描述'}</p>

                <div className="extension-card-footer">
                  <span className="extension-version">v{ext.version || '0.0.0'}</span>
                  {ext.enabled !== undefined && (
                    <button
                      className={`extension-toggle ${ext.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => toggleExtension(ext.id)}
                    >
                      {ext.enabled ? '已启用' : '已禁用'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

