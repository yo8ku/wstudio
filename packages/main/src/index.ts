/**
 * Main process service initialization entry.
 */

import { app, BrowserWindow } from 'electron';
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
import { registerShellHandlers } from './ipc/shellHandlers';
import { registerAIProxyHandlers } from './ipc/aiProxyHandlers';
import { registerCloudEmbeddingHandlers } from './ipc/cloudEmbeddingHandlers';
import { registerAIPanelContributionHandlers } from './ipc/aiPanelContributionHandlers';
import { registerExtensionDevelopmentHandlers } from './ipc/extensionDevelopmentHandlers';
import { registerPluginUIHandlers } from './ipc/pluginUIHandlers';
import { registerPluginRuntimeHandlers } from './ipc/pluginRuntimeHandlers';
import { registerPluginSurfaceHandlers } from './ipc/pluginSurfaceHandlers';
import { registerWorkbenchContributionHandlers } from './ipc/workbenchContributionHandlers';
import { builtinAI } from './services/builtinAIInstance';
import { pluginSurfaceViewService } from './services/plugin-surface/PluginSurfaceViewService';
import {
  aiPanelActionRegistry,
  aiPanelContributionRegistry,
  pluginCapabilityRouter,
  pluginDiscoveryService,
  pluginEditorBridge,
  pluginHotReloadService,
  pluginHostManager,
  workbenchContributionRegistry,
} from './services/LegacyPluginPlatformStub';

const settingsManager = new SettingsManager();
const workspaceManager = new WorkspaceManager();
let pluginHostShutdownHookInstalled = false;

function installPluginHostShutdownHook(): void {
  if (pluginHostShutdownHookInstalled) {
    return;
  }

  pluginHostShutdownHookInstalled = true;
  app.once('before-quit', () => {
    void pluginHostManager.shutdown();
  });
}

export async function initializeExtensions(mainWindow?: BrowserWindow | null): Promise<void> {
  installPluginHostShutdownHook();
  registerStoreHandlers();
  registerSettingsHandlers(settingsManager, workspaceManager, mainWindow || null);
  registerFileHandlers(settingsManager);
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
  registerShellHandlers();
  registerAIProxyHandlers();
  registerCloudEmbeddingHandlers();
  registerAIPanelContributionHandlers();
  registerExtensionDevelopmentHandlers();
  registerPluginUIHandlers();
  registerPluginRuntimeHandlers();
  registerPluginSurfaceHandlers();
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
  pluginSurfaceViewService.setMainWindow(mainWindow || null);

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
  pluginSurfaceViewService,
};

export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';
export { aiPanelContributionRegistry, aiPanelActionRegistry };
export { workbenchContributionRegistry };

export { FileReferenceService } from './services/FileReferenceService';
export type { FileReference } from './services/FileReferenceService';

export { cleanupDatabaseConnections } from './ipc/databaseConnectorHandlers';
