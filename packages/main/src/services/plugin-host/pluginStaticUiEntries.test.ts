import { describe, expect, it } from 'vitest';
import type { PluginUiEntrySnapshot } from '@note-studio/shared';
import type { PluginDescriptor } from './types';
import {
  buildPluginUiEntryId,
  descriptorToStaticPluginUiEntrySnapshots,
  mergeStaticPluginUiEntries,
  resolveStaticPluginUiEntryExecutionTarget,
} from './pluginStaticUiEntries';

function createDescriptor(): PluginDescriptor {
  return {
    manifest: {
      id: 'plugin.test',
      name: 'Plugin Test',
      author: 'Test',
      version: '1.0.0',
      description: 'Test plugin.',
      engines: {
        wstudio: '>=1.0.0',
      },
    },
    rootDirectory: '/plugin',
    manifestPath: '/plugin/manifest.json',
    entryPath: '/plugin/main.js',
    iconPath: null,
    fileIconTheme: null,
    uiEntrypoints: null,
    staticUiEntries: [{
      id: 'launch',
      title: 'Launch',
      icon: 'rocket',
      iconSvg: null,
      location: 'activityBar',
      scope: null,
    }],
  };
}

function createEntry(
  overrides: Partial<PluginUiEntrySnapshot> = {},
): PluginUiEntrySnapshot {
  return {
    id: 'plugin.test:ui:launch',
    pluginId: 'plugin.test',
    location: 'activityBar',
    kind: 'iconButton',
    title: 'Launch',
    tooltip: 'Launch',
    text: null,
    icon: 'rocket',
    iconSvg: null,
    scope: null,
    ...overrides,
  };
}

describe('pluginStaticUiEntries', () => {
  it('builds stable qualified ids from plugin and local entry ids', () => {
    expect(buildPluginUiEntryId('plugin.test', 'launch')).toBe('plugin.test:ui:launch');
  });

  it('converts descriptor static entries into plugin ui entry snapshots', () => {
    expect(descriptorToStaticPluginUiEntrySnapshots(createDescriptor())).toEqual([createEntry()]);
  });

  it('keeps static entries only when runtime entries have not replaced them', () => {
    const staticEntry = createEntry();
    const runtimeEntry = createEntry({
      id: 'plugin.test:ui:runtime',
    });

    expect(mergeStaticPluginUiEntries([staticEntry], [runtimeEntry])).toEqual([
      staticEntry,
      runtimeEntry,
    ]);
    expect(mergeStaticPluginUiEntries([staticEntry], [createEntry()])).toEqual([
      createEntry(),
    ]);
  });

  it('resolves exact runtime ids first for static entry execution', () => {
    const staticEntry = createEntry();

    expect(resolveStaticPluginUiEntryExecutionTarget(staticEntry, [createEntry()]))
      .toBe('plugin.test:ui:launch');
  });

  it('falls back to a unique runtime entry with matching metadata', () => {
    const staticEntry = createEntry();
    const runtimeEntry = createEntry({
      id: 'plugin.test:ui:1',
    });

    expect(resolveStaticPluginUiEntryExecutionTarget(staticEntry, [runtimeEntry]))
      .toBe('plugin.test:ui:1');
  });

  it('refuses ambiguous runtime matches', () => {
    const staticEntry = createEntry();

    expect(resolveStaticPluginUiEntryExecutionTarget(staticEntry, [
      createEntry({ id: 'plugin.test:ui:1' }),
      createEntry({ id: 'plugin.test:ui:2' }),
    ])).toBeNull();
  });
});
