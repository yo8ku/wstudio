/**
 * Standalone mock data for the extensions UI.
 * This keeps the visual panel usable even when the plugin API layer is rebuilt.
 */

import type { ExtensionPanelItem } from './types';

const blossomDarkIcon = new URL('../../../../../resources/blossom.dark.png', import.meta.url).href;
const claudeLogoIcon = new URL('../../../../../resources/claude-logo.png', import.meta.url).href;
const copilotAppIcon = new URL('../../../../../resources/Copilot-App-Icon.png', import.meta.url).href;

export const MOCK_EXTENSION_PANEL_ITEMS: readonly ExtensionPanelItem[] = [
  {
    id: 'mock.wstudio-extension-panel-sample',
    displayName: 'WStudio Plugin Starter',
    downloadCount: '15K',
    downloadsLabel: '15K',
    description: 'Starter template for commands, webviews, and plugin assets.',
    version: '1.0.0',
    publisher: 'WStudio',
    publisherUrl: 'https://example.com/wstudio-plugin-starter',
    isOfficialPublisher: true,
    rating: '4.9',
    installedAt: '2026-03-18',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/Agent',
    status: 'enabled',
    iconPath: blossomDarkIcon,
    iconName: 'extensions',
    canToggleEnabled: false,
    canUninstall: false,
    hasSettings: true,
    capabilities: ['Local', 'Commands', 'Webview'],
  },
  {
    id: 'local.mermaid-preview-tools',
    displayName: 'Mermaid Preview Tools',
    downloadCount: '49.2M',
    downloadsLabel: '49.2M',
    description: 'Adds preview and export helpers for Mermaid workflows.',
    version: '0.9.2',
    publisher: 'Mermaid Labs',
    publisherUrl: 'https://example.com/mermaid-preview-tools',
    isOfficialPublisher: false,
    rating: '4.7',
    installedAt: '2026-03-14',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/MermaidPreviewTools',
    status: 'update-available',
    iconPath: claudeLogoIcon,
    iconName: 'sparkles',
    canToggleEnabled: false,
    canUninstall: false,
    hasSettings: true,
    capabilities: ['Local', 'Diagrams', 'Export'],
  },
  {
    id: 'local.document-translator',
    displayName: 'Document Translator',
    downloadCount: '15.8K',
    downloadsLabel: '15.8K',
    description: 'Translation helpers for notes and workspace documents.',
    version: '0.4.1',
    publisher: 'Note Tools Collective',
    publisherUrl: 'https://example.com/document-translator',
    isOfficialPublisher: false,
    rating: '4.3',
    installedAt: '2026-03-09',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/DocumentTranslator',
    status: 'disabled',
    iconPath: copilotAppIcon,
    iconName: 'tool',
    canToggleEnabled: false,
    canUninstall: false,
    hasSettings: true,
    capabilities: ['Local', 'Text', 'Sidebar'],
  },
] as const;

export function findMockExtensionPanelItemById(extensionId: string): ExtensionPanelItem | null {
  return MOCK_EXTENSION_PANEL_ITEMS.find(item => item.id === extensionId) ?? null;
}
