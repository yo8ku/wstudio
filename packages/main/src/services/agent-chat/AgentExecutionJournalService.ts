/**
 * In-memory execution journal for Agent tool calls, including rollback support
 * for tracked file writes and explicit rollback commands.
 */

import { exec, type ExecException } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  assessCommandSecurity,
  resolveWorkspacePath,
} from '@note-studio/agent';
import type {
  AgentChatChangeSet,
  AgentChatListToolExecutionsInput,
  AgentChatRollbackToolExecutionInput,
  AgentChatRollbackToolExecutionResult,
  AgentChatToolExecutionRecord,
} from '@note-studio/shared';

interface AgentExecutionJournalRecordInternal extends AgentChatToolExecutionRecord {
  workspacePath: string;
}

interface RecordExecutionInput {
  threadId: string;
  turnId: string;
  workspacePath: string;
  toolName: string;
  params: Record<string, unknown>;
  success: boolean;
  resultText: string | null;
  changedFiles: string[];
  changeSet: AgentChatChangeSet | null;
  rollbackCommand?: string | null;
  startedAt: number;
  completedAt: number;
}

const DEFAULT_ROLLBACK_TIMEOUT_MS = 30000;
const DEFAULT_ROLLBACK_MAX_BUFFER = 1024 * 1024;

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const cloneChangeSet = (changeSet: AgentChatChangeSet | null): AgentChatChangeSet | null => (
  changeSet
    ? {
        ...changeSet,
        files: changeSet.files.map(file => ({ ...file })),
      }
    : null
);

const cloneRecord = (
  record: AgentExecutionJournalRecordInternal,
): AgentChatToolExecutionRecord => ({
  id: record.id,
  threadId: record.threadId,
  turnId: record.turnId,
  toolName: record.toolName,
  params: { ...record.params },
  success: record.success,
  resultText: record.resultText,
  changedFiles: [...record.changedFiles],
  changeSet: cloneChangeSet(record.changeSet),
  rollbackCommand: record.rollbackCommand,
  rollbackStatus: record.rollbackStatus,
  rollbackError: record.rollbackError,
  createdAt: record.createdAt,
  completedAt: record.completedAt,
  durationMs: record.durationMs,
});

const executeRollbackCommand = async (
  command: string,
  workspacePath: string,
): Promise<void> => {
  const security = assessCommandSecurity(command);
  if (security.level === 'blocked') {
    throw new Error(security.reasons[0] || 'rollback command blocked by security policy');
  }

  await new Promise<void>((resolve, reject) => {
    exec(
      command,
      {
        cwd: workspacePath,
        timeout: DEFAULT_ROLLBACK_TIMEOUT_MS,
        maxBuffer: DEFAULT_ROLLBACK_MAX_BUFFER,
        env: { ...process.env },
        windowsHide: true,
      },
      (error: ExecException | null) => {
        if (error) {
          reject(new Error(error.killed ? 'rollback command timed out' : error.message));
          return;
        }

        resolve();
      },
    );
  });
};

const rollbackChangeSetFiles = async (
  changeSet: AgentChatChangeSet,
  workspacePath: string,
): Promise<string[]> => {
  const changedFiles: string[] = [];

  for (const file of changeSet.files) {
    const resolvedPath = resolveWorkspacePath(workspacePath, file.path);
    if (file.changeType === 'create' && file.beforeText === null) {
      await fs.rm(resolvedPath, { force: true });
      changedFiles.push(file.path);
      continue;
    }

    if (file.beforeText === null) {
      continue;
    }

    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, file.beforeText, 'utf8');
    changedFiles.push(file.path);
  }

  return changedFiles;
};

export class AgentExecutionJournalService {
  private readonly recordsByThreadId = new Map<string, AgentExecutionJournalRecordInternal[]>();

  recordExecution(input: RecordExecutionInput): AgentChatToolExecutionRecord {
    const rollbackCommand = normalizeText(input.rollbackCommand) || null;
    const record: AgentExecutionJournalRecordInternal = {
      id: randomUUID(),
      threadId: input.threadId,
      turnId: input.turnId,
      workspacePath: input.workspacePath,
      toolName: input.toolName,
      params: { ...input.params },
      success: input.success,
      resultText: input.resultText,
      changedFiles: [...input.changedFiles],
      changeSet: cloneChangeSet(input.changeSet),
      rollbackCommand,
      rollbackStatus: input.changeSet || rollbackCommand ? 'available' : 'unavailable',
      rollbackError: null,
      createdAt: input.startedAt,
      completedAt: input.completedAt,
      durationMs: Math.max(0, input.completedAt - input.startedAt),
    };

    const records = this.recordsByThreadId.get(input.threadId) ?? [];
    records.push(record);
    this.recordsByThreadId.set(input.threadId, records);
    return cloneRecord(record);
  }

  listExecutions(input: AgentChatListToolExecutionsInput): AgentChatToolExecutionRecord[] {
    const threadId = normalizeText(input.threadId);
    if (!threadId) {
      return [];
    }

    const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) && input.limit > 0
      ? Math.floor(input.limit)
      : 100;
    const turnId = normalizeText(input.turnId);
    const records = this.recordsByThreadId.get(threadId) ?? [];

    return records
      .filter(record => !turnId || record.turnId === turnId)
      .slice()
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, limit)
      .map(record => cloneRecord(record));
  }

  async rollbackExecution(
    input: AgentChatRollbackToolExecutionInput,
  ): Promise<AgentChatRollbackToolExecutionResult> {
    const threadId = normalizeText(input.threadId);
    const executionId = normalizeText(input.executionId);
    const records = this.recordsByThreadId.get(threadId) ?? [];
    const record = records.find(item => item.id === executionId) ?? null;

    if (!record) {
      return {
        record: null,
        changedFiles: [],
      };
    }

    try {
      const changedFiles = record.changeSet
        ? await rollbackChangeSetFiles(record.changeSet, record.workspacePath)
        : [];

      if (record.rollbackCommand) {
        await executeRollbackCommand(record.rollbackCommand, record.workspacePath);
      }

      record.rollbackStatus = 'rolled_back';
      record.rollbackError = null;
      return {
        record: cloneRecord(record),
        changedFiles,
      };
    } catch (error) {
      record.rollbackStatus = 'rollback_failed';
      record.rollbackError = error instanceof Error ? error.message : String(error);
      return {
        record: cloneRecord(record),
        changedFiles: [],
      };
    }
  }
}

export const agentExecutionJournalService = new AgentExecutionJournalService();
