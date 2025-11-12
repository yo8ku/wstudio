/**
 * 插件管理器界面组件
 */

import React, { useEffect, useState } from 'react';

interface Extension {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  extensionPath: string;
}

export interface ExtensionManagerProps {
  // 预留 props，目前为空
}

export const ExtensionManager: React.FC<ExtensionManagerProps> = () => {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [selectedExtension, setSelectedExtension] = useState<Extension | null>(null);

  useEffect(() => {
    loadExtensions();
  }, []);

  const loadExtensions = async () => {
    try {
      // 从主进程获取扩展列表
      const result = await window.electron?.ipcRenderer.invoke('extension:list');
      console.log('[ExtensionManager] 加载的扩展', result);
      if (result) {
        setExtensions(result);
      }
    } catch (error) {
      console.error('[ExtensionManager] 加载扩展失败:', error);
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
      console.error('[ExtensionManager] 切换扩展失败:', error);
    }
  };

  return (
    <div className="extension-manager flex h-full" style={{ backgroundColor: 'var(--ws-editor-background)', color: 'var(--ws-editor-foreground)' }}>
      {/* 左侧扩展列表 */}
      <div className="extension-list w-80 border-r flex flex-col" style={{ borderColor: 'var(--ws-contrast-border)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--ws-contrast-border)' }}>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--ws-editor-foreground)' }}>扩展管理</h2>
          <p className="text-sm" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
            已安装 {extensions.length} 个扩展
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {extensions.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
              <p className="text-4xl mb-4">Extension</p>
              <p>暂无已安装的扩展</p>
              <p className="text-sm mt-2">从扩展市场安装扩展</p>
            </div>
          ) : (
            extensions.map(ext => (
              <div
                key={ext.id}
                className="p-4 cursor-pointer border-b hover:opacity-90 transition-colors"
                style={{
                  borderColor: 'var(--ws-contrast-border)',
                  backgroundColor: selectedExtension?.id === ext.id ? 'var(--ws-list-active-selection-background)' : 'transparent'
                }}
                onClick={() => setSelectedExtension(ext)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium mb-1" style={{ color: 'var(--ws-editor-foreground)' }}>{ext.name}</h3>
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
                      {ext.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>v{ext.version}</span>
                      <span className="text-xs" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>{ext.author}</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExtension(ext.id);
                      }}
                      className="px-3 py-1 rounded text-sm transition-colors"
                      style={{
                        backgroundColor: ext.enabled ? 'var(--ws-button-background)' : 'var(--ws-input-background)',
                        color: ext.enabled ? 'var(--ws-button-foreground)' : 'var(--ws-editor-foreground)'
                      }}
                    >
                      {ext.enabled ? '已启用' : '已禁用'}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧扩展详情 */}
      <div className="extension-detail flex-1 overflow-auto">
        {selectedExtension ? (
          <div className="p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ws-editor-foreground)' }}>
                {selectedExtension.name}
              </h1>
              <p className="mb-4" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
                {selectedExtension.description}
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
                  版本: <span style={{ color: 'var(--ws-editor-foreground)' }}>{selectedExtension.version}</span>
                </span>
                <span style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
                  作者: <span style={{ color: 'var(--ws-editor-foreground)' }}>{selectedExtension.author}</span>
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  selectedExtension.enabled
                    ? 'bg-green-900/30 text-green-400'
                    : 'bg-gray-700 text-gray-400'
                }`}>
                  {selectedExtension.enabled ? '已启用' : '已禁用'}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--ws-editor-foreground)' }}>扩展信息</h3>
                <div className="rounded-lg p-4 space-y-2" style={{ backgroundColor: 'var(--ws-sidebar-background)' }}>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>扩展 ID</span>
                    <span className="font-mono text-sm" style={{ color: 'var(--ws-editor-foreground)' }}>{selectedExtension.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>安装路径</span>
                    <span className="font-mono text-sm truncate ml-4" style={{ color: 'var(--ws-editor-foreground)' }} title={selectedExtension.extensionPath}>
                      {selectedExtension.extensionPath.split(/[/\\]/).pop()}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--ws-editor-foreground)' }}>操作</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => toggleExtension(selectedExtension.id)}
                    className="px-4 py-2 rounded transition-colors"
                    style={{
                      backgroundColor: selectedExtension.enabled ? 'var(--ws-input-background)' : 'var(--ws-button-background)',
                      color: selectedExtension.enabled ? 'var(--ws-editor-foreground)' : 'var(--ws-button-foreground)'
                    }}
                  >
                    {selectedExtension.enabled ? '禁用扩展' : '启用扩展'}
                  </button>
                  <button
                    onClick={() => {
                      // TODO: 卸载扩展
                      console.log('卸载扩展:', selectedExtension.id);
                    }}
                    className="px-4 py-2 bg-red-900/30 text-red-400 rounded hover:bg-red-900/50 transition-colors"
                  >
                    卸载扩展
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--ws-editor-foreground)' }}>README</h3>
                <div className="rounded-lg p-4" style={{ backgroundColor: 'var(--ws-sidebar-background)' }}>
                  <p style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
                    暂无扩展说明文档
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center" style={{ color: 'var(--ws-editor-foreground)', opacity: 0.6 }}>
            <div className="text-center">
              <p className="text-6xl mb-4">🧩</p>
              <p>选择一个扩展查看详情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};