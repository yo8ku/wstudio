/**
 * Helpers for resolving plugin-local files into the internal extension asset protocol.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export const EXTENSION_ASSET_PROTOCOL_SCHEME = 'wstudio-extension';

function isPathInsideRoot(rootDirectory: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDirectory, targetPath);
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

export function resolveExtensionAssetUrl(
  extensionId: string,
  rootDirectory: string,
  assetPath: string | undefined,
): string | null {
  if (!assetPath || assetPath.trim().length === 0) {
    return null;
  }

  const normalizedAssetPath = assetPath.trim().replace(/\\/g, '/');
  const absoluteAssetPath = path.resolve(rootDirectory, normalizedAssetPath);
  if (!isPathInsideRoot(rootDirectory, absoluteAssetPath)) {
    return null;
  }

  if (!fs.existsSync(absoluteAssetPath)) {
    return null;
  }

  try {
    const assetStats = fs.statSync(absoluteAssetPath);
    if (!assetStats.isFile()) {
      return null;
    }

    const encodedPath = normalizedAssetPath
      .split('/')
      .filter(segment => segment.length > 0)
      .map(segment => encodeURIComponent(segment))
      .join('/');
    const cacheToken = Math.trunc(assetStats.mtimeMs).toString(36);

    return `${EXTENSION_ASSET_PROTOCOL_SCHEME}://${extensionId}/${encodedPath}?v=${cacheToken}`;
  } catch {
    return null;
  }
}
