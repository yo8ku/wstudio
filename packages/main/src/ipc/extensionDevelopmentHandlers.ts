/**
 * 插件开发调试 IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  ExtensionDevelopmentReloadResponse,
  ExtensionDevelopmentReloadResult,
} from '@note-studio/shared';
import { type PluginScanSummary } from '../plugins/PluginDiscoveryService';
import { reloadPlugins } from '../plugins/PluginReloadService';

let handlersRegistered = false;

const EXTENSION_DEVELOPMENT_CHANNELS = [
  'extensions:development:reload-plugins',
] as const;

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

function toReloadResult(summary: PluginScanSummary): ExtensionDevelopmentReloadResult {
  return {
    roots: [...summary.roots],
    registeredCount: summary.registeredCount,
    failureCount: summary.failureCount,
    failures: summary.failures.map((failure) => ({
      rootDirectory: failure.rootDirectory,
      manifestPath: failure.manifestPath,
      code: failure.code,
      message: failure.message,
    })),
  };
}

export function registerExtensionDevelopmentHandlers(): void {
  if (handlersRegistered) {
    return;
  }

  for (const channel of EXTENSION_DEVELOPMENT_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers during startup.
    }
  }

  handlersRegistered = true;

  ipcMain.handle(
    'extensions:development:reload-plugins',
    async (): Promise<ExtensionDevelopmentReloadResponse> => {
      try {
        const summary = await reloadPlugins();

        return {
          success: true,
          data: toReloadResult(summary),
        };
      } catch (error) {
        console.error('[ExtensionDevelopment IPC] failed to reload plugins:', error);
        return {
          success: false,
          error: {
            code: 'EXTENSION_DEVELOPMENT_RELOAD_FAILED',
            message: toErrorMessage(error instanceof Error ? error : String(error)),
          },
        };
      }
    },
  );
}
