/**
 * High-level Agent IPC handlers that expose initialize/send/reset operations
 * and forward runtime events to renderer processes in real time.
 */

import { BrowserWindow, ipcMain } from 'electron';
import type {
  AgentChatGetThreadInput,
  AgentChatInterruptTurnInput,
  AgentChatListToolExecutionsInput,
  AgentChatRespondToRequestInput,
  AgentChatRollbackToolExecutionInput,
  AgentChatThreadSnapshot,
  AgentRuntimeEvent,
  AgentRuntimeInitializeInput,
  AgentRuntimeInitializeResult,
  AgentRuntimeResetConversationInput,
  AgentRuntimeResetConversationResult,
  AgentRuntimeSendMessageInput,
  AgentRuntimeSendMessageResult,
} from '@note-studio/shared';
import { agentChatRuntime } from '../services/agent-chat/AgentChatRuntime';
import { agentExecutionJournalService } from '../services/agent-chat/AgentExecutionJournalService';
import { mainAgentRuntime } from '../services/agent-chat/MainAgentRuntime';

let detachRuntimeListener: (() => void) | null = null;

const AGENT_RUNTIME_EVENT_CHANNEL = 'agent-runtime:event';
const DEFAULT_THREAD_TITLE = 'Agent 会话';
const DEFAULT_TURN_TITLE = '用户消息';

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const truncateText = (value: string, maxLength: number): string =>
  value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;

const buildTitle = (preferred: string, fallback: string, defaultTitle: string): string => {
  const resolved = normalizeText(preferred) || normalizeText(fallback);
  if (!resolved) {
    return defaultTitle;
  }

  return truncateText(resolved.replace(/\s+/g, ' '), 80);
};

const broadcastAgentRuntimeEvent = (event: AgentRuntimeEvent): void => {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    window.webContents.send(AGENT_RUNTIME_EVENT_CHANNEL, event);
  }
};

const resolveExistingThread = (input: {
  threadId?: string;
  externalSessionId?: string | null;
  workspacePath?: string;
}): AgentChatThreadSnapshot | null => {
  const threadId = normalizeText(input.threadId);
  if (threadId) {
    return agentChatRuntime.getThreadSnapshot({ threadId });
  }

  const externalSessionId = normalizeText(input.externalSessionId ?? undefined);
  if (!externalSessionId) {
    return null;
  }

  const threads = agentChatRuntime.listThreads({
    externalSessionId,
    workspacePath: normalizeText(input.workspacePath),
    limit: 1,
  });
  const latest = threads[0];
  if (!latest) {
    return null;
  }

  return agentChatRuntime.getThreadSnapshot({ threadId: latest.id });
};

const initializeAgentRuntime = (
  input?: AgentRuntimeInitializeInput,
): AgentRuntimeInitializeResult => {
  const workspacePath = normalizeText(input?.workspacePath);
  if (!workspacePath) {
    throw new Error('workspacePath is required');
  }

  const existingThread = resolveExistingThread(input ?? {});
  if (existingThread) {
    return {
      thread: existingThread,
      reusedExistingThread: true,
    };
  }

  return {
    thread: agentChatRuntime.startThread({
      title: buildTitle(input?.title ?? '', '', DEFAULT_THREAD_TITLE),
      workspacePath,
      modelId: normalizeText(input?.modelId ?? undefined) || null,
      externalSessionId: normalizeText(input?.externalSessionId ?? undefined) || null,
      source: 'native',
    }),
    reusedExistingThread: false,
  };
};

const resetAgentConversation = (
  input?: AgentRuntimeResetConversationInput,
): AgentRuntimeResetConversationResult => {
  const previousThread = resolveExistingThread(input ?? {});
  if (
    previousThread
    && input?.interruptActiveTurn !== false
    && previousThread.summary.status.isProcessing
    && previousThread.summary.status.activeTurnId
  ) {
    agentChatRuntime.interruptTurn({
      threadId: previousThread.summary.id,
      turnId: previousThread.summary.status.activeTurnId,
      reason: 'conversation reset',
    });
  }

  const workspacePath = normalizeText(input?.workspacePath)
    || previousThread?.summary.workspacePath
    || '';
  if (!workspacePath) {
    throw new Error('workspacePath is required to reset the conversation');
  }

  const title = buildTitle(
    input?.title ?? '',
    previousThread?.summary.title ?? '',
    DEFAULT_THREAD_TITLE,
  );
  const modelId = normalizeText(input?.modelId ?? undefined)
    || previousThread?.summary.modelId
    || null;
  const externalSessionId = normalizeText(input?.externalSessionId ?? undefined)
    || previousThread?.summary.externalSessionId
    || null;

  return {
    previousThreadId: previousThread?.summary.id ?? null,
    thread: agentChatRuntime.startThread({
      title,
      workspacePath,
      modelId,
      externalSessionId,
      source: 'native',
    }),
  };
};

const sendMessageToAgent = async (
  input: AgentRuntimeSendMessageInput,
): Promise<AgentRuntimeSendMessageResult> => {
  const workspacePath = normalizeText(input.workspacePath);
  const message = normalizeText(input.message);
  const modelId = normalizeText(input.modelId);

  if (!workspacePath) {
    throw new Error('workspacePath is required');
  }
  if (!message) {
    throw new Error('message is required');
  }
  if (!modelId) {
    throw new Error('modelId is required');
  }

  const resolvedThread = resolveExistingThread(input);
  const thread = resolvedThread ?? agentChatRuntime.startThread({
    title: buildTitle(input.title ?? '', message, DEFAULT_THREAD_TITLE),
    workspacePath,
    modelId,
    externalSessionId: normalizeText(input.externalSessionId ?? undefined) || null,
    source: 'native',
  });

  if (thread.summary.status.isProcessing) {
    throw new Error(`thread is already processing: ${thread.summary.id}`);
  }

  const turn = agentChatRuntime.startTurn({
    threadId: thread.summary.id,
    title: buildTitle(input.title ?? '', message, DEFAULT_TURN_TITLE),
    modelId,
    source: 'native',
  });

  const runResult = await mainAgentRuntime.runTurn({
    threadId: thread.summary.id,
    turnId: turn.id,
    instruction: message,
    workspacePath: thread.summary.workspacePath || workspacePath,
    modelId,
    currentFile: normalizeText(input.currentFile ?? undefined) || undefined,
    selectedText: normalizeText(input.selectedText ?? undefined) || undefined,
    maxIterations: input.maxIterations,
    maxModelCalls: input.maxModelCalls,
  });

  return {
    threadId: thread.summary.id,
    turnId: turn.id,
    accepted: runResult.accepted,
    thread: agentChatRuntime.getThreadSnapshot({ threadId: thread.summary.id }),
    turn,
  };
};

const getAgentRuntimeThread = (
  input: AgentChatGetThreadInput,
): AgentChatThreadSnapshot | null => agentChatRuntime.getThreadSnapshot(input);

export const registerAgentRuntimeHandlers = (): void => {
  const handlersToRemove = [
    'agent-runtime:initialize',
    'agent-runtime:thread:get',
    'agent-runtime:send-message',
    'agent-runtime:reset-conversation',
    'agent-runtime:request:respond',
    'agent-runtime:turn:interrupt',
    'agent-runtime:tool-execution:list',
    'agent-runtime:tool-execution:rollback',
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch {
      // Ignore missing handlers.
    }
  }

  if (!detachRuntimeListener) {
    detachRuntimeListener = agentChatRuntime.onEvent((event) => {
      broadcastAgentRuntimeEvent(event);
    });
  }

  ipcMain.handle(
    'agent-runtime:initialize',
    async (_event, input?: AgentRuntimeInitializeInput) => {
      try {
        return {
          success: true,
          data: initializeAgentRuntime(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:thread:get',
    async (_event, input: AgentChatGetThreadInput) => {
      try {
        return {
          success: true,
          data: getAgentRuntimeThread(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:send-message',
    async (_event, input: AgentRuntimeSendMessageInput) => {
      try {
        return {
          success: true,
          data: await sendMessageToAgent(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:reset-conversation',
    async (_event, input?: AgentRuntimeResetConversationInput) => {
      try {
        return {
          success: true,
          data: resetAgentConversation(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:request:respond',
    async (_event, input: AgentChatRespondToRequestInput) => {
      try {
        return {
          success: true,
          data: agentChatRuntime.respondToRequest(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:turn:interrupt',
    async (_event, input: AgentChatInterruptTurnInput) => {
      try {
        return {
          success: true,
          data: agentChatRuntime.interruptTurn(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:tool-execution:list',
    async (_event, input: AgentChatListToolExecutionsInput) => {
      try {
        return {
          success: true,
          data: agentExecutionJournalService.listExecutions(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle(
    'agent-runtime:tool-execution:rollback',
    async (_event, input: AgentChatRollbackToolExecutionInput) => {
      try {
        return {
          success: true,
          data: await agentExecutionJournalService.rollbackExecution(input),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  console.log('[AgentRuntime] handlers registered');
};
