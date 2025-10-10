/**
 * 扩展更新器
 */

import { MarketplaceClient } from './MarketplaceClient';
import { Extension } from '@note-studio/extension-api/src/types/extension';

export class ExtensionUpdater {
  private marketplaceClient: MarketplaceClient;

  constructor() {
    this.marketplaceClient = new MarketplaceClient();
  }

  async checkUpdates(extensions: Extension[]): Promise<Map<string, string>> {
    const updates = new Map<string, string>();
    
    for (const ext of extensions) {
      const marketplaceExt = await this.marketplaceClient.getExtension(ext.id);
      if (marketplaceExt && this.isNewer(marketplaceExt.version, ext.version)) {
        updates.set(ext.id, marketplaceExt.version);
      }
    }
    
    return updates;
  }

  private isNewer(newVersion: string, currentVersion: string): boolean {
    // 简化的版本比较
    return newVersion > currentVersion;
  }
}



