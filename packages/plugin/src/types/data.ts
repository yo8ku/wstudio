/**
 * Plugin-specific data storage contract.
 */

import type { JsonValue } from './json';

export interface PluginDataStore {
  loadData<TData extends JsonValue = JsonValue>(pluginId: string): Promise<TData | null>;
  saveData<TData extends JsonValue>(pluginId: string, data: TData): Promise<void>;
  deleteData(pluginId: string): Promise<void>;
}
