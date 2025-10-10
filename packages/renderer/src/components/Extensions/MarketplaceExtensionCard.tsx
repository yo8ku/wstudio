/**
 * 市场扩展卡片组件
 */

import React from 'react';
import { IExtensionInfo } from '../../types/electron';

interface MarketplaceExtensionCardProps {
  extension: IExtensionInfo;
  onInstall: (extensionId: string, version?: string) => void;
  installing?: boolean;
}

export const MarketplaceExtensionCard: React.FC<MarketplaceExtensionCardProps> = ({ 
  extension, 
  onInstall, 
  installing = false 
}) => {
  return (
    <div className="marketplace-extension-card">
      <div className="extension-header">
        <div className="extension-icon">
          {extension.icon ? (
            <img src={extension.icon} alt={extension.displayName} />
          ) : (
            <div className="default-icon">{extension.displayName[0]}</div>
          )}
        </div>
        <div className="extension-info">
          <h3 className="extension-name">{extension.displayName}</h3>
          <p className="extension-id">{extension.extensionId}</p>
        </div>
      </div>
      
      {extension.description && (
        <p className="extension-description">{extension.description}</p>
      )}
      
      <div className="extension-footer">
        <div className="extension-meta">
          <span className="version">v{extension.version}</span>
          {extension.publisher && (
            <span className="publisher">{extension.publisher.displayName || extension.publisher.publisherName}</span>
          )}
        </div>
        <button
          className="install-button"
          onClick={() => onInstall(extension.extensionId, extension.version)}
          disabled={installing}
        >
          {installing ? '安装中...' : '安装'}
        </button>
      </div>
    </div>
  );
};
