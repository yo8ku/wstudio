import { ipcMain } from 'electron';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import {
  listWorkspaceSearchRootDirectories,
  replaceWorkspaceText,
  searchWorkspaceText,
  type WorkspaceTextReplaceRequest,
  type WorkspaceTextReplaceResponse,
  type WorkspaceTextSearchRequest,
  type WorkspaceTextSearchResponse,
} from '../workspace/WorkspaceTextSearchService';
import { type WorkspaceSearchBlockCandidate } from '../workspace/WorkspaceSearchBlocks';
import {
  buildWorkspaceNoteSearchTargets,
  listWorkspaceNoteSearchBlockKeywords,
  listWorkspaceNoteSearchTags,
} from '../workspace/WorkspaceSearchNoteTargets';
import {
  WorkspaceTextSearchSessionService,
  type WorkspaceSearchSessionStartResult,
} from '../workspace/WorkspaceTextSearchSessionService';

interface WorkspaceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const WORKSPACE_CHANNELS = [
  'workspace:get-dir',
  'workspace:get-root-directories',
  'workspace:get-search-block-keywords',
  'workspace:get-search-tags',
  'workspace:get-recent-files',
  'workspace:get-last-opened',
  'workspace:add-recent-file',
  'workspace:clear-recent-files',
  'workspace:search-text',
  'workspace:replace-text',
  'workspace:search-start',
  'workspace:search-cancel',
] as const;

let handlersRegistered = false;
const workspaceTextSearchSessionService = new WorkspaceTextSearchSessionService();

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

  ipcMain.handle('workspace:get-root-directories', async (): Promise<WorkspaceResponse<string[]>> => {
    try {
      return {
        success: true,
        data: await listWorkspaceSearchRootDirectories(workspaceManager.getWorkspaceDir()),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get root directories:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:get-search-tags', async (
    _event,
    request?: Pick<WorkspaceTextSearchRequest, 'includePattern' | 'excludePattern'>,
  ): Promise<WorkspaceResponse<string[]>> => {
    try {
      return {
        success: true,
        data: await listWorkspaceNoteSearchTags(workspaceManager.getWorkspaceDir(), request),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get search tags:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:get-search-block-keywords', async (
    _event,
    request?: Pick<WorkspaceTextSearchRequest, 'includePattern' | 'excludePattern'>,
  ): Promise<WorkspaceResponse<WorkspaceSearchBlockCandidate[]>> => {
    try {
      return {
        success: true,
        data: await listWorkspaceNoteSearchBlockKeywords(workspaceManager.getWorkspaceDir(), request),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to get search block keywords:', error);
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
    filePath: string,
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

  ipcMain.handle('workspace:search-text', async (
    _event,
    request: WorkspaceTextSearchRequest,
  ): Promise<WorkspaceResponse<WorkspaceTextSearchResponse>> => {
    try {
      const workspaceDirectory = workspaceManager.getWorkspaceDir();
      const noteTargets = await buildWorkspaceNoteSearchTargets(workspaceDirectory, request);

      return {
        success: true,
        data: await searchWorkspaceText(workspaceDirectory, request, noteTargets),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to search workspace text:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:replace-text', async (
    _event,
    request: WorkspaceTextReplaceRequest,
  ): Promise<WorkspaceResponse<WorkspaceTextReplaceResponse>> => {
    try {
      const workspaceDirectory = workspaceManager.getWorkspaceDir();
      const noteTargets = await buildWorkspaceNoteSearchTargets(workspaceDirectory, request);

      return {
        success: true,
        data: await replaceWorkspaceText(workspaceDirectory, request, noteTargets),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to replace workspace text:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:search-start', async (
    event,
    request: WorkspaceTextSearchRequest,
  ): Promise<WorkspaceResponse<WorkspaceSearchSessionStartResult>> => {
    try {
      return {
        success: true,
        data: await workspaceTextSearchSessionService.startSession(
          event.sender,
          workspaceManager.getWorkspaceDir(),
          request,
        ),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to start workspace search:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });

  ipcMain.handle('workspace:search-cancel', async (
    _event,
    sessionId: string,
  ): Promise<WorkspaceResponse<{ cancelled: boolean }>> => {
    try {
      return {
        success: true,
        data: {
          cancelled: workspaceTextSearchSessionService.cancelSession(sessionId),
        },
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to cancel workspace search:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });
};
