/**
 * Watches plugin roots and automatically reloads plugins after local file changes.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { pluginDiscoveryService } from './PluginDiscoveryService';
import { reloadPlugins } from './PluginReloadService';

const WATCHER_REFRESH_DEBOUNCE_MS = 200;
const RELOAD_DEBOUNCE_MS = 350;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.packages',
  'node_modules',
]);

function normalizeDirectoryPath(directory: string): string {
  return path.resolve(directory);
}

function isIgnoredDirectoryName(directoryName: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(directoryName);
}

function shouldIgnorePath(targetPath: string): boolean {
  const normalizedPath = targetPath.replace(/\\/g, '/');
  const pathSegments = normalizedPath.split('/').filter(segment => segment.length > 0);

  if (pathSegments.some(segment => isIgnoredDirectoryName(segment))) {
    return true;
  }

  return normalizedPath.toLowerCase().endsWith('.wspkg');
}

function toWatchFilename(filename: string | Buffer | null): string | null {
  if (typeof filename === 'string') {
    return filename;
  }

  if (filename instanceof Buffer) {
    return filename.toString('utf8');
  }

  return null;
}

async function collectWatchDirectories(rootDirectory: string): Promise<readonly string[]> {
  const discoveredDirectories: string[] = [];
  const queue: string[] = [normalizeDirectoryPath(rootDirectory)];

  while (queue.length > 0) {
    const currentDirectory = queue.shift();
    if (!currentDirectory) {
      continue;
    }

    discoveredDirectories.push(currentDirectory);

    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredDirectoryName(entry.name)) {
        continue;
      }

      queue.push(path.join(currentDirectory, entry.name));
    }
  }

  return discoveredDirectories;
}

export class PluginHotReloadService {
  private static instance: PluginHotReloadService | null = null;

  private readonly watchers = new Map<string, fs.FSWatcher>();
  private started = false;
  private refreshTimer: NodeJS.Timeout | null = null;
  private reloadTimer: NodeJS.Timeout | null = null;
  private refreshInFlight = false;
  private refreshQueued = false;
  private reloadInFlight = false;
  private reloadQueued = false;
  private pendingReloadReason: string | null = null;

  public static getInstance(): PluginHotReloadService {
    if (!PluginHotReloadService.instance) {
      PluginHotReloadService.instance = new PluginHotReloadService();
    }

    return PluginHotReloadService.instance;
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    await this.refreshWatchers();
    console.log(
      `[PluginHotReloadService] started roots=${pluginDiscoveryService.getPluginRoots().length} watchers=${this.watchers.size}`,
    );
  }

  public dispose(): void {
    this.started = false;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    this.watchers.clear();
  }

  private scheduleWatcherRefresh(): void {
    if (!this.started) {
      return;
    }

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshWatchers();
    }, WATCHER_REFRESH_DEBOUNCE_MS);
  }

  private scheduleReload(reason: string): void {
    if (!this.started) {
      return;
    }

    this.pendingReloadReason = reason;

    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.flushReloadQueue();
    }, RELOAD_DEBOUNCE_MS);
  }

  private async refreshWatchers(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }

    this.refreshInFlight = true;

    try {
      const nextDirectories = new Set<string>();
      for (const rootDirectory of pluginDiscoveryService.getPluginRoots()) {
        const directories = await collectWatchDirectories(rootDirectory);
        for (const directory of directories) {
          nextDirectories.add(directory);
        }
      }

      for (const [directory, watcher] of this.watchers.entries()) {
        if (nextDirectories.has(directory)) {
          continue;
        }

        watcher.close();
        this.watchers.delete(directory);
      }

      for (const directory of nextDirectories.values()) {
        if (this.watchers.has(directory)) {
          continue;
        }

        try {
          this.watchers.set(directory, this.createWatcher(directory));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[PluginHotReloadService] failed to watch directory=${directory}: ${message}`);
        }
      }
    } finally {
      this.refreshInFlight = false;

      if (this.refreshQueued) {
        this.refreshQueued = false;
        await this.refreshWatchers();
      }
    }
  }

  private createWatcher(directory: string): fs.FSWatcher {
    const watcher = fs.watch(directory, (eventType, filename) => {
      this.handleWatchEvent(directory, eventType, toWatchFilename(filename));
    });

    watcher.on('error', (error: Error) => {
      console.warn(`[PluginHotReloadService] watcher error directory=${directory}: ${error.message}`);
      this.scheduleWatcherRefresh();
    });

    return watcher;
  }

  private handleWatchEvent(
    directory: string,
    eventType: string,
    filename: string | null,
  ): void {
    const targetPath = filename && filename.trim().length > 0
      ? path.resolve(directory, filename)
      : directory;

    if (shouldIgnorePath(targetPath)) {
      return;
    }

    if (eventType === 'rename' || filename === null) {
      this.scheduleWatcherRefresh();
    }

    this.scheduleReload(`${eventType}:${targetPath}`);
  }

  private async flushReloadQueue(): Promise<void> {
    if (!this.started) {
      return;
    }

    if (this.reloadInFlight) {
      this.reloadQueued = true;
      return;
    }

    this.reloadInFlight = true;

    try {
      do {
        this.reloadQueued = false;
        const reloadReason = this.pendingReloadReason ?? 'unknown-change';
        this.pendingReloadReason = null;

        try {
          const summary = await reloadPlugins();
          console.log(
            `[PluginHotReloadService] reloaded reason=${reloadReason} registered=${summary.registeredCount} failed=${summary.failureCount}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[PluginHotReloadService] failed to reload plugins: ${message}`);
        }

        await this.refreshWatchers();
      } while (this.reloadQueued);
    } finally {
      this.reloadInFlight = false;
    }
  }
}

export const pluginHotReloadService = PluginHotReloadService.getInstance();
