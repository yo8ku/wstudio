/**
 * Reads host-managed plugin UI entries and activates them from the renderer shell.
 */

import type {
  ExecutePluginUiEntryResponse,
  PluginUiEntryListResponse,
  PluginUiEntrySnapshot,
} from '@note-studio/shared';

const PLUGIN_UI_ENTRIES_CHANNEL = 'plugin-ui:get-entries';
const PLUGIN_UI_EXECUTE_ENTRY_CHANNEL = 'plugin-ui:execute-entry';
const PLUGIN_UI_CHANGED_CHANNEL = 'plugin-ui:entries-changed';

class PluginUIService {
  public async getEntries(): Promise<readonly PluginUiEntrySnapshot[]> {
    const response: PluginUiEntryListResponse | undefined =
      await window.electron?.ipcRenderer.invoke(PLUGIN_UI_ENTRIES_CHANNEL);

    if (!response) {
      return [];
    }

    if (!response.success || !response.data) {
      throw new Error(response.error?.message ?? '读取插件入口失败');
    }

    return response.data;
  }

  public subscribe(listener: () => void): () => void {
    const unsubscribe = window.electron?.ipcRenderer.on(
      PLUGIN_UI_CHANGED_CHANNEL,
      () => {
        listener();
      },
    );

    return unsubscribe ?? (() => undefined);
  }

  public async executeEntry(entryId: string): Promise<void> {
    const response: ExecutePluginUiEntryResponse | undefined =
      await window.electron?.ipcRenderer.invoke(PLUGIN_UI_EXECUTE_ENTRY_CHANNEL, { entryId });

    if (!response) {
      throw new Error('执行插件入口时没有收到宿主响应');
    }

    if (!response.success) {
      throw new Error(response.error?.message ?? '执行插件入口失败');
    }
  }
}

export const pluginUIService = new PluginUIService();
