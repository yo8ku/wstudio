/**
 * 扩展列表组件
 */

import React, { useState, useEffect } from 'react';
import { ExtensionCard } from './ExtensionCard';
import { MarketplaceExtensionCard } from './MarketplaceExtensionCard';
import { IExtensionInfo } from '../../types/electron';

interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
}

interface ExtensionListProps {
  extensions?: IExtensionInfo[];
  onInstall?: (extensionId: string, version?: string) => void;
  installingExtensions?: Set<string>;
}

export const ExtensionList: React.FC<ExtensionListProps> = ({ 
  extensions = [], 
  onInstall,
  installingExtensions = new Set()
}) => {
  const [localExtensions, setLocalExtensions] = useState<Extension[]>([]);

  useEffect(() => {
    if (extensions.length === 0) {
      loadExtensions();
    }
  }, [extensions]);

  const loadExtensions = async () => {
    const api = window.electronAPI;
    if (!api) return;
    
    try {
      const exts = await api.extension.list();
      setLocalExtensions(exts);
    } catch (error) {
      console.error('加载扩展列表失败:', error);
    }
  };

  if (extensions.length > 0 && onInstall) {
    // 显示市场扩展列表
    return (
      <div className="extension-list">
        {extensions.map(ext => (
          <MarketplaceExtensionCard
            key={ext.extensionId}
            extension={ext}
            onInstall={onInstall}
            installing={installingExtensions.has(ext.extensionId)}
          />
        ))}
      </div>
    );
  }

  // 显示本地已安装扩展列表
  return (
    <div className="extension-list">
      {localExtensions.map(ext => (
        <ExtensionCard key={ext.id} extension={ext} />
      ))}
    </div>
  );
};



