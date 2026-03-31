/**
 * 插件开发调试 IPC 处理器。
 */

import { ipcMain } from 'electron';
import type {
  ExtensionDevelopmentReloadResponse,
} from '@note-studio/shared';
import { EMPTY_EXTENSION_DEVELOPMENT_RELOAD_RESULT } from '../services/LegacyPluginPlatformStub';

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
      return {
        success: true,
        data: EMPTY_EXTENSION_DEVELOPMENT_RELOAD_RESULT,
      };
    },
  );
}
