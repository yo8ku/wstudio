/**
 * 扩展管理组件
 * 负责显示和管理应用扩展
 */

import React, { useState, useEffect } from 'react';
import './Extensions.scss';

interface Extension {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled?: boolean;
  author?: string;
}

export const Extensions: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExtensions();
  }, []);

  const loadExtensions = async () => {
    try {
      setLoading(true);
      const electronAPI = (window as any).electronAPI;
      if (electronAPI && electronAPI.extension) {
        const exts = await electronAPI.extension.list();
        console.log('[Extensions] 加载的扩展:', exts);
        // 为每个扩展添加默认的 enabled 状态
        const extensionsWithState = exts.map((ext: Extension) => ({
          ...ext,
          enabled: ext.enabled ?? true
        }));
        setExtensions(extensionsWithState);
      }
    } catch (error) {
      console.error('[Extensions] 加载扩展失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExtension = async (id: string) => {
    try {
      const extension = extensions.find(e => e.id === id);
      if (!extension) return;

      const newEnabled = !extension.enabled;
      const electronAPI = (window as any).electronAPI;
      
      if (electronAPI && electronAPI.extension) {
        await electronAPI.extension.toggle(id, newEnabled);
        
        setExtensions(extensions.map(ext =>
          ext.id === id ? { ...ext, enabled: newEnabled } : ext
        ));
      }
    } catch (error) {
      console.error('[Extensions] 切换扩展失败:', error);
    }
  };

  const filteredExtensions = extensions.filter(ext =>
    ext.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ext.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="extensions-panel">
      {/* 搜索框 */}
      <div className="extensions-panel__search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索扩展..."
        />
      </div>

      {/* 内容区域 */}
      <div className="extensions-panel__content">
        {loading ? (
          /* 加载状态 */
          <div className="extensions-panel__loading">
            加载扩展中...
          </div>
        ) : filteredExtensions.length === 0 ? (
          /* 空状态 */
          <div className="extensions-panel__empty">
            未找到扩展
          </div>
        ) : (
          /* 扩展列表 */
          <div className="extensions-panel__list">
            {filteredExtensions.map((ext) => (
              <div key={ext.id} className="extensions-panel__item">
                {/* 扩展头部 */}
                <div className="extensions-panel__item-header">
                  <div className="extensions-panel__item-info">
                    <h3 className="extensions-panel__item-name">
                      {ext.name}
                    </h3>
                    <p className="extensions-panel__item-description">
                      {ext.description}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleExtension(ext.id)}
                    className={`extensions-panel__toggle-button ${
                      ext.enabled 
                        ? 'extensions-panel__toggle-button--enabled' 
                        : 'extensions-panel__toggle-button--disabled'
                    }`}
                  >
                    {ext.enabled ? '禁用' : '启用'}
                  </button>
                </div>

                {/* 扩展底部信息 */}
                <div className="extensions-panel__item-footer">
                  <span className="extensions-panel__version">v{ext.version}</span>
                  {ext.author && (
                    <span className="extensions-panel__author">{ext.author}</span>
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
