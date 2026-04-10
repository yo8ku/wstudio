/**
 * Filters host-managed plugin UI entries by shell location.
 */

import { useEffect, useState } from 'react';
import type { PluginUiEntryLocation, PluginUiEntrySnapshot } from '@note-studio/shared';
import { pluginUIService } from '../services/PluginUIService';

function filterEntriesByLocation(
  entries: readonly PluginUiEntrySnapshot[],
  location: PluginUiEntryLocation,
): readonly PluginUiEntrySnapshot[] {
  return entries.filter((entry) => entry.location === location);
}

export function usePluginUiEntries(
  location: PluginUiEntryLocation,
): readonly PluginUiEntrySnapshot[] {
  const [entries, setEntries] = useState<readonly PluginUiEntrySnapshot[]>([]);

  useEffect(() => {
    let disposed = false;

    const loadEntries = async (): Promise<void> => {
      try {
        const nextEntries = await pluginUIService.getEntries();

        if (!disposed) {
          setEntries(filterEntriesByLocation(nextEntries, location));
        }
      } catch (error) {
        console.error('[usePluginUiEntries] 读取插件入口失败:', error);
        if (!disposed) {
          setEntries([]);
        }
      }
    };

    void loadEntries();

    const unsubscribe = pluginUIService.subscribe(() => {
      void loadEntries();
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [location]);

  return entries;
}
