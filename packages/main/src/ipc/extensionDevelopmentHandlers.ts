/**
 * 插件开发调试 IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  ExtensionDevelopmentReloadResponse,
} from '@note-studio/shared';
import {
  pluginDiscoveryService,
  pluginHostManager,
} from '../services/LegacyPluginPlatformStub';

let handlersRegistered = false;

const EXTENSION_DEVELOPMENT_CHANNELS = [
  'extensions:development:reload-plugins',
] as const;

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
      await pluginHostManager.reloadAll();
      const summary = pluginDiscoveryService.getLastScanSummary();
      const installedPlugins = pluginHostManager.getInstalledPlugins();
      const enabledCount = installedPlugins.filter((plugin) => plugin.enabled).length;
      const disabledCount = installedPlugins.length - enabledCount;
      const disabledPlugins = installedPlugins
        .filter((plugin) => !plugin.enabled)
        .map((plugin) => ({
          id: plugin.id,
          name: plugin.name,
          message: plugin.failureMessage,
        }));

      return {
        success: true,
        data: {
          roots: summary.roots,
          registeredCount: summary.registeredCount,
          enabledCount,
          disabledCount,
          failureCount: summary.failureCount,
          failures: summary.failures,
          disabledPlugins,
        },
      };
    },
  );
}
