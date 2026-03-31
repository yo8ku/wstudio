/**
 * Static extension details view backed by the standalone mock extensions panel data.
 */

import React from 'react';
import { Icon } from '../../../Icons';
import { findMockExtensionPanelItemById } from '../../../ExtensionPanel';
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

function findExtension(extensionPath: string) {
  const extensionId = getExtensionId(extensionPath);
  return findMockExtensionPanelItemById(extensionId);
}

export const ExtensionView: React.FC<ExtensionViewProps> = ({ extensionPath }) => {
  const extension = findExtension(extensionPath);

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
          <Icon name={extension.iconName} size={26} />
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
