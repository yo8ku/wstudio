/**
 * 扩展安装器
 */

import { VSIXInstaller } from '../vscode-adapter/VSIXInstaller';
import { ExtensionDownloader } from './ExtensionDownloader';
import { MarketplaceClient } from './MarketplaceClient';

export class ExtensionInstaller {
  private marketplaceClient: MarketplaceClient;
  private downloader: ExtensionDownloader;
  private vsixInstaller: VSIXInstaller;

  constructor(downloadPath: string, extensionsPath: string) {
    this.marketplaceClient = new MarketplaceClient();
    this.downloader = new ExtensionDownloader(downloadPath);
    this.vsixInstaller = new VSIXInstaller(extensionsPath);
  }

  async installFromMarketplace(extensionId: string, version?: string): Promise<void> {
    console.log(`[ExtensionInstaller] 从市场安装: ${extensionId}`);
    
    const extension = await this.marketplaceClient.getExtension(extensionId);
    if (!extension) {
      throw new Error(`Extension ${extensionId} not found`);
    }

    const downloadUrl = await this.marketplaceClient.getDownloadUrl(
      extensionId,
      version || extension.version
    );
    
    const vsixPath = await this.downloader.download(downloadUrl, extensionId);
    await this.vsixInstaller.installVSIX(vsixPath);
  }

  async installFromVSIX(vsixPath: string): Promise<void> {
    await this.vsixInstaller.installVSIX(vsixPath);
  }
}



