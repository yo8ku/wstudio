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
import { builtinAI } from './services/builtinAIInstance';

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

  console.log('[Main] RAG services initialized');

  await settingsManager.initialize();
  await builtinAI.initialize();
  console.log('[Main] Builtin AI initialized');
}

export { settingsManager, workspaceManager, builtinAI };

export { SettingsManager } from './config/SettingsManager';
export type { SettingsSchema, SettingsValue } from './config/SettingsManager';

export { FileReferenceService } from './services/FileReferenceService';
export type { FileReference } from './services/FileReferenceService';

export { cleanupDatabaseConnections } from './ipc/databaseConnectorHandlers';
