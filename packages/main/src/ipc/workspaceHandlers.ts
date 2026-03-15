import { ipcMain } from 'electron';
import { WorkspaceManager } from '../workspace/WorkspaceManager';

interface WorkspaceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const WORKSPACE_CHANNELS = [
  'workspace:get-dir',
  'workspace:get-recent-files',
  'workspace:get-last-opened',
  'workspace:add-recent-file',
  'workspace:clear-recent-files',
] as const;

let handlersRegistered = false;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const registerWorkspaceHandlers = (workspaceManager: WorkspaceManager): void => {
  if (handlersRegistered) {
    return;
  }

  for (const channel of WORKSPACE_CHANNELS) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      // Ignore missing handlers during startup.
    }
  }

  handlersRegistered = true;

  ipcMain.handle('workspace:get-dir', async (): Promise<WorkspaceResponse<string>> => {
    try {
      return {
        success: true,
        data: workspaceManager.getWorkspaceDir(),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get workspace dir:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:get-recent-files', async (): Promise<WorkspaceResponse<string[]>> => {
    try {
      return {
        success: true,
        data: workspaceManager.getRecentFiles(),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get recent files:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:get-last-opened', async (): Promise<WorkspaceResponse<string | undefined>> => {
    try {
      return {
        success: true,
        data: workspaceManager.getLastOpenedFile(),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get last opened file:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:add-recent-file', async (
    _event,
    filePath: string
  ): Promise<WorkspaceResponse<void>> => {
    try {
      workspaceManager.addRecentFile(filePath);
      return { success: true };
    } catch (error) {
      console.error('[Workspace IPC] failed to add recent file:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:clear-recent-files', async (): Promise<WorkspaceResponse<void>> => {
    try {
      workspaceManager.clearRecentFiles();
      return { success: true };
    } catch (error) {
      console.error('[Workspace IPC] failed to clear recent files:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });
};
