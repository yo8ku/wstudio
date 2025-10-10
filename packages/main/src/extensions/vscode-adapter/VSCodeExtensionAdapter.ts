/**
 * VSCode 扩展适配器 - 适配 VSCode 扩展到 Note Studio
 */

import { Extension } from '@note-studio/extension-api/src/types/extension';

export class VSCodeExtensionAdapter {
  adaptExtension(vscodeExtension: any): Extension {
    return {
      id: vscodeExtension.id,
      name: vscodeExtension.manifest.displayName || vscodeExtension.manifest.name,
      version: vscodeExtension.manifest.version,
      description: vscodeExtension.manifest.description,
      main: vscodeExtension.manifest.main,
      enabled: true,
      activationEvents: vscodeExtension.manifest.activationEvents
    };
  }

  isCompatible(manifest: any): boolean {
    // 检查是否为 VSCode 扩展
    return manifest.engines?.vscode !== undefined;
  }

  getRequiredVersion(manifest: any): string | undefined {
    return manifest.engines?.vscode;
  }
}



