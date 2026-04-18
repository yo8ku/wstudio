/**
 * Shared renderer helpers for plugin UI scope matching.
 */

import type { PluginUiEntrySnapshot } from '@note-studio/shared';

export function resolvePluginUiSourceFileExtension(
  sourcePath: string | null | undefined,
): string | null {
  if (!sourcePath) {
    return null;
  }

  const normalizedPath = sourcePath.trim();
  const fileName = normalizedPath.split(/[\\/]/).at(-1) ?? '';
  const dotIndex = fileName.lastIndexOf('.');

  if (dotIndex < 0 || dotIndex === fileName.length - 1) {
    return null;
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

export function matchesPluginUiEntryScope(
  entry: Pick<PluginUiEntrySnapshot, 'scope'>,
  viewType: string | null | undefined,
  sourcePath: string | null | undefined,
): boolean {
  const scope = entry.scope;

  if (scope === null) {
    return true;
  }

  if (scope.viewType !== undefined && scope.viewType !== viewType) {
    return false;
  }

  if (scope.fileExtensions === undefined || scope.fileExtensions.length === 0) {
    return true;
  }

  const sourceExtension = resolvePluginUiSourceFileExtension(sourcePath);

  if (sourceExtension === null) {
    return false;
  }

  return scope.fileExtensions.some(
    (extension) => extension.replace(/^\./, '').toLowerCase() === sourceExtension,
  );
}
