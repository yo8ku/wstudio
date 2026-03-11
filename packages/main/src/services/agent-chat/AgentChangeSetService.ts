/**
 * Helpers for building change-set previews and execution snapshots for Agent
 * write tools.
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import {
  ensureWritablePath,
  resolveDisplayPath,
  resolveWorkspacePath,
} from '@note-studio/agent';
import type { AgentChatChangeSet, AgentChatChangeSetFile } from '@note-studio/shared';

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const countOccurrences = (source: string, search: string): number => {
  if (!search) {
    return 0;
  }

  let count = 0;
  let index = 0;
  while (true) {
    const nextIndex = source.indexOf(search, index);
    if (nextIndex < 0) {
      return count;
    }

    count += 1;
    index = nextIndex + search.length;
  }
};

const parseDiffChanges = (value: unknown): Array<{ search: string; replace: string; replaceAll: boolean }> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<Array<{ search: string; replace: string; replaceAll: boolean }>>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }

    const search = typeof item.search === 'string'
      ? item.search
      : (typeof item.oldText === 'string' ? item.oldText : '');
    const replace = typeof item.replace === 'string'
      ? item.replace
      : (typeof item.newText === 'string' ? item.newText : '');

    if (!search) {
      return acc;
    }

    acc.push({
      search,
      replace,
      replaceAll: item.replaceAll === true,
    });
    return acc;
  }, []);
};

const applyDiffChanges = (
  content: string,
  changes: Array<{ search: string; replace: string; replaceAll: boolean }>,
): string => {
  let nextContent = content;

  for (const change of changes) {
    const occurrenceCount = countOccurrences(nextContent, change.search);
    if (occurrenceCount === 0) {
      throw new Error(`diff search text not found: ${change.search.slice(0, 80)}`);
    }

    if (change.replaceAll) {
      nextContent = nextContent.split(change.search).join(change.replace);
      continue;
    }

    if (occurrenceCount > 1) {
      throw new Error(`diff search text is ambiguous and matched ${occurrenceCount} times`);
    }

    nextContent = nextContent.replace(change.search, change.replace);
  }

  return nextContent;
};

const countLineDiffStats = (beforeText: string, afterText: string): { additions: number; deletions: number } => {
  const beforeLines = beforeText.split(/\r?\n/);
  const afterLines = afterText.split(/\r?\n/);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);

  let additions = 0;
  let deletions = 0;

  for (const line of afterLines) {
    if (!beforeSet.has(line)) {
      additions += 1;
    }
  }

  for (const line of beforeLines) {
    if (!afterSet.has(line)) {
      deletions += 1;
    }
  }

  return { additions, deletions };
};

const buildChangeSetFile = (
  filePath: string,
  beforeText: string | null,
  afterText: string | null,
): AgentChatChangeSetFile => {
  const beforeValue = beforeText ?? '';
  const afterValue = afterText ?? '';
  const stats = countLineDiffStats(beforeValue, afterValue);

  let changeType: AgentChatChangeSetFile['changeType'] = 'update';
  if (beforeText === null && afterText !== null) {
    changeType = 'create';
  } else if (beforeText !== null && afterText === null) {
    changeType = 'delete';
  }

  return {
    path: filePath,
    changeType,
    beforeText,
    afterText,
    additions: stats.additions,
    deletions: stats.deletions,
  };
};

const readExistingFile = async (workspacePath: string, filePath: string): Promise<string | null> => {
  const resolvedPath = resolveWorkspacePath(workspacePath, filePath);
  const exists = await fs.access(resolvedPath).then(() => true).catch(() => false);
  if (!exists) {
    return null;
  }

  return fs.readFile(resolvedPath, 'utf8');
};

const ensureWriteTarget = (workspacePath: string, filePath: string): string => {
  const resolvedPath = resolveWorkspacePath(workspacePath, filePath);
  ensureWritablePath(resolvedPath);
  return resolvedPath;
};

const buildBundleFilePreview = async (
  workspacePath: string,
  item: Record<string, unknown>,
): Promise<AgentChatChangeSetFile> => {
  const filePath = normalizeText(item.path);
  const resolvedPath = ensureWriteTarget(workspacePath, filePath);
  const displayPath = resolveDisplayPath(workspacePath, resolvedPath);
  const beforeText = await readExistingFile(workspacePath, filePath);
  const directContent = typeof item.content === 'string' ? item.content : null;
  const afterText = directContent !== null
    ? directContent
    : applyDiffChanges(beforeText ?? '', parseDiffChanges(item.changes ?? item.edits));

  return buildChangeSetFile(displayPath, beforeText, afterText);
};

export const buildApprovalChangeSet = async (
  toolName: string,
  params: Record<string, unknown>,
  workspacePath: string,
): Promise<AgentChatChangeSet | null> => {
  if (toolName === 'write_file') {
    const filePath = normalizeText(params.path);
    if (!filePath) {
      return null;
    }

    const resolvedPath = ensureWriteTarget(workspacePath, filePath);
    const beforeText = await readExistingFile(workspacePath, filePath);
    return {
      id: randomUUID(),
      title: 'Agent change set',
      summary: 'Pending file write',
      createdAt: Date.now(),
      files: [
        buildChangeSetFile(
          resolveDisplayPath(workspacePath, resolvedPath),
          beforeText,
          typeof params.content === 'string' ? params.content : '',
        ),
      ],
    };
  }

  if (toolName === 'edit_file' || toolName === 'multi_edit_file' || toolName === 'apply_diff') {
    const filePath = normalizeText(params.path);
    if (!filePath) {
      return null;
    }

    const resolvedPath = ensureWriteTarget(workspacePath, filePath);
    const beforeText = await readExistingFile(workspacePath, filePath);
    const changes = toolName === 'edit_file'
      ? parseDiffChanges([{
          oldText: params.oldText,
          newText: params.newText,
          replaceAll: params.replaceAll,
        }])
      : parseDiffChanges(params.edits ?? params.changes);
    const afterText = applyDiffChanges(beforeText ?? '', changes);

    return {
      id: randomUUID(),
      title: 'Agent change set',
      summary: 'Pending diff update',
      createdAt: Date.now(),
      files: [
        buildChangeSetFile(
          resolveDisplayPath(workspacePath, resolvedPath),
          beforeText,
          afterText,
        ),
      ],
    };
  }

  if (toolName === 'apply_diff_bundle') {
    const files = Array.isArray(params.files)
      ? params.files.filter((item): item is Record<string, unknown> => isRecord(item))
      : [];
    if (files.length === 0) {
      return null;
    }

    return {
      id: randomUUID(),
      title: 'Agent change set',
      summary: `Pending multi-file update (${files.length} files)`,
      createdAt: Date.now(),
      files: await Promise.all(files.map(item => buildBundleFilePreview(workspacePath, item))),
    };
  }

  return null;
};

export const collectWriteBeforeContents = async (
  toolName: string,
  params: Record<string, unknown>,
  workspacePath: string,
): Promise<Record<string, string | null>> => {
  const changeSet = await buildApprovalChangeSet(toolName, params, workspacePath);
  if (!changeSet) {
    return {};
  }

  return changeSet.files.reduce<Record<string, string | null>>((acc, file) => {
    acc[file.path] = file.beforeText;
    return acc;
  }, {});
};

export const buildExecutionChangeSet = async (
  toolName: string,
  params: Record<string, unknown>,
  workspacePath: string,
  beforeContents: Record<string, string | null>,
): Promise<AgentChatChangeSet | null> => {
  const preview = await buildApprovalChangeSet(toolName, params, workspacePath);
  if (!preview) {
    return null;
  }

  return {
    ...preview,
    files: preview.files.map(file => ({
      ...file,
      beforeText: Object.prototype.hasOwnProperty.call(beforeContents, file.path)
        ? beforeContents[file.path]
        : file.beforeText,
    })),
  };
};

export const applyApprovalDecisionsToToolParams = (
  toolName: string,
  params: Record<string, unknown>,
  changeSet: AgentChatChangeSet | null,
  fileDecisions: Record<string, 'approved' | 'rejected'> | undefined,
): {
  approved: boolean;
  effectiveParams: Record<string, unknown>;
  approvedChangeSet: AgentChatChangeSet | null;
} => {
  if (!changeSet || !fileDecisions || toolName !== 'apply_diff_bundle') {
    return {
      approved: true,
      effectiveParams: { ...params },
      approvedChangeSet: changeSet ? cloneChangeSet(changeSet) : null,
    };
  }

  const files = Array.isArray(params.files)
    ? params.files.filter((item): item is Record<string, unknown> => isRecord(item))
    : [];
  const approvedFiles = changeSet.files.filter(file => fileDecisions[file.path] !== 'rejected');
  const approvedPaths = new Set(approvedFiles.map(file => file.path));
  const effectiveFiles = files.filter(item => approvedPaths.has(normalizeText(item.path)));

  return {
    approved: effectiveFiles.length > 0,
    effectiveParams: {
      ...params,
      files: effectiveFiles,
    },
    approvedChangeSet: approvedFiles.length > 0
      ? {
          ...changeSet,
          files: approvedFiles.map(file => ({ ...file })),
        }
      : null,
  };
};

const cloneChangeSet = (changeSet: AgentChatChangeSet): AgentChatChangeSet => ({
  ...changeSet,
  files: changeSet.files.map(file => ({ ...file })),
});
