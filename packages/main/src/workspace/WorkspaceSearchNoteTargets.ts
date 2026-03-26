/**
 * Builds workspace note search targets for text search sessions and fallback IPC handlers.
 */

import * as path from 'node:path';
import { noteDatabase } from '../note-system';
import {
  isWorkspaceSearchSkippedRelativePath,
  matchesWorkspaceSearchScope,
  toWorkspaceRelativePath,
  type WorkspaceTextSearchRequest,
  type WorkspaceTextSearchTarget,
} from './WorkspaceTextSearchService';
import { collectWorkspaceSearchBlockCandidates, type WorkspaceSearchBlockCandidate } from './WorkspaceSearchBlocks';
import { collectWorkspaceSearchTags, mergeWorkspaceSearchTags } from './WorkspaceSearchTags';

interface WorkspaceSearchNoteLike {
  readonly path: string;
  readonly title?: string;
}

type WorkspaceSearchAssistScopeRequest = Pick<
  WorkspaceTextSearchRequest,
  'includePattern' | 'excludePattern'
>;

const WORKSPACE_SEARCH_PREFERRED_NOTE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx',
  '.txt',
]);

const isPathWithinWorkspace = (workspaceDirectory: string, targetPath: string): boolean => {
  const normalizedWorkspacePath = path.resolve(workspaceDirectory);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedWorkspacePath, normalizedTargetPath);

  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
};

const normalizeWorkspaceSearchNotePath = (notePath: string): string => notePath.trim();

export const shouldIncludeWorkspaceSearchNote = (
  note: Pick<WorkspaceSearchNoteLike, 'path'>,
): boolean => {
  const normalizedNotePath = normalizeWorkspaceSearchNotePath(note.path);
  return normalizedNotePath.length === 0
    || !isWorkspaceSearchSkippedRelativePath(normalizedNotePath);
};

const getWorkspaceSearchNotePriority = (notePath: string): number => {
  const normalizedNotePath = normalizeWorkspaceSearchNotePath(notePath);
  if (normalizedNotePath.length === 0) {
    return 1;
  }

  const extension = path.extname(normalizedNotePath).toLowerCase();
  return WORKSPACE_SEARCH_PREFERRED_NOTE_EXTENSIONS.has(extension) ? 0 : 1;
};

export const compareWorkspaceSearchNotes = (
  leftNote: WorkspaceSearchNoteLike,
  rightNote: WorkspaceSearchNoteLike,
): number => {
  const priorityDifference = (
    getWorkspaceSearchNotePriority(leftNote.path) - getWorkspaceSearchNotePriority(rightNote.path)
  );
  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const leftReference = normalizeWorkspaceSearchNotePath(leftNote.path) || leftNote.title?.trim() || '';
  const rightReference = normalizeWorkspaceSearchNotePath(rightNote.path) || rightNote.title?.trim() || '';
  return leftReference.localeCompare(rightReference, 'zh-Hans-CN');
};

const resolveWorkspaceSearchNotePathInfo = (
  workspaceDirectory: string,
  notePath: string,
  fallbackLabel: string,
): {
  readonly normalizedNotePath: string;
  readonly resolvedPath: string;
  readonly relativePath: string;
} => {
  const normalizedNotePath = normalizeWorkspaceSearchNotePath(notePath);
  const resolvedPath = normalizedNotePath.length > 0
    ? (path.isAbsolute(normalizedNotePath)
      ? path.resolve(normalizedNotePath)
      : path.resolve(workspaceDirectory, normalizedNotePath))
    : fallbackLabel;
  const relativePath = normalizedNotePath.length > 0
    ? (isPathWithinWorkspace(workspaceDirectory, resolvedPath)
      ? toWorkspaceRelativePath(workspaceDirectory, resolvedPath)
      : normalizedNotePath.replace(/\\/g, '/'))
    : fallbackLabel;

  return {
    normalizedNotePath,
    resolvedPath,
    relativePath,
  };
};

export const matchesWorkspaceSearchNoteScope = (
  relativePath: string,
  request?: WorkspaceSearchAssistScopeRequest,
): boolean => matchesWorkspaceSearchScope(
  relativePath,
  request?.includePattern,
  request?.excludePattern,
);

export const buildWorkspaceNoteSearchTargets = async (
  workspaceDirectory: string,
  request?: WorkspaceSearchAssistScopeRequest,
): Promise<WorkspaceTextSearchTarget[]> => {
  await noteDatabase.initialize();
  const notes = (await noteDatabase.getAllNotes())
    .filter(shouldIncludeWorkspaceSearchNote)
    .sort(compareWorkspaceSearchNotes);
  const noteTagNameMap = await noteDatabase.getTagNamesByNoteIds(notes.map(note => note.id));

  return notes.reduce<WorkspaceTextSearchTarget[]>((targets, note) => {
    const pathInfo = resolveWorkspaceSearchNotePathInfo(
      workspaceDirectory,
      note.path,
      note.title.trim() || note.id,
    );
    if (!matchesWorkspaceSearchNoteScope(pathInfo.relativePath, request)) {
      return targets;
    }

    targets.push({
      absolutePath: pathInfo.resolvedPath,
      editorPath: pathInfo.normalizedNotePath.length > 0
        ? pathInfo.normalizedNotePath
        : pathInfo.resolvedPath,
      relativePath: pathInfo.relativePath,
      content: note.content,
      source: 'note',
      noteId: note.id,
      title: note.title,
      tags: mergeWorkspaceSearchTags(note.content, noteTagNameMap[note.id] ?? []),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });

    return targets;
  }, []);
};

export const listWorkspaceNoteSearchTags = async (
  workspaceDirectory: string,
  request?: WorkspaceSearchAssistScopeRequest,
): Promise<string[]> => {
  await noteDatabase.initialize();
  const notes = (await noteDatabase.getAllNotes())
    .filter(shouldIncludeWorkspaceSearchNote)
    .sort(compareWorkspaceSearchNotes);
  const noteTagNameMap = await noteDatabase.getTagNamesByNoteIds(notes.map(note => note.id));

  return collectWorkspaceSearchTags(
    notes.flatMap((note) => {
      const pathInfo = resolveWorkspaceSearchNotePathInfo(
        workspaceDirectory,
        note.path,
        note.title.trim() || note.id,
      );
      if (!matchesWorkspaceSearchNoteScope(pathInfo.relativePath, request)) {
        return [];
      }

      return [{
        content: note.content,
        persistedTags: noteTagNameMap[note.id] ?? [],
      }];
    }),
  );
};

export const listWorkspaceNoteSearchBlockKeywords = async (
  workspaceDirectory: string,
  request?: WorkspaceSearchAssistScopeRequest,
): Promise<WorkspaceSearchBlockCandidate[]> => {
  await noteDatabase.initialize();
  const notes = (await noteDatabase.getAllNotes())
    .filter(shouldIncludeWorkspaceSearchNote)
    .sort(compareWorkspaceSearchNotes);

  return collectWorkspaceSearchBlockCandidates(
    notes.flatMap((note) => {
      const pathInfo = resolveWorkspaceSearchNotePathInfo(
        workspaceDirectory,
        note.path,
        note.title.trim() || note.id,
      );
      if (!matchesWorkspaceSearchNoteScope(pathInfo.relativePath, request)) {
        return [];
      }

      return [{
        content: note.content,
      }];
    }),
  );
};
