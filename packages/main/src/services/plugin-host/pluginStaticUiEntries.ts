/**
 * Helpers for static plugin UI entry declarations that must be visible before
 * a third-party plugin runtime is started.
 */

import type { PluginUiEntrySnapshot } from '@note-studio/shared';
import type { PluginDescriptor } from './types';

export function buildPluginUiEntryId(pluginId: string, entryId: string): string {
  return `${pluginId.trim()}:ui:${entryId.trim()}`;
}

export function descriptorToStaticPluginUiEntrySnapshots(
  descriptor: PluginDescriptor,
): readonly PluginUiEntrySnapshot[] {
  return descriptor.staticUiEntries.map((entry) => ({
    id: buildPluginUiEntryId(descriptor.manifest.id, entry.id),
    pluginId: descriptor.manifest.id,
    location: entry.location,
    kind: 'iconButton',
    title: entry.title,
    tooltip: entry.title,
    text: null,
    icon: entry.icon,
    iconSvg: entry.iconSvg,
    scope: entry.scope,
  }));
}

export function mergeStaticPluginUiEntries(
  staticEntries: readonly PluginUiEntrySnapshot[],
  runtimeEntries: readonly PluginUiEntrySnapshot[],
): readonly PluginUiEntrySnapshot[] {
  const runtimeIds = new Set(runtimeEntries.map((entry) => entry.id));

  return [
    ...staticEntries.filter((entry) => !runtimeIds.has(entry.id)),
    ...runtimeEntries,
  ];
}

function matchesStaticEntryMetadata(
  staticEntry: PluginUiEntrySnapshot,
  runtimeEntry: PluginUiEntrySnapshot,
): boolean {
  if (
    staticEntry.pluginId !== runtimeEntry.pluginId
    || staticEntry.location !== runtimeEntry.location
    || staticEntry.kind !== runtimeEntry.kind
    || staticEntry.title !== runtimeEntry.title
  ) {
    return false;
  }

  if (staticEntry.icon !== null && runtimeEntry.icon === staticEntry.icon) {
    return true;
  }

  if (staticEntry.iconSvg !== null && runtimeEntry.iconSvg === staticEntry.iconSvg) {
    return true;
  }

  return staticEntry.icon === runtimeEntry.icon;
}

export function resolveStaticPluginUiEntryExecutionTarget(
  staticEntry: PluginUiEntrySnapshot,
  runtimeEntries: readonly PluginUiEntrySnapshot[],
): string | null {
  const exactMatch = runtimeEntries.find((entry) => entry.id === staticEntry.id) ?? null;

  if (exactMatch !== null) {
    return exactMatch.id;
  }

  const candidates = runtimeEntries.filter((entry) => matchesStaticEntryMetadata(staticEntry, entry));
  return candidates.length === 1 ? candidates[0]?.id ?? null : null;
}
