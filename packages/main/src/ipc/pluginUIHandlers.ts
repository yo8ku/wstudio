/**
 * Plugin UI IPC handlers.
 * Exposes stable no-op plugin layout entry data to the renderer.
 */

import { ipcMain } from 'electron';

export const PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL = 'plugin-ui:get-activitybar-left-entries';
export const PLUGIN_ACTIVITY_BAR_LEFT_CHANGED_CHANNEL = 'plugin-ui:activitybar-left-entries-changed';
export const PLUGIN_INSTALLED_PLUGINS_CHANNEL = 'plugin-ui:get-installed-plugins';

interface PluginActivityBarEntry {
  readonly id: string;
  readonly title: string;
  readonly tooltip: string | null;
  readonly iconPath: string | null;
}

interface InstalledPluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string | null;
  readonly description: string | null;
  readonly enabled: boolean;
}

const EMPTY_PLUGIN_ACTIVITY_BAR_ENTRIES: readonly PluginActivityBarEntry[] = [];
const EMPTY_INSTALLED_PLUGINS: readonly InstalledPluginSummary[] = [];

export function registerPluginUIHandlers(): void {
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

  ipcMain.handle(
    PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL,
    async (): Promise<readonly PluginActivityBarEntry[]> => EMPTY_PLUGIN_ACTIVITY_BAR_ENTRIES,
  );
  ipcMain.handle(
    PLUGIN_INSTALLED_PLUGINS_CHANNEL,
    async (): Promise<readonly InstalledPluginSummary[]> => EMPTY_INSTALLED_PLUGINS,
  );
}
