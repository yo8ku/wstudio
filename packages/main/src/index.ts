/**
 * Main process service initialization entry.
 */

import { BrowserWindow } from 'electron';
import { SettingsManager } from './config/SettingsManager';
import { WorkspaceManager } from './workspace/WorkspaceManager';
import { registerStoreHandlers } from './ipc/storeHandlers';
import { registerFileHandlers } from './ipc/fileHandlers';
import { registerThemeHandlers } from './ipc/themeHandlers';
import { registerChatHistoryHandlers } from './ipc/chatHistoryHandlers';
import { registerInlineChatHistoryHandlers } from './ipc/inlineChatHistoryHandlers';
import { registerTerminalHandlers } from './ipc/terminalHandlers';
import { registerAIModelHandlers } from './ipc/aiModelHandlers';
import { registerFileReferenceHandlers } from './ipc/fileReferenceHandlers';
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers';
import {
  registerWorkspaceVectorIndexHandlers,
  setWorkspaceVectorIndexMainWindow
} from './ipc/workspaceVectorIndexHandlers';
import { registerWorkspaceIndexDbHandlers } from './ipc/workspaceIndexDbHandlers';
import { ThemeService } from './services/ThemeService';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerNoteSystemHandlers } from './note-system';
import {
  registerDatabaseConnectorHandlers,
  cleanupDatabaseConnections
} from './ipc/databaseConnectorHandlers';
import { registerFormHandlers } from './ipc/formHandlers';
import { getCodeRunnerService } from './services/CodeRunnerService';
import { registerSkillsMarketHandlers } from './ipc/skillsMarketHandlers';
import { registerMediaHandlers } from './ipc/mediaHandlers';
import { registerAIPanelContributionHandlers } from './ipc/aiPanelContributionHandlers';
import { registerExtensionDevelopmentHandlers } from './ipc/extensionDevelopmentHandlers';
import { registerWorkbenchContributionHandlers } from './ipc/workbenchContributionHandlers';
import { builtinAI } from './services/builtinAIInstance';
import { pluginCapabilityRouter } from './plugins/PluginCapabilityRouter';
import { pluginDiscoveryService } from './plugins/PluginDiscoveryService';
import { pluginEditorBridge } from './plugins/PluginEditorBridge';
import { pluginHotReloadService } from './plugins/PluginHotReloadService';
import { pluginHostManager } from './plugins/PluginHostManager';
import { workbenchContributionRegistry } from './plugins/WorkbenchContributionRegistry';

const settingsManager = new SettingsManager();
const workspaceManager = new WorkspaceManager();

export async function initializeExtensions(mainWindow?: BrowserWindow | null): Promise<void> {
  registerStoreHandlers();
  registerSettingsHandlers(settingsManager, workspaceManager, mainWindow || null);
  registerFileHandlers();
  registerWorkspaceHandlers(workspaceManager);
  registerThemeHandlers();
  registerChatHistoryHandlers();
  registerInlineChatHistoryHandlers();
  registerAIModelHandlers();
  registerFileReferenceHandlers();
  registerWorkspaceVectorIndexHandlers();
  registerWorkspaceIndexDbHandlers();
  registerNoteSystemHandlers();
  registerDatabaseConnectorHandlers();
  registerFormHandlers();
  registerSkillsMarketHandlers();
  registerMediaHandlers();
  registerAIPanelContributionHandlers();
  registerExtensionDevelopmentHandlers();
  registerWorkbenchContributionHandlers();

  getCodeRunnerService();
  console.log('[Main] Code runner initialized');

  registerTerminalHandlers();

  const themeService = ThemeService.getInstance();
  await themeService.initialize();
  await workspaceManager.initialize();

  if (mainWindow) {
    console.log('[Main] Bind workspace index progress to the main window');
    setWorkspaceVectorIndexMainWindow(mainWindow);
  } else {
    console.log('[Main] Skip workspace index window binding because mainWindow is null');
  }
  pluginEditorBridge.setMainWindow(mainWindow || null);

  console.log('[Main] RAG services initialized');

  await settingsManager.initialize();
  await pluginDiscoveryService.initialize();
  console.log('[Main] Plugin discovery initialized');
  await builtinAI.initialize();
  console.log('[Main] Builtin AI initialized');
  pluginCapabilityRouter.configure({
    settingsManager,
    workspaceManager,
    builtinAI,
    editorBridge: pluginEditorBridge,
  });
  console.log('[Main] Plugin capability router configured');
  await pluginHostManager.initialize();
  console.log('[Main] Plugin host initialized');
  await pluginHotReloadService.start();
  console.log('[Main] Plugin hot reload initialized');
}

export {
  settingsManager,
  workspaceManager,
  builtinAI,
  pluginCapabilityRouter,
  pluginDiscoveryService,
  pluginEditorBridge,
  pluginHostManager,
  pluginHotReloadService,
};

export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';
export { aiPanelContributionRegistry } from './plugins/AIPanelContributionRegistry';
export { aiPanelActionRegistry } from './plugins/AIPanelActionRegistry';
export { workbenchContributionRegistry };

export { FileReferenceService } from './services/FileReferenceService';
export type { FileReference } from './services/FileReferenceService';

export { cleanupDatabaseConnections } from './ipc/databaseConnectorHandlers';
