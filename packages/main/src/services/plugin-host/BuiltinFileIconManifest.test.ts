import { access, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { PluginManifest } from '@note-studio/plugin';

const BUILTIN_FILE_ICON_PLUGIN_ROOT = path.resolve(
  __dirname,
  '../../../../..',
  'packages',
  'builtin-plugins',
  'wstudio-builtin-MaterialIcon',
);

function parseManifest(manifestText: string): PluginManifest {
  return JSON.parse(manifestText) as PluginManifest;
}

function collectReferencedAssetPaths(manifest: PluginManifest): readonly string[] {
  const fileIcons = manifest.contributes?.fileIcons;

  if (fileIcons === undefined) {
    return [];
  }

  return [
    fileIcons.file,
    fileIcons.directory,
    ...(fileIcons.directoryExpanded ? [fileIcons.directoryExpanded] : []),
    ...(fileIcons.mappings ?? []).map((mapping) => mapping.icon),
  ];
}

describe('wstudio-builtin-MaterialIcon manifest', () => {
  it('references only existing file icon assets', async () => {
    const manifestPath = path.join(BUILTIN_FILE_ICON_PLUGIN_ROOT, 'manifest.json');
    const manifestText = await readFile(manifestPath, 'utf8');
    const manifest = parseManifest(manifestText);
    const referencedAssetPaths = collectReferencedAssetPaths(manifest);

    expect(manifest.contributes?.fileIcons).toBeDefined();
    expect(referencedAssetPaths.length).toBeGreaterThan(0);

    const missingAssetPaths: string[] = [];

    for (const referencedAssetPath of referencedAssetPaths) {
      const absoluteAssetPath = path.join(BUILTIN_FILE_ICON_PLUGIN_ROOT, referencedAssetPath);

      try {
        await access(absoluteAssetPath);
      } catch {
        missingAssetPaths.push(referencedAssetPath);
      }
    }

    expect(missingAssetPaths).toEqual([]);
  });
});
