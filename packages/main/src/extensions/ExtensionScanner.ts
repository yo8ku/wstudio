/**
 * 扩展扫描器 - 扫描原生扩展
 */

import { Extension } from './types/extension';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ExtensionScanner {
  constructor(private extensionsPath: string) {}

  async scanExtensions(): Promise<Extension[]> {
    console.log(`[ExtensionScanner] 扫描扩展目录: ${this.extensionsPath}`);
    
    try {
      // 检查目录是否存在
      try {
        await fs.access(this.extensionsPath);
      } catch (accessError) {
        const err = accessError as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
          console.warn(`[ExtensionScanner] 扩展目录不存在: ${this.extensionsPath}`);
          console.log('[ExtensionScanner] 将返回空扩展列表');
          return [];
        }
        throw accessError;
      }
      
      const dirs = await fs.readdir(this.extensionsPath, { withFileTypes: true });
      console.log(`[ExtensionScanner] 找到 ${dirs.length} 个项目`);
      const extensions: Extension[] = [];

      for (const dir of dirs) {
        console.log(`[ExtensionScanner] 检查: ${dir.name}, 是否为目录: ${dir.isDirectory()}`);
        if (dir.isDirectory()) {
          const ext = await this.loadExtensionManifest(path.join(this.extensionsPath, dir.name));
          if (ext) {
            console.log(`[ExtensionScanner] 成功加载扩展: ${ext.name}`);
            extensions.push(ext);
          }
        }
      }

      console.log(`[ExtensionScanner] 共找到 ${extensions.length} 个扩展`);
      return extensions;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        console.warn(`[ExtensionScanner] 扩展目录不存在: ${this.extensionsPath}`);
        console.log('[ExtensionScanner] 将返回空扩展列表');
        return [];
      }
      console.error('[ExtensionScanner] 扫描失败:', error);
      return [];
    }
  }

  private async loadExtensionManifest(extensionPath: string): Promise<Extension | null> {
    try {
      const manifestPath = path.join(extensionPath, 'package.json');
      await fs.access(manifestPath);
      console.log(`[ExtensionScanner] 尝试读取清单: ${manifestPath}`);
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      return {
        id: manifest.name,
        name: manifest.displayName || manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.publisher || manifest.author,
        main: manifest.main,
        enabled: true,
        activationEvents: manifest.activationEvents,
        extensionPath
      };
    } catch (error) {
      console.error(`[ExtensionScanner] 读取清单失败: ${extensionPath}`, error);
      return null;
    }
  }
}
