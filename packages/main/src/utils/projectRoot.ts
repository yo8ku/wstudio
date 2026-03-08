/**
 * Resolve the repository root for main-process services that need prompt or asset files.
 */

import * as fs from 'fs';
import * as path from 'path';

function hasRepositoryMarkers(rootPath: string): boolean {
  const markers = [
    path.join(rootPath, 'packages'),
    path.join(rootPath, 'specifications.md'),
  ];

  return markers.every(markerPath => fs.existsSync(markerPath));
}

export function getProjectRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(__dirname, '../../../../../../'),
    path.resolve(__dirname, '../../../../../'),
    path.resolve(__dirname, '../../../../'),
  ];

  for (const candidate of candidates) {
    if (hasRepositoryMarkers(candidate)) {
      return candidate;
    }
  }

  return process.cwd();
}

export function resolveProjectPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}
