import type { ExtensionPanelItem, ExtensionPanelStatus } from '../../../ExtensionPanel';

const PLUGIN_INSTALLED_PLUGINS_CHANNEL = 'plugin-ui:get-installed-plugins';
const PLUGIN_UI_CHANGED_CHANNEL = 'plugin-ui:entries-changed';
const betaBadgePath = new URL('../../../../../../../resources/beta.png', import.meta.url).href;

interface InstalledPluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string | null;
  readonly description: string | null;
  readonly fundingUrl: string | null;
  readonly iconPath: string | null;
  readonly releaseChannel: 'stable' | 'development';
  readonly enabled: boolean;
  readonly failureMessage: string | null;
}

function toExtensionStatus(plugin: InstalledPluginSummary): ExtensionPanelStatus {
  return plugin.enabled ? 'enabled' : 'disabled';
}

function toInstalledAtLabel(releaseChannel: InstalledPluginSummary['releaseChannel']): string {
  return releaseChannel === 'development' ? '测试插件' : '正式插件';
}

function toCapabilities(plugin: InstalledPluginSummary): readonly string[] {
  const result = [
    '第三方插件',
    toInstalledAtLabel(plugin.releaseChannel),
    plugin.enabled ? '已启用' : '未启用',
  ];

  if (plugin.failureMessage !== null) {
    result.push(plugin.failureMessage);
  }

  return result;
}

function toExtensionPanelItem(plugin: InstalledPluginSummary): ExtensionPanelItem {
  return {
    id: plugin.id,
    displayName: plugin.name,
    downloadCount: `v${plugin.version}`,
    description: plugin.description ?? '暂无描述',
    version: plugin.version,
    publisher: plugin.publisher ?? 'Unknown Publisher',
    isOfficialPublisher: false,
    installedAt: toInstalledAtLabel(plugin.releaseChannel),
    installPath: plugin.id,
    status: toExtensionStatus(plugin),
    iconPath: plugin.iconPath ?? undefined,
    iconName: plugin.releaseChannel === 'development' ? 'beaker' : 'extensions',
    badgeImagePath: plugin.releaseChannel === 'development' ? betaBadgePath : undefined,
    capabilities: toCapabilities(plugin),
  };
}

export async function loadInstalledPluginExtensions(): Promise<readonly ExtensionPanelItem[]> {
  const ipcRenderer = window.electron?.ipcRenderer;

  if (!ipcRenderer) {
    return [];
  }

  const plugins = await ipcRenderer.invoke(
    PLUGIN_INSTALLED_PLUGINS_CHANNEL,
  ) as readonly InstalledPluginSummary[];

  return plugins.map((plugin) => toExtensionPanelItem(plugin));
}

export function subscribeInstalledPluginExtensions(listener: () => void): () => void {
  const unsubscribe = window.electron?.ipcRenderer.on(
    PLUGIN_UI_CHANGED_CHANNEL,
    () => {
      listener();
    },
  );

  return unsubscribe ?? (() => undefined);
}
