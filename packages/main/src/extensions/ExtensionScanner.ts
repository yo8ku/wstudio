/**
 * 扩展扫描器 - 扫描 VSCode 扩展和原生扩展
 */

import { Extension } from '@note-studio/extension-api/src/types/extension';
import * as fs from 'fs/promises';
import * as path from 'path';

export class ExtensionScanner {
  constructor(private extensionsPath: string) {}

  async scanExtensions(): Promise<Extension[]> {
    console.log(`[ExtensionScanner] 扫描扩展目录: ${this.extensionsPath}`);
    
    try {
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
      console.error('[ExtensionScanner] 扫描失败:', error);
      return [];
    }
  }

  private async loadExtensionManifest(extensionPath: string): Promise<Extension | null> {
    try {
      // 首先尝试直接读取 package.json
      let manifestPath = path.join(extensionPath, 'package.json');
      let actualExtensionPath = extensionPath;
      
      try {
        await fs.access(manifestPath);
      } catch {
        // 如果直接路径不存在，尝试 extension 子目录（VSIX 扩展结构）
        const extensionSubPath = path.join(extensionPath, 'extension');
        const subManifestPath = path.join(extensionSubPath, 'package.json');
        
        try {
          await fs.access(subManifestPath);
          manifestPath = subManifestPath;
          actualExtensionPath = extensionSubPath;
          console.log(`[ExtensionScanner] 发现 VSIX 扩展结构: ${extensionSubPath}`);
        } catch {
          // 都不存在，跳过
          return null;
        }
      }

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
        extensionPath: actualExtensionPath
      };
    } catch (error) {
      console.error(`[ExtensionScanner] 读取清单失败: ${extensionPath}`, error);
      return null;
    }
  }
}
