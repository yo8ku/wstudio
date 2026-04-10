import React, { useEffect, useState } from 'react';
import { Icon } from '../../../Icons';
import { MOCK_LOCAL_EXTENSIONS } from '../../Sidebar/Extensions/mockExtensions';
import { loadInstalledPluginExtensions, subscribeInstalledPluginExtensions } from '../../Sidebar/Extensions/installedPluginExtensions';
import type { LocalExtensionItem } from '../../Sidebar/Extensions/types';
import './ExtensionView.scss';

interface ExtensionViewProps {
  readonly extensionPath: string;
}

const EXTENSION_PATH_PREFIX = 'extension:/';

function getExtensionId(extensionPath: string): string {
  if (!extensionPath.startsWith(EXTENSION_PATH_PREFIX)) {
    return extensionPath;
  }

  return extensionPath.slice(EXTENSION_PATH_PREFIX.length);
}

function findExtension(extensionPath: string): LocalExtensionItem | null {
  const extensionId = getExtensionId(extensionPath);
  return MOCK_LOCAL_EXTENSIONS.find(item => item.id === extensionId) ?? null;
}

export const ExtensionView: React.FC<ExtensionViewProps> = ({ extensionPath }) => {
  const [installedPluginExtensions, setInstalledPluginExtensions] = useState<readonly LocalExtensionItem[]>([]);
  const extensionId = getExtensionId(extensionPath);

  useEffect(() => {
    let disposed = false;

    const refreshInstalledPluginExtensions = async (): Promise<void> => {
      try {
        const nextExtensions = await loadInstalledPluginExtensions();

        if (!disposed) {
          setInstalledPluginExtensions(nextExtensions);
        }
      } catch (error) {
        console.error('[ExtensionView] failed to load installed plugin extensions:', error);

        if (!disposed) {
          setInstalledPluginExtensions([]);
        }
      }
    };

    void refreshInstalledPluginExtensions();

    const unsubscribe = subscribeInstalledPluginExtensions(() => {
      void refreshInstalledPluginExtensions();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const extension = installedPluginExtensions.find(item => item.id === extensionId)
    ?? findExtension(extensionPath);

  if (!extension) {
    return (
      <div className="extension-view extension-view--empty">
        <div className="extension-view__empty">未找到对应的扩展详情。</div>
      </div>
    );
  }

  return (
    <div className="extension-view">
      <header className="extension-view__header">
        <div className="extension-view__icon">
          {extension.iconPath ? (
            <img
              src={extension.iconPath}
              alt=""
              className="extension-view__icon-image"
              aria-hidden="true"
            />
          ) : (
            <Icon name={extension.iconName} size={26} />
          )}
        </div>
        <div className="extension-view__heading">
          <p className="extension-view__eyebrow">Extension</p>
          <h1 className="extension-view__title" title={extension.displayName}>
            {extension.displayName}
          </h1>
        </div>
      </header>

      <p className="extension-view__description">{extension.description}</p>
    </div>
  );
};
