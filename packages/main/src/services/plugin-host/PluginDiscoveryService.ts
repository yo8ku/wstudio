/**
 * Scans the host plugin directories and registers validated plugin descriptors.
 */

import { app } from 'electron';
import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  PluginManifest,
  PluginManifestEngines,
  PluginManifestFileIconContribution,
  PluginReleaseChannel,
} from '@note-studio/plugin';
import type { JsonObject, JsonValue } from '@note-studio/shared';
import { resolveProjectPath } from '../../utils/projectRoot';
import {
  type PluginDescriptor,
  type PluginResolvedFileIconTheme,
  type PluginResolvedFileIconThemeMapping,
  type PluginScanFailure,
  type PluginScanSummary,
} from './types';

const DEFAULT_PLUGIN_DIRECTORY_NAME = 'plugins';
const DEFAULT_BUILTIN_PLUGIN_DIRECTORIES = [
  path.join('packages', 'builtin-plugins'),
  path.join('resources', 'builtin-plugins'),
] as const;
const MANIFEST_FILE_NAME = 'manifest.json';
const SUPPORTED_ENTRY_CANDIDATES = ['main.js', 'main.cjs', 'main.mjs'] as const;
const DEFAULT_PLUGIN_ICON_CANDIDATES = ['assets/logo.svg'] as const;

const EMPTY_PLUGIN_SCAN_SUMMARY: PluginScanSummary = {
  roots: [],
  registeredCount: 0,
  failureCount: 0,
  failures: [],
};

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwnProperty(source: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readRequiredString(
  source: JsonObject,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalString(
  source: JsonObject,
  key: string,
): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalBoolean(
  source: JsonObject,
  key: string,
): boolean | undefined {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readOptionalStringArray(
  source: JsonObject,
  key: string,
): readonly string[] | undefined {
  const value = source[key];

  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());

  return result.length > 0 ? result : undefined;
}

function readStringArrayValue(value: JsonValue): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());

  return result.length > 0 ? result : [];
}

function readReleaseChannel(source: JsonObject): PluginReleaseChannel | undefined {
  const value = source.releaseChannel;

  if (value === 'stable' || value === 'development') {
    return value;
  }

  return undefined;
}

function readManifestEngines(source: JsonObject): PluginManifestEngines | undefined {
  const value = source.engines;

  if (!isJsonObject(value)) {
    return undefined;
  }

  const wstudio = readRequiredString(value, 'wstudio');

  if (wstudio === null) {
    return undefined;
  }

  return {
    wstudio,
    pluginApi: readOptionalString(value, 'pluginApi'),
  };
}

function parsePluginManifest(rootDirectory: string, source: JsonObject): PluginManifest | null {
  const id = readRequiredString(source, 'id');
  const name = readRequiredString(source, 'name');
  const author = readRequiredString(source, 'author');
  const version = readRequiredString(source, 'version');
  const description = readRequiredString(source, 'description');
  const engines = readManifestEngines(source);

  if (
    id === null
    || name === null
    || author === null
    || version === null
    || description === null
    || engines === undefined
  ) {
    return null;
  }

  return {
    id,
    name,
    author,
    version,
    description,
    icon: readOptionalString(source, 'icon'),
    releaseChannel: readReleaseChannel(source),
    engines,
    dir: rootDirectory,
    minAppVersion: readOptionalString(source, 'minAppVersion'),
    authorUrl: readOptionalString(source, 'authorUrl'),
    fundingUrl: readOptionalString(source, 'fundingUrl'),
    homepageUrl: readOptionalString(source, 'homepageUrl'),
    repositoryUrl: readOptionalString(source, 'repositoryUrl'),
    keywords: readOptionalStringArray(source, 'keywords'),
    platforms: readOptionalStringArray(source, 'platforms'),
    styles: readOptionalStringArray(source, 'styles'),
    isDesktopOnly: readOptionalBoolean(source, 'isDesktopOnly'),
    contributes: readManifestContributes(source),
  };
}

function readManifestContributes(source: JsonObject): PluginManifest['contributes'] | undefined {
  const contributesValue = source.contributes;

  if (!isJsonObject(contributesValue)) {
    return undefined;
  }

  const fileIcons = readManifestFileIconContribution(contributesValue);

  if (fileIcons === undefined) {
    return undefined;
  }

  return { fileIcons };
}

function readManifestFileIconContribution(
  source: JsonObject,
): PluginManifestFileIconContribution | undefined {
  const fileIconsValue = source.fileIcons;

  if (!isJsonObject(fileIconsValue)) {
    return undefined;
  }

  const label = readRequiredString(fileIconsValue, 'label');
  const file = readRequiredString(fileIconsValue, 'file');
  const directory = readRequiredString(fileIconsValue, 'directory');

  if (label === null || file === null || directory === null) {
    return undefined;
  }

  const mappingsValue = fileIconsValue.mappings;
  const mappings = Array.isArray(mappingsValue)
    ? mappingsValue.flatMap((item) => {
        if (!isJsonObject(item)) {
          return [];
        }

        const icon = readRequiredString(item, 'icon');

        if (icon === null) {
          return [];
        }

        const extensions = readStringArrayValue(item.extensions);
        const fileNames = readStringArrayValue(item.fileNames);

        return [{
          icon,
          extensions: extensions ?? undefined,
          fileNames: fileNames ?? undefined,
        }];
      })
    : undefined;

  return {
    label,
    file,
    directory,
    directoryExpanded: readOptionalString(fileIconsValue, 'directoryExpanded'),
    mappings,
  };
}

function createFailure(
  rootDirectory: string,
  manifestPath: string,
  code: string,
  message: string,
): PluginScanFailure {
  return {
    rootDirectory,
    manifestPath,
    code,
    message,
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isPathWithinDirectory(rootDirectory: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDirectory, targetPath);

  return relativePath.length > 0
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
}

async function resolvePluginAssetPath(
  rootDirectory: string,
  relativePath: string,
): Promise<string | null> {
  const resolvedPath = path.resolve(rootDirectory, relativePath);

  if (!isPathWithinDirectory(rootDirectory, resolvedPath)) {
    return null;
  }

  return await pathExists(resolvedPath) ? resolvedPath : null;
}

async function resolvePluginLogoPath(
  manifest: PluginManifest,
  rootDirectory: string,
): Promise<string | null> {
  if (manifest.icon !== undefined) {
    const resolvedManifestIconPath = await resolvePluginAssetPath(rootDirectory, manifest.icon);

    if (resolvedManifestIconPath !== null) {
      return resolvedManifestIconPath;
    }
  }

  for (const candidate of DEFAULT_PLUGIN_ICON_CANDIDATES) {
    const resolvedCandidatePath = await resolvePluginAssetPath(rootDirectory, candidate);

    if (resolvedCandidatePath !== null) {
      return resolvedCandidatePath;
    }
  }

  return null;
}

function normalizeFileIconToken(value: string): string {
  return value.trim().toLowerCase().replace(/^\./, '');
}

async function resolvePluginFileIconTheme(
  manifest: PluginManifest,
  rootDirectory: string,
): Promise<PluginResolvedFileIconTheme | null> {
  const contribution = manifest.contributes?.fileIcons;

  if (contribution === undefined) {
    return null;
  }

  const fileIconPath = await resolvePluginAssetPath(rootDirectory, contribution.file);
  const directoryIconPath = await resolvePluginAssetPath(rootDirectory, contribution.directory);
  const directoryExpandedIconPath = contribution.directoryExpanded
    ? await resolvePluginAssetPath(rootDirectory, contribution.directoryExpanded)
    : null;

  if (fileIconPath === null || directoryIconPath === null) {
    throw new Error('contributes.fileIcons points to a missing file or directory icon asset.');
  }

  if (contribution.directoryExpanded !== undefined && directoryExpandedIconPath === null) {
    throw new Error('contributes.fileIcons.directoryExpanded points to a missing asset.');
  }

  const mappings: PluginResolvedFileIconThemeMapping[] = [];

  for (const mapping of contribution.mappings ?? []) {
    const iconPath = await resolvePluginAssetPath(rootDirectory, mapping.icon);

    if (iconPath === null) {
      throw new Error(`contributes.fileIcons.mappings icon "${mapping.icon}" is missing.`);
    }

    const extensions = (mapping.extensions ?? [])
      .map(normalizeFileIconToken)
      .filter((value) => value.length > 0);
    const fileNames = (mapping.fileNames ?? [])
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0);

    if (extensions.length === 0 && fileNames.length === 0) {
      throw new Error('contributes.fileIcons.mappings entries must declare extensions or fileNames.');
    }

    mappings.push({
      iconPath,
      extensions,
      fileNames,
    });
  }

  return {
    id: manifest.id,
    label: contribution.label,
    extensionId: manifest.id,
    extensionDisplayName: manifest.name,
    fileIconPath,
    directoryIconPath,
    directoryExpandedIconPath,
    mappings,
  };
}

interface ConfiguredPluginRoot {
  readonly path: string;
  readonly createIfMissing: boolean;
}

function resolveConfiguredPluginRoots(): readonly ConfiguredPluginRoot[] {
  const roots = new Map<string, ConfiguredPluginRoot>();
  const defaultRoot = path.resolve(app.getPath('userData'), DEFAULT_PLUGIN_DIRECTORY_NAME);
  roots.set(defaultRoot, {
    path: defaultRoot,
    createIfMissing: true,
  });

  const extraRoots = process.env.WSTUDIO_PLUGIN_ROOTS;

  if (typeof extraRoots === 'string' && extraRoots.trim().length > 0) {
    for (const rawRoot of extraRoots.split(path.delimiter)) {
      const normalizedRoot = rawRoot.trim();

      if (normalizedRoot.length === 0) {
        continue;
      }

      const resolvedRoot = path.resolve(normalizedRoot);
      roots.set(resolvedRoot, {
        path: resolvedRoot,
        createIfMissing: true,
      });
    }
  }

  const builtinRootCandidates = [
    ...DEFAULT_BUILTIN_PLUGIN_DIRECTORIES.map((directory) => resolveProjectPath(directory)),
    ...DEFAULT_BUILTIN_PLUGIN_DIRECTORIES.map((directory) => path.resolve(app.getAppPath(), directory)),
    ...(
      typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
        ? [
            path.resolve(process.resourcesPath, 'builtin-plugins'),
            ...DEFAULT_BUILTIN_PLUGIN_DIRECTORIES.map((directory) => path.resolve(process.resourcesPath, directory)),
            ...DEFAULT_BUILTIN_PLUGIN_DIRECTORIES.map((directory) => path.resolve(process.resourcesPath, 'app.asar.unpacked', directory)),
          ]
        : []
    ),
  ];

  for (const candidate of builtinRootCandidates) {
    const resolvedCandidate = path.resolve(candidate);

    if (!roots.has(resolvedCandidate)) {
      roots.set(resolvedCandidate, {
        path: resolvedCandidate,
        createIfMissing: false,
      });
    }
  }

  return [...roots.values()];
}

export class PluginDiscoveryService {
  private configuredRoots: readonly string[] = [];
  private resolvedRoots: readonly string[] = [];
  private descriptors = new Map<string, PluginDescriptor>();
  private lastScanSummary: PluginScanSummary = EMPTY_PLUGIN_SCAN_SUMMARY;

  public async initialize(): Promise<PluginScanSummary> {
    return this.reload();
  }

  public async reload(): Promise<PluginScanSummary> {
    const configuredRootEntries = resolveConfiguredPluginRoots();
    const configuredRoots = configuredRootEntries.map((entry) => entry.path);
    const resolvedRoots: string[] = [];
    const failures: PluginScanFailure[] = [];
    const descriptors = new Map<string, PluginDescriptor>();

    for (const pluginRootEntry of configuredRootEntries) {
      if (pluginRootEntry.createIfMissing) {
        await mkdir(pluginRootEntry.path, { recursive: true });
      } else if (!await pathExists(pluginRootEntry.path)) {
        continue;
      }

      const pluginRoot = pluginRootEntry.path;
      resolvedRoots.push(pluginRoot);

      const entries = await readdir(pluginRoot, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const rootDirectory = path.join(pluginRoot, entry.name);
        const manifestPath = path.join(rootDirectory, MANIFEST_FILE_NAME);

        if (!await pathExists(manifestPath)) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'missing_manifest',
            'Plugin directory is missing manifest.json.',
          ));
          continue;
        }

        let manifestText = '';

        try {
          manifestText = await readFile(manifestPath, 'utf8');
        } catch (error) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'manifest_read_failed',
            error instanceof Error ? error.message : 'Failed to read manifest.json.',
          ));
          continue;
        }

        let manifestJson: JsonValue;

        try {
          manifestJson = JSON.parse(manifestText) as JsonValue;
        } catch (error) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'manifest_parse_failed',
            error instanceof Error ? error.message : 'Failed to parse manifest.json.',
          ));
          continue;
        }

        if (!isJsonObject(manifestJson)) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_manifest',
            'manifest.json must contain a JSON object.',
          ));
          continue;
        }

        const manifest = parsePluginManifest(rootDirectory, manifestJson);

        if (manifest === null) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_manifest_shape',
            'manifest.json is missing required plugin fields or engines.wstudio.',
          ));
          continue;
        }

        if (
          isJsonObject(manifestJson.contributes)
          && hasOwnProperty(manifestJson.contributes, 'fileIcons')
          && manifest.contributes?.fileIcons === undefined
        ) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_file_icon_contribution',
            'manifest.json contains an invalid contributes.fileIcons declaration.',
          ));
          continue;
        }

        const iconPath = await resolvePluginLogoPath(manifest, rootDirectory);
        let fileIconTheme: PluginResolvedFileIconTheme | null = null;

        try {
          fileIconTheme = await resolvePluginFileIconTheme(manifest, rootDirectory);
        } catch (error) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_file_icon_contribution',
            error instanceof Error ? error.message : 'Invalid contributes.fileIcons contribution.',
          ));
          continue;
        }

        let entryPath: string | null = null;

        for (const candidate of SUPPORTED_ENTRY_CANDIDATES) {
          const candidatePath = path.join(rootDirectory, candidate);

          if (await pathExists(candidatePath)) {
            entryPath = candidatePath;
            break;
          }
        }

        if (entryPath === null) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'missing_entry',
            'Plugin entry file main.js was not found.',
          ));
          continue;
        }

        if (descriptors.has(manifest.id)) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'duplicate_plugin_id',
            `Duplicate plugin id "${manifest.id}" was found.`,
          ));
          continue;
        }

        descriptors.set(manifest.id, {
          manifest,
          rootDirectory,
          manifestPath,
          entryPath,
          iconPath,
          fileIconTheme,
        });
      }
    }

    this.configuredRoots = configuredRoots;
    this.resolvedRoots = resolvedRoots;
    this.descriptors = descriptors;
    this.lastScanSummary = {
      roots: resolvedRoots,
      registeredCount: descriptors.size,
      failureCount: failures.length,
      failures,
    };

    return this.lastScanSummary;
  }

  public getById(extensionId: string): PluginDescriptor | undefined {
    return this.descriptors.get(extensionId);
  }

  public getPluginRoots(): readonly string[] {
    return this.configuredRoots;
  }

  public getResolvedRoots(): readonly string[] {
    return this.resolvedRoots;
  }

  public getAll(): readonly PluginDescriptor[] {
    return [...this.descriptors.values()].sort((left, right) => {
      return left.manifest.name.localeCompare(right.manifest.name, 'zh-CN');
    });
  }

  public getLastScanSummary(): PluginScanSummary {
    return this.lastScanSummary;
  }
}
