/**
 * Resolves whether a discovered plugin should run in the main process or the
 * supervisor utility process.
 */

import { app } from 'electron';
import * as path from 'node:path';
import type { PluginSupervisorPluginRuntimeOwner } from './pluginSupervisorProtocol';
import { resolveProjectPath } from '../../utils/projectRoot';

const BUILTIN_PLUGIN_DIRECTORY_CANDIDATES = [
  path.join('packages', 'builtin-plugins'),
  path.join('resources', 'builtin-plugins'),
] as const;

function normalizePathForComparison(targetPath: string): string {
  return path.resolve(targetPath).replace(/\\/g, '/').toLowerCase();
}

function isInsideDirectory(targetPath: string, directoryPath: string): boolean {
  const normalizedTargetPath = normalizePathForComparison(targetPath);
  const normalizedDirectoryPath = normalizePathForComparison(directoryPath);

  return normalizedTargetPath === normalizedDirectoryPath
    || normalizedTargetPath.startsWith(`${normalizedDirectoryPath}/`);
}

function resolveBuiltinPluginRoots(): readonly string[] {
  const resolvedRoots = new Set<string>();
  const projectAppPath = app.getAppPath();

  for (const directory of BUILTIN_PLUGIN_DIRECTORY_CANDIDATES) {
    resolvedRoots.add(path.resolve(resolveProjectPath(directory)));
    resolvedRoots.add(path.resolve(projectAppPath, directory));
  }

  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    resolvedRoots.add(path.resolve(process.resourcesPath, 'builtin-plugins'));

    for (const directory of BUILTIN_PLUGIN_DIRECTORY_CANDIDATES) {
      resolvedRoots.add(path.resolve(process.resourcesPath, directory));
      resolvedRoots.add(path.resolve(process.resourcesPath, 'app.asar.unpacked', directory));
    }
  }

  return [...resolvedRoots];
}

export function isBuiltinPluginRoot(rootDirectory: string): boolean {
  const normalizedRootDirectory = rootDirectory.trim();

  if (normalizedRootDirectory.length === 0) {
    return false;
  }

  return resolveBuiltinPluginRoots().some((builtinRoot) => {
    return isInsideDirectory(normalizedRootDirectory, builtinRoot);
  });
}

export function resolvePluginRuntimeOwner(
  descriptor: {
    readonly rootDirectory: string;
  },
): PluginSupervisorPluginRuntimeOwner {
  return isBuiltinPluginRoot(descriptor.rootDirectory) ? 'main' : 'supervisor';
}

