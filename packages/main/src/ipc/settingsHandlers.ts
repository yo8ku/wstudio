/**
 * Settings IPC handlers for the renderer process.
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { SettingsManager, SettingsSchema } from '../config/SettingsManager';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import type { WorkbenchBackgroundSettings } from '@note-studio/shared';

type SettingsTarget = 'user' | 'workspace';

type SerializableValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | SerializableValue[]
  | { [key: string]: SerializableValue };

interface SettingsResponse<T = SerializableValue> {
  success: boolean;
  data?: T;
  error?: string;
}

const SETTINGS_CHANNELS = [
  'settings:get-all',
  'settings:get',
  'settings:update',
  'settings:update-many',
  'settings:reset',
  'settings:get-path',
  'settings:open-json',
  'settings:import',
  'settings:export',
  'settings:get-defaults',
];

let handlersRegistered = false;
let currentWindow: BrowserWindow | null = null;

const toErrorMessage = (error: Error | string): string =>
  error instanceof Error ? error.message : String(error);

const broadcastSettingsChanged = (payload: Record<string, SerializableValue>): void => {
  if (currentWindow && !currentWindow.isDestroyed()) {
    currentWindow.webContents.send('settings:changed', payload);
  }
};

const toSerializableSettingsValue = (
  value: SettingsSchema[keyof SettingsSchema]
): SerializableValue => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const backgroundValue = value as WorkbenchBackgroundSettings;
  return {
    enabled: backgroundValue.enabled,
    imagePath: backgroundValue.imagePath,
    opacity: backgroundValue.opacity,
    blur: backgroundValue.blur,
    fit: backgroundValue.fit,
  };
};

const ensureSettingsFileExists = async (settingsPath: string): Promise<void> => {
  if (fs.existsSync(settingsPath)) {
    return;
  }

  const directory = path.dirname(settingsPath);
  if (!fs.existsSync(directory)) {
    await fsPromises.mkdir(directory, { recursive: true });
  }
  await fsPromises.writeFile(settingsPath, JSON.stringify({}, null, 2), 'utf-8');
};

export const registerSettingsHandlers = (
  settingsManager: SettingsManager,
  workspaceManager: WorkspaceManager,
  mainWindow?: BrowserWindow | null
): void => {
  if (mainWindow) {
    currentWindow = mainWindow;
  }

  if (handlersRegistered) {
    return;
  }

  for (const channel of SETTINGS_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers.
    }
  }

  handlersRegistered = true;

  ipcMain.handle('settings:get-all', async (): Promise<SettingsResponse<Partial<SettingsSchema>>> => {
    try {
      const settings = await settingsManager.getUserConfiguredSettings();
      return { success: true, data: settings };
    } catch (error) {
      console.error('[Settings IPC] Failed to get settings:', error);
      return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
    }
  });

  ipcMain.handle(
    'settings:get',
    async (_event, key: keyof SettingsSchema): Promise<SettingsResponse<SettingsSchema[keyof SettingsSchema]>> => {
      try {
        const value = settingsManager.get(key);
        return { success: true, data: value };
      } catch (error) {
        console.error('[Settings IPC] Failed to get setting value:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle(
    'settings:update',
    async (
      _event,
      key: keyof SettingsSchema,
      value: SettingsSchema[keyof SettingsSchema],
      target: SettingsTarget = 'user'
    ): Promise<SettingsResponse<void>> => {
      try {
        await settingsManager.update(key, value, target);
        broadcastSettingsChanged({ key, value: toSerializableSettingsValue(value) });
        return { success: true };
      } catch (error) {
        console.error('[Settings IPC] Failed to update setting:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle(
    'settings:update-many',
    async (
      _event,
      updates: Partial<SettingsSchema>,
      target: SettingsTarget = 'user'
    ): Promise<SettingsResponse<void>> => {
      try {
        await settingsManager.updateMany(updates, target);
        broadcastSettingsChanged({ updatedKeys: Object.keys(updates) });
        return { success: true };
      } catch (error) {
        console.error('[Settings IPC] Failed to update settings:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle('settings:reset', async (_event, key?: keyof SettingsSchema): Promise<SettingsResponse<void>> => {
    try {
      await settingsManager.reset(key);
      broadcastSettingsChanged({ key: key ?? null, reset: true });
      return { success: true };
    } catch (error) {
      console.error('[Settings IPC] Failed to reset settings:', error);
      return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
    }
  });

  ipcMain.handle(
    'settings:get-path',
    async (_event, target: SettingsTarget = 'user'): Promise<SettingsResponse<string>> => {
      try {
        const settingsPath = settingsManager.getSettingsPath(target);
        return { success: true, data: settingsPath };
      } catch (error) {
        console.error('[Settings IPC] Failed to get settings path:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle(
    'settings:open-json',
    async (
      _event,
      target: SettingsTarget = 'user'
    ): Promise<SettingsResponse<{ path: string; content: string; name: string; language: string }>> => {
      try {
        const settingsPath = settingsManager.getSettingsPath(target);
        await ensureSettingsFileExists(settingsPath);
        await settingsManager.reload();

        const content = await fsPromises.readFile(settingsPath, 'utf-8');
        const language = workspaceManager.getFileLanguage(settingsPath);

        return {
          success: true,
          data: {
            path: settingsPath,
            content,
            name: path.basename(settingsPath),
            language,
          },
        };
      } catch (error) {
        console.error('[Settings IPC] Failed to open settings file:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle(
    'settings:import',
    async (_event, settingsJson: string, target: SettingsTarget = 'user'): Promise<SettingsResponse<void>> => {
      try {
        await settingsManager.importSettings(settingsJson, target);
        broadcastSettingsChanged({ imported: true });
        return { success: true };
      } catch (error) {
        console.error('[Settings IPC] Failed to import settings:', error);
        return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
      }
    }
  );

  ipcMain.handle('settings:export', async (): Promise<SettingsResponse<string>> => {
    try {
      const settingsJson = settingsManager.exportSettings();
      return { success: true, data: settingsJson };
    } catch (error) {
      console.error('[Settings IPC] Failed to export settings:', error);
      return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
    }
  });

  ipcMain.handle('settings:get-defaults', async (): Promise<SettingsResponse<SettingsSchema>> => {
    try {
      const defaults = settingsManager.getDefaults();
      return { success: true, data: defaults };
    } catch (error) {
      console.error('[Settings IPC] Failed to get default settings:', error);
      return { success: false, error: toErrorMessage(error instanceof Error ? error : String(error)) };
    }
  });
};
