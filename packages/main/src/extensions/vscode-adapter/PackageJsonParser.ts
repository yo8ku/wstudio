/**
 * Package.json 解析器
 */

import { ExtensionManifest } from '@note-studio/extension-api/src/types/extension';

export class PackageJsonParser {
  parse(json: string): ExtensionManifest {
    const data = JSON.parse(json);
    
    return {
      name: data.name,
      displayName: data.displayName,
      version: data.version,
      publisher: data.publisher,
      description: data.description,
      main: data.main,
      engines: data.engines,
      activationEvents: data.activationEvents,
      contributes: data.contributes
    };
  }

  validate(manifest: ExtensionManifest): boolean {
    return !!(manifest.name && manifest.version);
  }
}



