/**
 * 扩展市场客户端 - 连接 VSCode Marketplace
 */

import * as https from 'https';
import * as http from 'http';

export interface IExtensionInfo {
  extensionId: string;
  extensionName: string;
  displayName: string;
  publisher: {
    publisherId: string;
    publisherName: string;
    displayName: string;
  };
  version: string;
  description: string;
  installCount: number;
  rating: number;
  ratingCount: number;
  categories: string[];
  tags: string[];
  versions: IExtensionVersion[];
  icon?: string;
  publishedDate?: string;
  lastUpdated?: string;
}

export interface IExtensionVersion {
  version: string;
  lastUpdated: string;
  assetUri: string;
  fallbackAssetUri: string;
}

export interface MarketplaceExtension {
  id: string;
  name: string;
  publisher: string;
  version: string;
  description: string;
  downloadUrl: string;
}

interface MarketplaceQueryResult {
  results: Array<{
    extensions: Array<{
      publisher: { publisherName: string; displayName: string; publisherId: string };
      extensionId: string;
      extensionName: string;
      displayName: string;
      shortDescription: string;
      versions: Array<{
        version: string;
        lastUpdated: string;
        assetUri: string;
        fallbackAssetUri: string;
        files: Array<{
          assetType: string;
          source: string;
        }>;
      }>;
      statistics: Array<{
        statisticName: string;
        value: number;
      }>;
      categories?: string[];
      tags?: string[];
    }>;
  }>;
}

export class MarketplaceClient {
  private readonly API_URL = 'https://marketplace.visualstudio.com/_apis/public/gallery';
  private readonly baseUrl = 'https://marketplace.visualstudio.com/_apis/public/gallery';

  /**
   * 搜索 VSCode 扩展
   */
  async searchExtensions(query: string, pageSize: number = 20): Promise<IExtensionInfo[]> {
    try {
      const requestBody = {
        filters: [
          {
            criteria: [
              { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
              { filterType: 10, value: query }
            ],
            pageSize,
            pageNumber: 1,
            sortBy: 0,
            sortOrder: 0
          }
        ],
        assetTypes: ['Microsoft.VisualStudio.Services.Icons.Default'],
        flags: 914
      };

      const result = await this.postRequest<MarketplaceQueryResult>(
        `${this.API_URL}/extensionquery`,
        requestBody
      );

      return this.parseSearchResults(result);
    } catch (error) {
      console.error('[MarketplaceClient] 搜索扩展失败:', error);
      throw new Error(`搜索扩展失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 下载扩展
   */
  async downloadExtension(extensionId: string, version: string): Promise<Buffer> {
    try {
      const [publisher, name] = extensionId.split('.');
      
      if (!publisher || !name) {
        throw new Error(`无效的扩展 ID: ${extensionId}`);
      }

      const downloadUrl = `${this.baseUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
      
      console.log(`[MarketplaceClient] 开始下载扩展: ${extensionId}@${version}`);
      console.log(`[MarketplaceClient] 下载地址: ${downloadUrl}`);

      const buffer = await this.downloadFile(downloadUrl);
      
      console.log(`[MarketplaceClient] 下载完成，大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
      
      return buffer;
    } catch (error) {
      console.error('[MarketplaceClient] 下载扩展失败:', error);
      throw new Error(`下载扩展失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取扩展详情
   */
  async getExtensionDetails(extensionId: string): Promise<IExtensionInfo | null> {
    try {
      const [publisher, name] = extensionId.split('.');
      
      if (!publisher || !name) {
        throw new Error(`无效的扩展 ID: ${extensionId}`);
      }

      const requestBody = {
        filters: [
          {
            criteria: [
              { filterType: 7, value: `${publisher}.${name}` }
            ],
            pageSize: 1,
            pageNumber: 1
          }
        ],
        assetTypes: ['Microsoft.VisualStudio.Services.Icons.Default'],
        flags: 914
      };

      const result = await this.postRequest<MarketplaceQueryResult>(
        `${this.API_URL}/extensionquery`,
        requestBody
      );

      const extensions = this.parseSearchResults(result);
      return extensions.length > 0 ? extensions[0] : null;
    } catch (error) {
      console.error('[MarketplaceClient] 获取扩展详情失败:', error);
      return null;
    }
  }

  /**
   * 解析搜索结果
   */
  private parseSearchResults(result: MarketplaceQueryResult): IExtensionInfo[] {
    if (!result.results || result.results.length === 0) {
      return [];
    }

    const extensions = result.results[0].extensions || [];
    
    return extensions.map(ext => {
      const version = ext.versions[0];
      const statistics = ext.statistics || [];
      
      const installCount = statistics.find(s => s.statisticName === 'install')?.value || 0;
      const rating = statistics.find(s => s.statisticName === 'averagerating')?.value || 0;
      const ratingCount = statistics.find(s => s.statisticName === 'ratingcount')?.value || 0;

      // 获取图标 URL
      const iconFile = version?.files?.find(f => f.assetType === 'Microsoft.VisualStudio.Services.Icons.Default');
      const icon = iconFile ? iconFile.source : undefined;

      return {
        extensionId: ext.extensionId,
        extensionName: ext.extensionName,
        displayName: ext.displayName || ext.extensionName,
        publisher: {
          publisherId: ext.publisher.publisherId,
          publisherName: ext.publisher.publisherName,
          displayName: ext.publisher.displayName || ext.publisher.publisherName
        },
        version: version?.version || '0.0.0',
        description: ext.shortDescription || '',
        installCount,
        rating,
        ratingCount,
        categories: ext.categories || [],
        tags: ext.tags || [],
        versions: ext.versions.map(v => ({
          version: v.version,
          lastUpdated: v.lastUpdated,
          assetUri: v.assetUri,
          fallbackAssetUri: v.fallbackAssetUri
        })),
        icon,
        lastUpdated: version?.lastUpdated
      };
    });
  }

  /**
   * 发送 POST 请求
   */
  private async postRequest<T>(url: string, body: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const postData = JSON.stringify(body);

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json;api-version=3.0-preview.1',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * 下载文件
   */
  private async downloadFile(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Accept': 'application/octet-stream'
        }
      };

      const req = protocol.request(options, (res) => {
        // 处理重定向
        if (res.statusCode && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308)) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl).then(resolve).catch(reject);
            return;
          }
        }

        if (res.statusCode && res.statusCode !== 200) {
          reject(new Error(`下载失败: HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.end();
    });
  }

  /**
   * 获取扩展（兼容旧方法）
   */
  async getExtension(extensionId: string): Promise<MarketplaceExtension | null> {
    const details = await this.getExtensionDetails(extensionId);
    if (!details) return null;

    return {
      id: details.extensionId,
      name: details.extensionName,
      publisher: details.publisher.publisherName,
      version: details.version,
      description: details.description,
      downloadUrl: `${this.baseUrl}/publishers/${details.publisher.publisherName}/vsextensions/${details.extensionName}/${details.version}/vspackage`
    };
  }

  /**
   * 搜索（兼容旧方法）
   */
  async search(query: string): Promise<MarketplaceExtension[]> {
    const extensions = await this.searchExtensions(query);
    return extensions.map(ext => ({
      id: ext.extensionId,
      name: ext.extensionName,
      publisher: ext.publisher.publisherName,
      version: ext.version,
      description: ext.description,
      downloadUrl: `${this.baseUrl}/publishers/${ext.publisher.publisherName}/vsextensions/${ext.extensionName}/${ext.version}/vspackage`
    }));
  }

  /**
   * 获取下载 URL（兼容旧方法）
   */
  async getDownloadUrl(extensionId: string, version: string): Promise<string> {
    const [publisher, name] = extensionId.split('.');
    return `${this.baseUrl}/publishers/${publisher}/vsextensions/${name}/${version}/vspackage`;
  }
}



