/**
 * VSIX 安装器 - 安装 VSCode VSIX 扩展包
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yauzl from 'yauzl';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { Extension, ExtensionManifest } from '@note-studio/extension-api/src/types/extension';
import { PackageJsonParser } from './PackageJsonParser';

const openZip = promisify(yauzl.open);

export interface InstallResult {
  extensionId: string;
  extension: Extension;
  success: boolean;
  error?: string;
}

export class VSIXInstaller {
  private parser: PackageJsonParser;

  constructor(private extensionsPath: string) {
    this.parser = new PackageJsonParser();
  }

  /**
   * 安装 VSIX 格式的 VSCode 扩展
   */
  async installVSIX(vsixPath: string): Promise<InstallResult> {
    console.log(`[VSIXInstaller] 开始安装 VSIX: ${vsixPath}`);

    try {
      // 1. 验证 VSIX 文件是否存在
      await this.validateVSIXFile(vsixPath);

      // 2. 创建临时解压目录
      const tempDir = await this.createTempDirectory();

      try {
        // 3. 解压 .vsix 文件
        await this.extractVSIX(vsixPath, tempDir);

        // 4. 解析 package.json
        const manifest = await this.parseManifest(tempDir);

        // 5. 验证兼容性
        this.validateCompatibility(manifest);

        // 6. 安装到 extensions 目录
        const extensionId = this.getExtensionId(manifest);
        const targetPath = await this.installToExtensionsDirectory(tempDir, extensionId);

        // 7. 创建扩展对象
        const extension = this.createExtension(manifest, targetPath);

        console.log(`[VSIXInstaller] 安装成功: ${extensionId}`);
        
        return {
          extensionId,
          extension,
          success: true
        };
      } finally {
        // 清理临时目录
        await this.cleanupTempDirectory(tempDir);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[VSIXInstaller] 安装失败:`, error);
      
      return {
        extensionId: path.basename(vsixPath, '.vsix'),
        extension: {} as Extension,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 从 VSCode Marketplace 下载安装
   */
  async installFromMarketplace(extensionId: string, version?: string): Promise<InstallResult> {
    console.log(`[VSIXInstaller] 从 Marketplace 安装: ${extensionId}`);

    try {
      // 1. 解析扩展 ID（格式：publisher.name）
      const [publisher, name] = extensionId.split('.');
      if (!publisher || !name) {
        throw new Error(`无效的扩展 ID 格式: ${extensionId}`);
      }

      // 2. 构建下载 URL
      const downloadUrl = this.getMarketplaceDownloadUrl(publisher, name, version);

      // 3. 下载 VSIX 文件
      const vsixPath = await this.downloadVSIX(downloadUrl, extensionId);

      // 4. 安装下载的 VSIX
      const result = await this.installVSIX(vsixPath);

      // 5. 清理下载的文件
      await fs.unlink(vsixPath).catch(() => {});

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[VSIXInstaller] Marketplace 安装失败:`, error);
      
      return {
        extensionId,
        extension: {} as Extension,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 卸载扩展
   */
  async uninstall(extensionId: string): Promise<void> {
    const extensionPath = path.join(this.extensionsPath, extensionId);
    await fs.rm(extensionPath, { recursive: true, force: true });
    console.log(`[VSIXInstaller] 卸载完成: ${extensionId}`);
  }

  // ============== 私有方法 ==============

  /**
   * 验证 VSIX 文件
   */
  private async validateVSIXFile(vsixPath: string): Promise<void> {
    try {
      const stats = await fs.stat(vsixPath);
      if (!stats.isFile()) {
        throw new Error(`不是有效的文件: ${vsixPath}`);
      }
      if (!vsixPath.endsWith('.vsix')) {
        throw new Error(`不是 VSIX 文件: ${vsixPath}`);
      }
    } catch (error) {
      throw new Error(`无法访问 VSIX 文件: ${vsixPath}`);
    }
  }

  /**
   * 创建临时目录
   */
  private async createTempDirectory(): Promise<string> {
    const tempDir = path.join(this.extensionsPath, '.tmp', `vsix-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
   * 解压 VSIX 文件（VSIX 是 ZIP 格式）
   */
  private async extractVSIX(vsixPath: string, targetDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      yauzl.open(vsixPath, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) {
          reject(err || new Error('无法打开 ZIP 文件'));
          return;
        }

        zipfile.readEntry();
        
        zipfile.on('entry', (entry) => {
          const entryPath = path.join(targetDir, entry.fileName);

          if (/\/$/.test(entry.fileName)) {
            // 目录
            fs.mkdir(entryPath, { recursive: true })
              .then(() => zipfile.readEntry())
              .catch(reject);
          } else {
            // 文件
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err || !readStream) {
                reject(err || new Error('无法读取文件流'));
                return;
              }

              fs.mkdir(path.dirname(entryPath), { recursive: true })
                .then(() => {
                  const writeStream = createWriteStream(entryPath);
                  readStream.pipe(writeStream);
                  
                  writeStream.on('finish', () => zipfile.readEntry());
                  writeStream.on('error', reject);
                  readStream.on('error', reject);
                })
                .catch(reject);
            });
          }
        });

        zipfile.on('end', () => resolve());
        zipfile.on('error', reject);
      });
    });
  }

  /**
   * 解析扩展清单
   */
  private async parseManifest(extractedDir: string): Promise<ExtensionManifest> {
    // VSIX 内部结构：extension/package.json
    const possiblePaths = [
      path.join(extractedDir, 'extension', 'package.json'),
      path.join(extractedDir, 'package.json')
    ];

    for (const manifestPath of possiblePaths) {
      try {
        const content = await fs.readFile(manifestPath, 'utf-8');
        const manifest = this.parser.parse(content);
        
        if (!this.parser.validate(manifest)) {
          throw new Error('无效的 package.json');
        }
        
        return manifest;
      } catch (error) {
        // 继续尝试下一个路径
      }
    }

    throw new Error('找不到有效的 package.json');
  }

  /**
   * 验证兼容性
   */
  private validateCompatibility(manifest: ExtensionManifest): void {
    // 检查引擎版本
    if (manifest.engines?.vscode) {
      console.log(`[VSIXInstaller] VSCode 引擎版本要求: ${manifest.engines.vscode}`);
      // 这里可以添加更详细的版本兼容性检查
    }

    // 检查必需的字段
    if (!manifest.name || !manifest.version) {
      throw new Error('扩展清单缺少必需字段: name 或 version');
    }
  }

  /**
   * 获取扩展 ID
   */
  private getExtensionId(manifest: ExtensionManifest): string {
    if (manifest.publisher) {
      return `${manifest.publisher}.${manifest.name}`;
    }
    return manifest.name;
  }

  /**
   * 安装到扩展目录
   */
  private async installToExtensionsDirectory(sourceDir: string, extensionId: string): Promise<string> {
    const targetPath = path.join(this.extensionsPath, extensionId);
    
    // 如果已存在，先删除
    await fs.rm(targetPath, { recursive: true, force: true });
    
    // 移动文件
    const extensionDir = path.join(sourceDir, 'extension');
    const sourceToMove = await fs.stat(extensionDir).then(() => extensionDir).catch(() => sourceDir);
    
    await fs.rename(sourceToMove, targetPath);
    
    return targetPath;
  }

  /**
   * 创建扩展对象
   */
  private createExtension(manifest: ExtensionManifest, extensionPath: string): Extension {
    return {
      id: this.getExtensionId(manifest),
      name: manifest.displayName || manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.publisher,
      main: manifest.main,
      enabled: true,
      activationEvents: manifest.activationEvents,
      extensionPath
    };
  }

  /**
   * 清理临时目录
   */
  private async cleanupTempDirectory(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`[VSIXInstaller] 清理临时目录失败: ${tempDir}`, error);
    }
  }

  /**
   * 获取 Marketplace 下载 URL
   */
  private getMarketplaceDownloadUrl(publisher: string, name: string, version?: string): string {
    const versionPart = version || 'latest';
    return `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${publisher}/vsextensions/${name}/${versionPart}/vspackage`;
  }

  /**
   * 下载 VSIX 文件
   */
  private async downloadVSIX(url: string, extensionId: string): Promise<string> {
    const downloadPath = path.join(this.extensionsPath, '.tmp', `${extensionId}.vsix`);
    
    await fs.mkdir(path.dirname(downloadPath), { recursive: true });

    // 使用 fetch 下载（Node.js 18+ 内置）
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`下载失败: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(downloadPath, Buffer.from(arrayBuffer));

    return downloadPath;
  }
}



