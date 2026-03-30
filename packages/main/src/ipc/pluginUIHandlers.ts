/**
 * Plugin UI IPC handlers.
 * Exposes read-only plugin layout entry data to the renderer.
 */

import { ipcMain } from 'electron';
import type { PluginHostService } from '../plugins';

export const PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL = 'plugin-ui:get-activitybar-left-entries';
export const PLUGIN_ACTIVITY_BAR_LEFT_CHANGED_CHANNEL = 'plugin-ui:activitybar-left-entries-changed';
export const PLUGIN_INSTALLED_PLUGINS_CHANNEL = 'plugin-ui:get-installed-plugins';

export function registerPluginUIHandlers(pluginHostService: PluginHostService): void {
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

  ipcMain.handle(PLUGIN_ACTIVITY_BAR_LEFT_CHANNEL, async () => pluginHostService.getActivityBarEntries());
  ipcMain.handle(PLUGIN_INSTALLED_PLUGINS_CHANNEL, async () => pluginHostService.getInstalledPlugins());
}
