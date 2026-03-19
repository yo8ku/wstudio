import type { LocalExtensionItem } from './types';

const blossomDarkIcon = new URL('../../../../../../../resources/blossom.dark.png', import.meta.url).href;
const claudeLogoIcon = new URL('../../../../../../../resources/claude-logo.png', import.meta.url).href;
const copilotAppIcon = new URL('../../../../../../../resources/Copilot-App-Icon.png', import.meta.url).href;

export const MOCK_LOCAL_EXTENSIONS: readonly LocalExtensionItem[] = [
  {
    id: 'local.wstudio-plugin-starter',
    displayName: 'WStudio Plugin Starter',
    downloadCount: '15K',
    description: 'Starter template for commands, webviews, and plugin assets.',
    version: '1.0.0',
    publisher: 'WStudio',
    isOfficialPublisher: true,
    installedAt: '2026-03-18',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/Agent',
    status: 'enabled',
    iconPath: blossomDarkIcon,
    iconName: 'extensions',
    capabilities: ['Local', 'Commands', 'Webview'],
  },
  {
    id: 'local.mermaid-preview-tools',
    displayName: 'Mermaid Preview Tools',
    downloadCount: '49.2M',
    description: 'Adds preview and export helpers for Mermaid workflows.',
    version: '0.9.2',
    publisher: 'Mermaid Labs',
    isOfficialPublisher: false,
    installedAt: '2026-03-14',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/MermaidPreviewTools',
    status: 'update-available',
    iconPath: claudeLogoIcon,
    iconName: 'sparkles',
    capabilities: ['Local', 'Diagrams', 'Export'],
  },
  {
    id: 'local.document-translator',
    displayName: 'Document Translator',
    downloadCount: '15.8K',
    description: 'Translation helpers for notes and workspace documents.',
    version: '0.4.1',
    publisher: 'Note Tools Collective',
    isOfficialPublisher: false,
    installedAt: '2026-03-09',
    installPath: 'C:/Users/Administrator/AppData/Roaming/note-studio/plugins/DocumentTranslator',
    status: 'disabled',
    iconPath: copilotAppIcon,
    iconName: 'tool',
    capabilities: ['Local', 'Text', 'Sidebar'],
  },
] as const;
