/**
 * 主进程插件扫描与静态注册服务。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { app } from 'electron';
import {
  ExtensionRegistry,
  parseExtensionManifestJson,
  projectAIPanelContributions,
  validateExtensionManifest,
  type ExtensionManifestIssue,
  type ExtensionRuntimeDescriptor,
} from '@note-studio/extension-runtime';
import {
  EXTENSION_PLATFORM_VERSION,
  type ExtensionActivationEvent,
  type JsonValue,
} from '@note-studio/shared';
import { aiPanelActionRegistry } from './AIPanelActionRegistry';
import { pluginCommandRegistry } from './PluginCommandRegistry';
import { aiPanelContributionRegistry } from './AIPanelContributionRegistry';
import { workbenchContributionRegistry } from './WorkbenchContributionRegistry';

const PLUGIN_MANIFEST_FILENAME = 'plugin.json';
const PLUGIN_DIRECTORY_ENV_KEY = 'NOTE_STUDIO_EXTENSION_DIRS';

interface PluginCandidate {
  readonly rootDirectory: string;
  readonly manifestPath: string;
}

export interface PluginScanFailure {
  readonly rootDirectory: string;
  readonly manifestPath: string;
  readonly code: string;
  readonly message: string;
  readonly issues: readonly ExtensionManifestIssue[];
}

export interface PluginScanSummary {
  readonly roots: readonly string[];
  readonly registeredCount: number;
  readonly failureCount: number;
  readonly failures: readonly PluginScanFailure[];
}

function isPathInsideRoot(rootDirectory: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDirectory, targetPath);
  return relativePath.length > 0
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
}

export class PluginDiscoveryService {
  private static instance: PluginDiscoveryService | null = null;

  private registry = new ExtensionRegistry();
  private scanFailures: PluginScanFailure[] = [];
  private initialized = false;

  public static getInstance(): PluginDiscoveryService {
    if (!PluginDiscoveryService.instance) {
      PluginDiscoveryService.instance = new PluginDiscoveryService();
    }

    return PluginDiscoveryService.instance;
  }

  public async initialize(): Promise<PluginScanSummary> {
    const summary = await this.scanInstalledPlugins();
    this.initialized = true;
    return summary;
  }

  public async reload(): Promise<PluginScanSummary> {
    return this.scanInstalledPlugins();
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public list(): readonly ExtensionRuntimeDescriptor[] {
    return this.registry.list();
  }

  public getById(extensionId: string): ExtensionRuntimeDescriptor | undefined {
    return this.registry.getById(extensionId);
  }

  public findByActivationEvent(
    activationEvent: ExtensionActivationEvent,
  ): readonly ExtensionRuntimeDescriptor[] {
    return this.registry.findByActivationEvent(activationEvent);
  }

  public getFailures(): readonly PluginScanFailure[] {
    return [...this.scanFailures];
  }

  public getPluginRoots(): readonly string[] {
    return this.resolvePluginRoots();
  }

  private async scanInstalledPlugins(): Promise<PluginScanSummary> {
    this.registry.clear();
    this.scanFailures = [];
    aiPanelContributionRegistry.clearAll();
    aiPanelActionRegistry.clearAll();
    pluginCommandRegistry.clearAll();
    workbenchContributionRegistry.clearAll();

    const roots = this.resolvePluginRoots();
    for (const rootDirectory of roots) {
      await fs.mkdir(rootDirectory, { recursive: true });
    }

    const candidates = await this.collectPluginCandidates(roots);
    let registeredCount = 0;

    for (const candidate of candidates) {
      const descriptor = await this.registerCandidate(candidate);
      if (descriptor) {
        registeredCount += 1;
      }
    }

    const summary: PluginScanSummary = {
      roots,
      registeredCount,
      failureCount: this.scanFailures.length,
      failures: this.getFailures(),
    };

    console.log(
      `[PluginDiscoveryService] 扫描完成 roots=${roots.length} candidates=${candidates.length} registered=${registeredCount} failed=${summary.failureCount}`,
    );

    return summary;
  }

  private resolvePluginRoots(): readonly string[] {
    const roots = new Set<string>();
    roots.add(path.resolve(app.getPath('userData'), 'plugins'));

    const configuredRoots = process.env[PLUGIN_DIRECTORY_ENV_KEY];
    if (configuredRoots && configuredRoots.trim().length > 0) {
      const segments = configuredRoots
        .split(path.delimiter)
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

      for (const segment of segments) {
        roots.add(path.resolve(segment));
      }
    }

    return Array.from(roots.values());
  }

  private async collectPluginCandidates(roots: readonly string[]): Promise<readonly PluginCandidate[]> {
    const candidates = new Map<string, PluginCandidate>();

    for (const rootDirectory of roots) {
      const directManifestPath = await this.getManifestPathIfExists(rootDirectory);
      if (directManifestPath) {
        candidates.set(rootDirectory, {
          rootDirectory,
          manifestPath: directManifestPath,
        });
      }

      const childEntries = await fs.readdir(rootDirectory, { withFileTypes: true });
      for (const entry of childEntries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const candidateRoot = path.join(rootDirectory, entry.name);
        const manifestPath = await this.getManifestPathIfExists(candidateRoot);
        if (!manifestPath) {
          continue;
        }

        candidates.set(candidateRoot, {
          rootDirectory: candidateRoot,
          manifestPath,
        });
      }
    }

    return Array.from(candidates.values()).sort((left, right) =>
      left.rootDirectory.localeCompare(right.rootDirectory, 'zh-CN'),
    );
  }

  private async getManifestPathIfExists(rootDirectory: string): Promise<string | null> {
    const manifestPath = path.join(rootDirectory, PLUGIN_MANIFEST_FILENAME);

    try {
      const stats = await fs.stat(manifestPath);
      return stats.isFile() ? manifestPath : null;
    } catch {
      return null;
    }
  }

  private async registerCandidate(
    candidate: PluginCandidate,
  ): Promise<ExtensionRuntimeDescriptor | null> {
    let manifestSource = '';

    try {
      manifestSource = await fs.readFile(candidate.manifestPath, 'utf8');
    } catch {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_MANIFEST_READ_FAILED',
        message: '读取 plugin.json 失败',
        issues: [],
      });
      return null;
    }

    let manifestJson: JsonValue;
    try {
      manifestJson = JSON.parse(manifestSource) as JsonValue;
    } catch {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_MANIFEST_JSON_INVALID',
        message: 'plugin.json 不是合法的 JSON 文件',
        issues: [],
      });
      return null;
    }

    const parseResult = parseExtensionManifestJson(manifestJson);
    if (!parseResult.manifest || parseResult.issues.length > 0) {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_MANIFEST_PARSE_INVALID',
        message: 'plugin.json 结构不合法',
        issues: parseResult.issues,
      });
      return null;
    }

    const validationResult = validateExtensionManifest(parseResult.manifest, {
      hostVersion: EXTENSION_PLATFORM_VERSION,
      rootDirectory: candidate.rootDirectory,
      existingExtensionIds: this.registry.list().map((entry) => entry.manifest.id),
    });

    if (!validationResult.valid) {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_MANIFEST_VALIDATION_FAILED',
        message: 'plugin.json 校验未通过',
        issues: validationResult.issues,
      });
      return null;
    }

    const entryFile = path.resolve(candidate.rootDirectory, parseResult.manifest.main);
    if (!isPathInsideRoot(candidate.rootDirectory, entryFile)) {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_ENTRY_OUTSIDE_ROOT',
        message: '插件入口文件越出了插件根目录',
        issues: [],
      });
      return null;
    }

    try {
      const stats = await fs.stat(entryFile);
      if (!stats.isFile()) {
        this.recordFailure({
          rootDirectory: candidate.rootDirectory,
          manifestPath: candidate.manifestPath,
          code: 'PLUGIN_ENTRY_MISSING',
          message: '插件入口文件不存在或不是文件',
          issues: [],
        });
        return null;
      }
    } catch {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_ENTRY_MISSING',
        message: '插件入口文件不存在或不可访问',
        issues: [],
      });
      return null;
    }

    try {
      const registeredDescriptor = this.registry.register({
        manifest: parseResult.manifest,
        manifestPath: candidate.manifestPath,
        entryFile,
        rootDirectory: candidate.rootDirectory,
      });

      const resolvedDescriptor = this.registry.updateState(
        registeredDescriptor.manifest.id,
        'resolved',
      );

      aiPanelContributionRegistry.replaceExtensionContributions(
        resolvedDescriptor.manifest.id,
        projectAIPanelContributions(resolvedDescriptor.manifest),
      );
      workbenchContributionRegistry.replaceExtensionContributions(
        resolvedDescriptor.manifest,
        resolvedDescriptor.rootDirectory,
      );
      pluginCommandRegistry.replaceExtensionCommands(
        resolvedDescriptor.manifest.id,
        resolvedDescriptor.manifest.contributes.commands ?? [],
      );

      return resolvedDescriptor;
    } catch {
      this.recordFailure({
        rootDirectory: candidate.rootDirectory,
        manifestPath: candidate.manifestPath,
        code: 'PLUGIN_REGISTRATION_FAILED',
        message: '插件注册失败，可能存在重复 id',
        issues: [],
      });
      return null;
    }
  }

  private recordFailure(failure: PluginScanFailure): void {
    this.scanFailures.push(failure);
    console.warn(
      `[PluginDiscoveryService] ${failure.code} root=${failure.rootDirectory} manifest=${failure.manifestPath} message=${failure.message}`,
    );
  }
}

export const pluginDiscoveryService = PluginDiscoveryService.getInstance();
