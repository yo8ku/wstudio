/**
 * 笔记链接相关工具
 * 功能：同步当前文件到 note-system，并提供双向链接/反向链接的统一打开能力
 */

import { FileParser } from '@note-studio/global-rag';
import type { NoteItem } from '../types/electron';

const SPECIAL_PATH_PREFIXES = [
  'settings:/',
  'theme-override://',
  'theme-config://',
  'ai-config:/'
];

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdx']);
const hasExtension = (value: string): boolean => /\.[^./\\]+$/.test(value);

export interface LinkableFileLike {
  path?: string;
  title?: string;
  type?: string;
}

export interface UpsertNoteByPathPayload {
  path: string;
  title: string;
  content: string;
  previousPath?: string;
  metadata?: string;
}

export const isLinkableFile = (file?: LinkableFileLike | null): boolean => {
  if (!file || (file.type && file.type !== 'file')) {
    return false;
  }

  const path = file.path?.trim() || '';
  if (!path) {
    return false;
  }

  if (SPECIAL_PATH_PREFIXES.some(prefix => path.startsWith(prefix))) {
    return false;
  }

  const reference = file.title || path;
  return FileParser.isSupportedFileType(reference) || (!hasExtension(reference) && !hasExtension(path));
};

export const getEditorLanguageForNote = (note: Pick<NoteItem, 'path' | 'title'>): string => {
  const reference = note.path || note.title || '';
  const extension = reference.split('.').pop()?.toLowerCase() || '';
  return MARKDOWN_EXTENSIONS.has(extension) ? 'markdown' : 'plaintext';
};

export const getNoteByPath = async (path: string): Promise<NoteItem | null> => {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return null;
  }

  const note = await window.electron?.ipcRenderer.invoke('note:getByPath', normalizedPath);
  return note || null;
};

export const upsertNoteByPath = async (payload: UpsertNoteByPathPayload): Promise<NoteItem | null> => {
  const normalizedPath = payload.path.trim();
  if (!normalizedPath) {
    return null;
  }

  const note = await window.electron?.ipcRenderer.invoke('note:upsertByPath', {
    ...payload,
    path: normalizedPath,
    previousPath: payload.previousPath?.trim() || undefined
  });

  return note || null;
};

export const openBidirectionalLinksPanel = (): void => {
  window.dispatchEvent(new CustomEvent('open-panel', {
    detail: { view: 'links' }
  }));
};

export const openNoteInEditor = async (
  noteId: string,
  options?: {
    lineNumber?: number;
    column?: number;
    setCurrentNote?: (note: NoteItem | null) => void;
  }
): Promise<NoteItem | null> => {
  const note = await window.electron?.ipcRenderer.invoke('note:get', noteId) as NoteItem | null;
  if (!note) {
    return null;
  }

  options?.setCurrentNote?.(note);

  window.dispatchEvent(new CustomEvent('open-file', {
    detail: {
      path: note.path,
      content: note.content,
      name: note.title,
      language: getEditorLanguageForNote(note),
      isPreview: false,
      lineNumber: options?.lineNumber,
      column: options?.column ?? 1
    }
  }));

  return note;
};
