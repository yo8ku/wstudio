import { ipcMain } from 'electron';
import * as path from 'node:path';
import { noteDatabase } from '../note-system';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import {
  isWorkspaceSearchSkippedRelativePath,
  searchWorkspaceText,
  toWorkspaceRelativePath,
  type WorkspaceTextSearchRequest,
  type WorkspaceTextSearchResponse,
  type WorkspaceTextSearchTarget,
} from '../workspace/WorkspaceTextSearchService';

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
  'workspace:search-text',
] as const;

let handlersRegistered = false;

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isPathWithinWorkspace = (workspaceDirectory: string, targetPath: string): boolean => {
  const normalizedWorkspacePath = path.resolve(workspaceDirectory);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedWorkspacePath, normalizedTargetPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const buildWorkspaceNoteSearchTargets = async (
  workspaceDirectory: string,
): Promise<WorkspaceTextSearchTarget[]> => {
  await noteDatabase.initialize();
  const notes = await noteDatabase.getAllNotes();

  return notes.reduce<WorkspaceTextSearchTarget[]>((targets, note) => {
    const normalizedNotePath = note.path.trim();
    if (
      normalizedNotePath.length > 0
      && isWorkspaceSearchSkippedRelativePath(normalizedNotePath)
    ) {
      return targets;
    }

    const resolvedPath = normalizedNotePath.length > 0
      ? (path.isAbsolute(normalizedNotePath)
        ? path.resolve(normalizedNotePath)
        : path.resolve(workspaceDirectory, normalizedNotePath))
      : `note://${note.id}`;
    const relativePath = normalizedNotePath.length > 0
      ? (isPathWithinWorkspace(workspaceDirectory, resolvedPath)
        ? toWorkspaceRelativePath(workspaceDirectory, resolvedPath)
        : normalizedNotePath.replace(/\\/g, '/'))
      : (note.title.trim() || note.id);

    targets.push({
      absolutePath: resolvedPath,
      relativePath,
      content: note.content,
      source: 'note',
      noteId: note.id,
      title: note.title,
    });

    return targets;
  }, []);
};

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
      const noteTargets = await buildWorkspaceNoteSearchTargets(workspaceDirectory);

      return {
        success: true,
        data: await searchWorkspaceText(workspaceDirectory, request, noteTargets),
      };
    } catch (error) {
      console.error('[Workspace IPC] failed to search workspace text:', error);
      return { success: false, error: toErrorMessage(error) };
    }
  });
};
