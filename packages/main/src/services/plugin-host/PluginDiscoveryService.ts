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
  type PluginResolvedUiEntrypoints,
  type PluginScanFailure,
  type PluginScanSummary,
} from './types';

const DEFAULT_PLUGIN_DIRECTORY_NAME = 'plugins';
const DEFAULT_BUILTIN_PLUGIN_DIRECTORIES = [
  path.join('packages', 'builtin-plugins'),
  path.join('resources', 'builtin-plugins'),
] as const;
const DEFAULT_DEVELOPMENT_EXAMPLE_PLUGIN_IDS = [] as const;
const DEFAULT_UNBLOCKED_USER_PLUGIN_IDS = [
  'wstudio-plugin-demo-editor-suggest',
  'wstudio-plugin-demo-file-icons-simple',
  'wstudio-plugin-demo-canvas-host',
] as const;
const DEFAULT_DEVELOPMENT_PLUGIN_BLOCKED_PREFIXES = [
  'wstudio-plugin-demo-',
] as const;
const DEVELOPMENT_EXAMPLE_PLUGIN_IDS_ENV = 'WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_IDS';
const DEVELOPMENT_EXAMPLE_PLUGIN_ROOT_ENV = 'WSTUDIO_DEVELOPMENT_EXAMPLE_PLUGIN_ROOT';
const MANIFEST_FILE_NAME = 'manifest.json';
const SUPPORTED_ENTRY_CANDIDATES = ['main.js', 'main.cjs', 'main.mjs'] as const;
const DEFAULT_PLUGIN_ICON_CANDIDATES = ['assets/logo.svg'] as const;
const SUPPORTED_PLUGIN_LOGO_EXTENSIONS = new Set<string>([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
]);

const EMPTY_PLUGIN_SCAN_SUMMARY: PluginScanSummary = {
  roots: [],
  registeredCount: 0,
  failureCount: 0,
  failures: [],
};

interface ParsedPluginUiManifest {
  readonly views: Readonly<Record<string, string>>;
  readonly settings: string | null;
  readonly modals: Readonly<Record<string, string>>;
}

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

function readOptionalStringRecord(
  source: JsonObject,
  key: string,
): Readonly<Record<string, string>> | undefined | null {
  const value = source[key];

  if (value === undefined) {
    return undefined;
  }

  if (!isJsonObject(value)) {
    return null;
  }

  const result: Record<string, string> = {};

  for (const [entryKey, entryValue] of Object.entries(value)) {
    const normalizedKey = entryKey.trim();

    if (normalizedKey.length === 0) {
      return null;
    }

    if (typeof entryValue !== 'string' || entryValue.trim().length === 0) {
      return null;
    }

    result[normalizedKey] = entryValue.trim();
  }

  return result;
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

function readManifestUi(source: JsonObject): ParsedPluginUiManifest | undefined | null {
  const uiValue = source.ui;

  if (uiValue === undefined) {
    return undefined;
  }

  if (!isJsonObject(uiValue)) {
    return null;
  }

  const views = readOptionalStringRecord(uiValue, 'views');
  const modals = readOptionalStringRecord(uiValue, 'modals');
  const settingsValue = uiValue.settings;
  const settings = settingsValue === undefined
    ? null
    : typeof settingsValue === 'string' && settingsValue.trim().length > 0
      ? settingsValue.trim()
      : false;

  if (views === null || modals === null || settings === false) {
    return null;
  }

  const resolvedViews = views ?? {};
  const resolvedModals = modals ?? {};

  if (Object.keys(resolvedViews).length === 0 && Object.keys(resolvedModals).length === 0 && settings === null) {
    return null;
  }

  return {
    views: resolvedViews,
    settings,
    modals: resolvedModals,
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

function isSupportedPluginLogoAssetPath(targetPath: string): boolean {
  return SUPPORTED_PLUGIN_LOGO_EXTENSIONS.has(path.extname(targetPath).trim().toLowerCase());
}

async function resolvePluginLogoPath(
  manifest: PluginManifest,
  rootDirectory: string,
): Promise<string | null> {
  if (manifest.icon !== undefined) {
    const resolvedManifestIconPath = await resolvePluginAssetPath(rootDirectory, manifest.icon);

    if (resolvedManifestIconPath === null) {
      throw new Error('manifest.icon points to a missing asset.');
    }

    if (!isSupportedPluginLogoAssetPath(resolvedManifestIconPath)) {
      throw new Error(
        'manifest.icon must point to an image asset (.png, .jpg, .jpeg, .webp, .gif, .bmp, or .svg).',
      );
    }

    return resolvedManifestIconPath;
  }

  for (const candidate of DEFAULT_PLUGIN_ICON_CANDIDATES) {
    const resolvedCandidatePath = await resolvePluginAssetPath(rootDirectory, candidate);

    if (resolvedCandidatePath !== null && isSupportedPluginLogoAssetPath(resolvedCandidatePath)) {
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

async function resolvePluginUiEntrypoints(
  rootDirectory: string,
  uiManifest: ParsedPluginUiManifest | undefined,
): Promise<PluginResolvedUiEntrypoints | null> {
  if (uiManifest === undefined) {
    return null;
  }

  const resolvedViews: Record<string, string> = {};
  const resolvedModals: Record<string, string> = {};

  for (const [viewId, relativePath] of Object.entries(uiManifest.views)) {
    const resolvedPath = await resolvePluginAssetPath(rootDirectory, relativePath);

    if (resolvedPath === null) {
      throw new Error(`ui.views["${viewId}"] points to a missing or out-of-root entry file.`);
    }

    resolvedViews[viewId] = resolvedPath;
  }

  for (const [modalId, relativePath] of Object.entries(uiManifest.modals)) {
    const resolvedPath = await resolvePluginAssetPath(rootDirectory, relativePath);

    if (resolvedPath === null) {
      throw new Error(`ui.modals["${modalId}"] points to a missing or out-of-root entry file.`);
    }

    resolvedModals[modalId] = resolvedPath;
  }

  const resolvedSettings = uiManifest.settings === null
    ? null
    : await resolvePluginAssetPath(rootDirectory, uiManifest.settings);

  if (uiManifest.settings !== null && resolvedSettings === null) {
    throw new Error('ui.settings points to a missing or out-of-root entry file.');
  }

  return {
    views: resolvedViews,
    settings: resolvedSettings,
    modals: resolvedModals,
  };
}

interface ConfiguredPluginRoot {
  readonly path: string;
  readonly createIfMissing: boolean;
  readonly allowedPluginIds?: ReadonlySet<string>;
  readonly blockedPluginIdPrefixes?: readonly string[];
  readonly blockedPluginIdExceptions?: ReadonlySet<string>;
}

function readDevelopmentExamplePluginIds(): ReadonlySet<string> {
  const configuredIds = process.env[DEVELOPMENT_EXAMPLE_PLUGIN_IDS_ENV];

  if (typeof configuredIds !== 'string') {
    return new Set<string>(DEFAULT_DEVELOPMENT_EXAMPLE_PLUGIN_IDS);
  }

  const normalizedIds = configuredIds
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return new Set<string>(normalizedIds);
}

function resolveDevelopmentExampleRoot(): string {
  const configuredRoot = process.env[DEVELOPMENT_EXAMPLE_PLUGIN_ROOT_ENV];

  if (typeof configuredRoot === 'string' && configuredRoot.trim().length > 0) {
    return path.resolve(configuredRoot.trim());
  }

  return path.resolve(resolveProjectPath('examples', 'plugins'));
}

function matchesAllowedPluginDirectory(
  entryName: string,
  allowedPluginIds: ReadonlySet<string>,
): boolean {
  for (const pluginId of allowedPluginIds) {
    if (entryName === pluginId || entryName.startsWith(`${pluginId} `)) {
      return true;
    }
  }

  return false;
}

function resolveConfiguredPluginRoots(): readonly ConfiguredPluginRoot[] {
  const roots = new Map<string, ConfiguredPluginRoot>();
  const defaultRoot = path.resolve(app.getPath('userData'), DEFAULT_PLUGIN_DIRECTORY_NAME);
  roots.set(defaultRoot, {
    path: defaultRoot,
    createIfMissing: true,
    blockedPluginIdPrefixes: [...DEFAULT_DEVELOPMENT_PLUGIN_BLOCKED_PREFIXES],
    blockedPluginIdExceptions: new Set<string>(DEFAULT_UNBLOCKED_USER_PLUGIN_IDS),
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

  const developmentExampleRoot = resolveDevelopmentExampleRoot();

  if (!roots.has(developmentExampleRoot)) {
    roots.set(developmentExampleRoot, {
      path: developmentExampleRoot,
      createIfMissing: false,
      allowedPluginIds: readDevelopmentExamplePluginIds(),
    });
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

        if (
          pluginRootEntry.allowedPluginIds !== undefined
          && !matchesAllowedPluginDirectory(entry.name, pluginRootEntry.allowedPluginIds)
        ) {
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
        const uiManifest = readManifestUi(manifestJson);

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
          pluginRootEntry.blockedPluginIdPrefixes?.some((prefix) => manifest.id.startsWith(prefix)) === true
          && pluginRootEntry.blockedPluginIdExceptions?.has(manifest.id) !== true
        ) {
          continue;
        }

        if (uiManifest === null) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_ui_manifest',
            'manifest.json contains an invalid ui declaration.',
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

        let iconPath: string | null = null;

        try {
          iconPath = await resolvePluginLogoPath(manifest, rootDirectory);
        } catch (error) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_plugin_icon',
            error instanceof Error ? error.message : 'Invalid manifest.icon asset.',
          ));
          continue;
        }

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

        let uiEntrypoints: PluginResolvedUiEntrypoints | null = null;

        try {
          uiEntrypoints = await resolvePluginUiEntrypoints(rootDirectory, uiManifest);
        } catch (error) {
          failures.push(createFailure(
            rootDirectory,
            manifestPath,
            'invalid_ui_entrypoint',
            error instanceof Error ? error.message : 'Invalid ui entrypoint declaration.',
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
          uiEntrypoints,
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
