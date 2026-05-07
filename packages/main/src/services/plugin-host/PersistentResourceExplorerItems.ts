/**
 * Persistent storage for plugin-declared resource explorer directory items.
 * The host owns rendering; plugins only tell the host which local directories to remember.
 */

import type { JsonObject, JsonValue, WorkbenchResourceExplorerItemContributionEntry } from '@note-studio/shared';
import type { SettingsManager } from '../../config/SettingsManager';

const PERSISTED_RESOURCE_EXPLORER_ITEMS_SETTING_KEY = 'plugin.resourceExplorerItems';

export interface PersistentResourceExplorerItemRecord {
  readonly pluginId: string;
  readonly itemId: string;
  readonly title: string;
  readonly icon: string | null;
  readonly directoryPath: string;
  readonly viewType: string;
  readonly retainContextWhenHidden: boolean;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined
    && value !== null
    && typeof value === 'object'
    && !Array.isArray(value);
}

function readRequiredString(source: JsonObject, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readOptionalString(source: JsonObject, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalNullableString(source: JsonObject, key: string): string | null {
  const value = source[key];
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

function parsePersistentResourceExplorerItem(
  value: JsonValue,
): PersistentResourceExplorerItemRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const pluginId = readRequiredString(value, 'pluginId');
  const itemId = readRequiredString(value, 'itemId');
  const title = readRequiredString(value, 'title');
  const directoryPath = readRequiredString(value, 'directoryPath');

  if (
    pluginId === null
    || itemId === null
    || title === null
    || directoryPath === null
  ) {
    return null;
  }

  return {
    pluginId,
    itemId,
    title,
    icon: readOptionalNullableString(value, 'icon'),
    directoryPath,
    viewType: readOptionalString(value, 'viewType'),
    retainContextWhenHidden: value.retainContextWhenHidden === true,
  };
}

function toPersistentResourceExplorerItemJson(
  record: PersistentResourceExplorerItemRecord,
): JsonObject {
  return {
    pluginId: record.pluginId,
    itemId: record.itemId,
    title: record.title,
    icon: record.icon,
    directoryPath: record.directoryPath,
    viewType: record.viewType,
    retainContextWhenHidden: record.retainContextWhenHidden,
  };
}

export function readPersistentResourceExplorerItems(
  settingsManager: SettingsManager,
): readonly PersistentResourceExplorerItemRecord[] {
  const value = settingsManager.getPluginSetting<JsonValue>(
    PERSISTED_RESOURCE_EXPLORER_ITEMS_SETTING_KEY,
    [],
  );

  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const parsedEntry = parsePersistentResourceExplorerItem(entry);
    return parsedEntry === null ? [] : [parsedEntry];
  });
}

export async function rememberPersistentResourceExplorerItem(
  settingsManager: SettingsManager,
  record: PersistentResourceExplorerItemRecord,
): Promise<void> {
  const existingRecords = readPersistentResourceExplorerItems(settingsManager);
  const nextRecords = [
    record,
    ...existingRecords.filter((existingRecord) => (
      existingRecord.pluginId !== record.pluginId
      || existingRecord.itemId !== record.itemId
    )),
  ];

  await settingsManager.updatePluginSetting(
    PERSISTED_RESOURCE_EXPLORER_ITEMS_SETTING_KEY,
    nextRecords.map((entry) => toPersistentResourceExplorerItemJson(entry)),
    'user',
  );
}

export function persistentResourceExplorerItemToContribution(
  record: PersistentResourceExplorerItemRecord,
  resolvePluginDisplayName: (pluginId: string) => string,
): WorkbenchResourceExplorerItemContributionEntry {
  return {
    extensionId: record.pluginId,
    extensionDisplayName: resolvePluginDisplayName(record.pluginId),
    itemKey: `${record.pluginId}:${record.itemId}`,
    itemId: record.itemId,
    title: record.title,
    icon: record.icon,
    viewType: record.viewType,
    directoryPath: record.directoryPath,
    webviewEntryUrl: null,
    webviewHtml: null,
    retainContextWhenHidden: record.retainContextWhenHidden,
  };
}
