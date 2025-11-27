/**
 * 扩展卡片组件
 */

import React from 'react';

interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
}

interface ExtensionCardProps {
  extension: Extension;
}

export const ExtensionCard: React.FC<ExtensionCardProps> = ({ extension }) => {
  return (
    <div className="extension-card">
      <h3>{extension.name}</h3>
      <p className="version">v{extension.version}</p>
      {extension.description && <p className="description">{extension.description}</p>}
      <div className="actions">
        <button>{extension.enabled ? '禁用' : '启用'}</button>
      </div>
    </div>
  );
};



