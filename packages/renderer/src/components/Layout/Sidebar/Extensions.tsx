/**
 * 扩展管理组件
 */

import React, { useState, useEffect } from 'react';

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
    <div className="extensions-panel p-4">
      {/* 搜索框 */}
      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索扩展..."
          className="w-full px-3 py-2 rounded focus:outline-none text-sm"
          style={{
            backgroundColor: 'var(--input-bg)',
            color: 'var(--input-fg)',
            border: '1px solid var(--input-border)'
          }}
        />
      </div>

      {/* 加载状态 */}
      {loading ? (
        <div className="text-center text-sm py-8" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
          加载扩展中...
        </div>
      ) : (
        <>
          {/* 扩展列表 */}
          <div className="space-y-3">
            {filteredExtensions.map((ext) => (
              <div
                key={ext.id}
                className="extension-item p-3 rounded cursor-pointer transition-colors"
                style={{ backgroundColor: 'var(--panel-bg)' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--sidebar-fg)' }}>
                      {ext.name}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
                      {ext.description}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleExtension(ext.id)}
                    className="ml-2 px-3 py-1 text-xs rounded transition-colors"
                    style={{
                      backgroundColor: ext.enabled ? 'var(--button-bg)' : 'var(--input-bg)',
                      color: 'var(--button-fg)'
                    }}
                  >
                    {ext.enabled ? '禁用' : '启用'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
                  <span>v{ext.version}</span>
                  {ext.author && <span>{ext.author}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* 空状态 */}
          {filteredExtensions.length === 0 && (
            <div className="text-center text-sm py-8" style={{ color: 'var(--sidebar-fg)', opacity: 0.6 }}>
              未找到扩展
            </div>
          )}
        </>
      )}
    </div>
  );
};
