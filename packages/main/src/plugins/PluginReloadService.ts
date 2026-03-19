/**
 * Shared plugin reload flow used by both manual development commands and auto hot reload.
 */

import { type PluginScanSummary, pluginDiscoveryService } from './PluginDiscoveryService';
import { pluginHostManager } from './PluginHostManager';

let inFlightReload: Promise<PluginScanSummary> | null = null;

export async function reloadPlugins(): Promise<PluginScanSummary> {
  if (inFlightReload) {
    return inFlightReload;
  }

  inFlightReload = (async () => {
    await pluginHostManager.reloadAll();
    const summary = await pluginDiscoveryService.reload();
    await pluginHostManager.initialize();
    return summary;
  })();

  try {
    return await inFlightReload;
  } finally {
    inFlightReload = null;
  }
}
