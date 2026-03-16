import React, { useEffect, useState } from 'react';
import './ExtensionManagerView.scss';

type ExtensionCategory =
  | 'downloaded'
  | 'themes'
  | 'file-icons'
  | 'plugins'
  | 'widgets'
  | 'templates';

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

interface InstalledExtensionRecord {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  enabled?: boolean;
}

interface CategoryOption {
  id: ExtensionCategory;
  label: string;
}

const CATEGORIES: CategoryOption[] = [
  { id: 'downloaded', label: '\u5df2\u4e0b\u8f7d' },
  { id: 'themes', label: '\u4e3b\u9898' },
  { id: 'file-icons', label: '\u6587\u4ef6\u56fe\u6807' },
  { id: 'plugins', label: '\u63d2\u4ef6' },
  { id: 'widgets', label: '\u6302\u4ef6' },
  { id: 'templates', label: '\u6a21\u677f' },
];

export const ExtensionManagerView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ExtensionCategory>('downloaded');
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadExtensions();
  }, [activeCategory]);

  const loadExtensions = async (): Promise<void> => {
    setLoading(true);
    try {
      if (activeCategory !== 'downloaded') {
        setExtensions([]);
        return;
      }

      const result = (await window.electron?.ipcRenderer.invoke(
        'extension:list'
      )) as InstalledExtensionRecord[] | undefined;

      if (!Array.isArray(result)) {
        setExtensions([]);
        return;
      }

      const mappedExtensions: ExtensionItem[] = result.map((extension) => ({
        id: extension.id,
        name: extension.name,
        description: extension.description,
        version: extension.version,
        author: extension.author,
        enabled: extension.enabled,
        category: 'downloaded',
      }));

      setExtensions(mappedExtensions);
    } catch (error) {
      console.error('[ExtensionManagerView] Failed to load extensions:', error);
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredExtensions = extensions.filter((extension) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return (
      extension.name?.toLowerCase().includes(normalizedQuery) ||
      extension.description?.toLowerCase().includes(normalizedQuery) ||
      extension.author?.toLowerCase().includes(normalizedQuery)
    );
  });

  const toggleExtension = async (extensionId: string): Promise<void> => {
    try {
      const currentExtension = extensions.find((extension) => extension.id === extensionId);
      if (!currentExtension) {
        return;
      }

      const nextEnabled = !currentExtension.enabled;
      await window.electron?.ipcRenderer.invoke('extension:toggle', extensionId, nextEnabled);

      setExtensions((previousExtensions) =>
        previousExtensions.map((extension) =>
          extension.id === extensionId ? { ...extension, enabled: nextEnabled } : extension
        )
      );
    } catch (error) {
      console.error('[ExtensionManagerView] Failed to toggle extension:', error);
    }
  };

  const activeCategoryLabel =
    CATEGORIES.find((category) => category.id === activeCategory)?.label ?? activeCategory;

  return (
    <div className="extension-manager-view">
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
            placeholder="\u641c\u7d22\u6269\u5c55..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery && (
            <button className="clear-button" onClick={() => setSearchQuery('')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 2l10 10M12 2L2 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="extension-manager-categories">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`category-tab ${activeCategory === category.id ? 'active' : ''}`}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="extension-manager-view-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>\u52a0\u8f7d\u4e2d...</p>
          </div>
        ) : filteredExtensions.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="16" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="2" />
              <path d="M28 28h8M28 36h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="empty-title">
              {searchQuery
                ? '\u672a\u627e\u5230\u5339\u914d\u7684\u6269\u5c55'
                : `\u6682\u65e0${activeCategoryLabel}`}
            </p>
            <p className="empty-subtitle">
              {searchQuery
                ? '\u8bf7\u5c1d\u8bd5\u5176\u4ed6\u641c\u7d22\u5173\u952e\u8bcd'
                : '\u4ece\u6269\u5c55\u5e02\u573a\u5b89\u88c5\u6269\u5c55'}
            </p>
          </div>
        ) : (
          <div className="extensions-grid">
            {filteredExtensions.map((extension) => (
              <div key={extension.id} className="extension-card">
                <div className="extension-card-header">
                  <div className="extension-icon">
                    {extension.icon ? (
                      <img src={extension.icon} alt={extension.name} />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                        <rect
                          width="40"
                          height="40"
                          rx="8"
                          fill="var(--ws-button-secondary-background)"
                        />
                        <text
                          x="20"
                          y="26"
                          fontSize="16"
                          fill="currentColor"
                          textAnchor="middle"
                          fontWeight="600"
                        >
                          {(extension.name || 'E').charAt(0).toUpperCase()}
                        </text>
                      </svg>
                    )}
                  </div>
                  <div className="extension-info">
                    <h3 className="extension-name">
                      {extension.name || '\u672a\u547d\u540d\u6269\u5c55'}
                    </h3>
                    <p className="extension-author">
                      {extension.author || '\u672a\u77e5\u4f5c\u8005'}
                    </p>
                  </div>
                </div>

                <p className="extension-description">
                  {extension.description || '\u6682\u65e0\u63cf\u8ff0'}
                </p>

                <div className="extension-card-footer">
                  <span className="extension-version">v{extension.version || '0.0.0'}</span>
                  {extension.enabled !== undefined && (
                    <button
                      className={`extension-toggle ${extension.enabled ? 'enabled' : 'disabled'}`}
                      onClick={() => void toggleExtension(extension.id)}
                    >
                      {extension.enabled ? '\u5df2\u542f\u7528' : '\u5df2\u7981\u7528'}
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
