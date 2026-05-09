/**
 * Plugin UI IPC handlers.
 * Exposes host-owned plugin layout entry data to the renderer.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  ExecutePluginUiEntryRequest,
  ExecutePluginUiEntryResponse,
  PluginUiEntryListResponse,
  PluginUiEntrySnapshot,
} from '@note-studio/shared';
import { pluginHostManager } from '../services/LegacyPluginPlatformStub';
import type {
  InstalledPluginSummary,
  PluginSettingTabSummary,
} from '../services/plugin-host/types';

export const PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL = 'plugin-ui:get-activitybar-left-entries';
export const PLUGIN_ACTIVITY_BAR_LEFT_CHANGED_CHANNEL = 'plugin-ui:activitybar-left-entries-changed';
export const PLUGIN_INSTALLED_PLUGINS_CHANNEL = 'plugin-ui:get-installed-plugins';
export const PLUGIN_SET_ENABLED_CHANNEL = 'plugin-ui:set-plugin-enabled';
export const PLUGIN_UNINSTALL_CHANNEL = 'plugin-ui:uninstall-plugin';
export const PLUGIN_SETTING_TABS_CHANNEL = 'plugin-ui:get-setting-tabs';
export const PLUGIN_UI_ENTRIES_CHANNEL = 'plugin-ui:get-entries';
export const PLUGIN_UI_EXECUTE_ENTRY_CHANNEL = 'plugin-ui:execute-entry';
export const PLUGIN_UI_CHANGED_CHANNEL = 'plugin-ui:entries-changed';

interface PluginActivityBarEntry {
  readonly id: string;
  readonly title: string;
  readonly tooltip: string | null;
  readonly iconPath: string | null;
  readonly iconName: string | null;
}

interface SetPluginEnabledRequest {
  readonly pluginId: string;
  readonly enabled: boolean;
}

interface UninstallPluginRequest {
  readonly pluginId: string;
}

let pluginUiSubscriptionRegistered = false;

function emitPluginUiEntriesChanged(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(PLUGIN_UI_CHANGED_CHANNEL);
    window.webContents.send(PLUGIN_ACTIVITY_BAR_LEFT_CHANGED_CHANNEL);
  }
}

function toActivityBarEntries(entries: readonly PluginUiEntrySnapshot[]): readonly PluginActivityBarEntry[] {
  return entries
    .filter((entry) => entry.location === 'activityBar' && entry.kind === 'iconButton')
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      tooltip: entry.tooltip,
      iconPath: null,
      iconName: entry.icon,
    }));
}

export function registerPluginUIHandlers(): void {
  if (!pluginUiSubscriptionRegistered) {
    pluginHostManager.subscribePluginUiEntries(() => {
      emitPluginUiEntriesChanged();
    });
    pluginUiSubscriptionRegistered = true;
  }

  try {
    ipcMain.removeHandler(PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_INSTALLED_PLUGINS_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_UI_ENTRIES_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_UI_EXECUTE_ENTRY_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_SET_ENABLED_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_UNINSTALL_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  try {
    ipcMain.removeHandler(PLUGIN_SETTING_TABS_CHANNEL);
  } catch {
    // Ignore duplicate cleanup during development re-registration.
  }

  ipcMain.handle(
    PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL,
    async (): Promise<readonly PluginActivityBarEntry[]> => {
      return toActivityBarEntries(pluginHostManager.getPluginUiEntries());
    },
  );
  ipcMain.handle(
    PLUGIN_INSTALLED_PLUGINS_CHANNEL,
    async (): Promise<readonly InstalledPluginSummary[]> => pluginHostManager.getInstalledPlugins(),
  );
  ipcMain.handle(
    PLUGIN_SET_ENABLED_CHANNEL,
    async (
      _event,
      request: SetPluginEnabledRequest,
    ): Promise<void> => {
      await pluginHostManager.setPluginEnabled(request.pluginId, request.enabled);
    },
  );
  ipcMain.handle(
    PLUGIN_UNINSTALL_CHANNEL,
    async (
      _event,
      request: UninstallPluginRequest,
    ): Promise<void> => {
      await pluginHostManager.uninstallPlugin(request.pluginId);
    },
  );
  ipcMain.handle(
    PLUGIN_SETTING_TABS_CHANNEL,
    async (): Promise<readonly PluginSettingTabSummary[]> => pluginHostManager.getPluginSettingTabs(),
  );
  ipcMain.handle(
    PLUGIN_UI_ENTRIES_CHANNEL,
    async (): Promise<PluginUiEntryListResponse> => ({
      success: true,
      data: pluginHostManager.getPluginUiEntries(),
    }),
  );
  ipcMain.handle(
    PLUGIN_UI_EXECUTE_ENTRY_CHANNEL,
    async (
      _event,
      request: ExecutePluginUiEntryRequest,
    ): Promise<ExecutePluginUiEntryResponse> => {
      const executed = await pluginHostManager.executePluginUiEntry(request.entryId);

      if (!executed) {
        return {
          success: false,
          error: {
            code: 'plugin_ui_entry_not_found',
            message: `Plugin UI entry "${request.entryId}" was not found.`,
          },
        };
      }

      return {
        success: true,
      };
    },
  );
}
