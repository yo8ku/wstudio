/**
 * VSCode Marketplace 集成模块
 * 提供扩展搜索、下载和管理功能
 */

export {
  MarketplaceClient,
  IExtensionInfo,
  IExtensionVersion,
  MarketplaceExtension
} from './MarketplaceClient';

export { ExtensionDownloader } from './ExtensionDownloader';
export { ExtensionInstaller } from './ExtensionInstaller';
export { ExtensionUpdater } from './ExtensionUpdater';



