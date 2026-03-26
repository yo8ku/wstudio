/**
 * Manages isolated workspace text search sessions and forwards child-process batches to renderer IPC.
 */

import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { WebContents } from 'electron';
import type { WorkspaceTextSearchRequest } from './WorkspaceTextSearchService';
import { buildWorkspaceNoteSearchTargets } from './WorkspaceSearchNoteTargets';
import type {
  WorkspaceTextSearchProcessChildMessage,
  WorkspaceTextSearchProcessStartMessage,
} from './WorkspaceTextSearchProcessProtocol';

export const WORKSPACE_SEARCH_BATCH_CHANNEL = 'workspace-search:batch';
export const WORKSPACE_SEARCH_COMPLETE_CHANNEL = 'workspace-search:complete';
export const WORKSPACE_SEARCH_ERROR_CHANNEL = 'workspace-search:error';

const DEFAULT_WORKSPACE_SEARCH_STREAM_BATCH_SIZE = 200;
const WORKSPACE_SEARCH_NORMAL_EXIT_SETTLE_DELAY = 80;
const SEARCH_PROCESS_EXIT_MESSAGE = '\u641c\u7d22\u8fdb\u7a0b\u5df2\u9000\u51fa';

interface WorkspaceSearchSession {
  sessionId: string;
  ownerWebContents: WebContents;
  child: ChildProcess;
  ownerDestroyedListener: () => void;
}

export interface WorkspaceSearchSessionStartResult {
  sessionId: string;
}

export class WorkspaceTextSearchSessionService {
  private readonly sessions = new Map<string, WorkspaceSearchSession>();

  async startSession(
    ownerWebContents: WebContents,
    workspaceDirectory: string,
    request: WorkspaceTextSearchRequest,
  ): Promise<WorkspaceSearchSessionStartResult> {
    this.cancelSessionsForOwner(ownerWebContents.id);

    const additionalTargets = await buildWorkspaceNoteSearchTargets(workspaceDirectory, request);
    const sessionId = randomUUID();
    const childProcessPath = path.resolve(__dirname, 'workspaceTextSearchProcess.js');
    const child = fork(childProcessPath, [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const ownerDestroyedListener = (): void => {
      this.cancelSession(sessionId);
    };
    const session: WorkspaceSearchSession = {
      sessionId,
      ownerWebContents,
      child,
      ownerDestroyedListener,
    };

    this.sessions.set(sessionId, session);
    ownerWebContents.once('destroyed', ownerDestroyedListener);

    child.on('message', (message: WorkspaceTextSearchProcessChildMessage) => {
      this.handleChildMessage(sessionId, message);
    });
    child.once('error', (error) => {
      this.handleSessionError(sessionId, error.message);
    });
    child.once('exit', (code, signal) => {
      this.handleUnexpectedExit(sessionId, code, signal);
    });

    const startMessage: WorkspaceTextSearchProcessStartMessage = {
      type: 'start',
      workspaceDirectory,
      request,
      additionalTargets,
      batchSize: DEFAULT_WORKSPACE_SEARCH_STREAM_BATCH_SIZE,
    };

    setImmediate(() => {
      if (!this.sessions.has(sessionId) || !child.connected) {
        return;
      }

      child.send(startMessage);
    });

    return { sessionId };
  }

  cancelSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    this.disposeSession(sessionId, true);
    return true;
  }

  private cancelSessionsForOwner(ownerWebContentsId: number): void {
    for (const session of this.sessions.values()) {
      if (session.ownerWebContents.id === ownerWebContentsId) {
        this.disposeSession(session.sessionId, true);
      }
    }
  }

  private handleChildMessage(
    sessionId: string,
    message: WorkspaceTextSearchProcessChildMessage,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerWebContents.isDestroyed()) {
      this.disposeSession(sessionId, true);
      return;
    }

    switch (message.type) {
      case 'batch':
        session.ownerWebContents.send(WORKSPACE_SEARCH_BATCH_CHANNEL, {
          sessionId,
          ...message.batch,
        });
        return;
      case 'complete':
        session.ownerWebContents.send(WORKSPACE_SEARCH_COMPLETE_CHANNEL, {
          sessionId,
          groupCounts: message.groupCounts,
          limitHit: message.limitHit,
          totalCount: message.totalCount,
          totalFiles: message.totalFiles,
        });
        this.disposeSession(sessionId, false);
        return;
      case 'error':
        this.handleSessionError(sessionId, message.error);
        return;
      default:
        return;
    }
  }

  private handleSessionError(sessionId: string, errorMessage: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (!session.ownerWebContents.isDestroyed()) {
      session.ownerWebContents.send(WORKSPACE_SEARCH_ERROR_CHANNEL, {
        sessionId,
        error: errorMessage,
      });
    }

    this.disposeSession(sessionId, true);
  }

  private handleUnexpectedExit(
    sessionId: string,
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    if (!signal && code === 0) {
      setTimeout(() => {
        const session = this.sessions.get(sessionId);
        if (!session) {
          return;
        }

        this.handleSessionError(sessionId, `${SEARCH_PROCESS_EXIT_MESSAGE} (code 0)`);
      }, WORKSPACE_SEARCH_NORMAL_EXIT_SETTLE_DELAY);
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const exitDetails = signal
      ? `signal ${signal}`
      : `code ${code ?? 'unknown'}`;
    this.handleSessionError(sessionId, `${SEARCH_PROCESS_EXIT_MESSAGE} (${exitDetails})`);
  }

  private disposeSession(sessionId: string, shouldKillChild: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    session.ownerWebContents.removeListener('destroyed', session.ownerDestroyedListener);

    if (shouldKillChild && !session.child.killed) {
      session.child.kill();
    }
  }
}
