/**
 * High-level IPC contracts for initializing an agent session, sending messages,
 * resetting the conversation, and subscribing to runtime events.
 */

import type {
  AgentChatEvent,
  AgentChatGetThreadInput,
  AgentChatInterruptTurnInput,
  AgentChatListToolExecutionsInput,
  AgentChatRespondToRequestInput,
  AgentChatRollbackToolExecutionInput,
  AgentChatRollbackToolExecutionResult,
  AgentChatServerRequest,
  AgentChatThreadSnapshot,
  AgentChatThreadSource,
  AgentChatToolExecutionRecord,
  AgentChatTurnSummary,
} from './agentChat';

export interface AgentRuntimeInitializeInput {
  workspacePath: string;
  threadId?: string;
  title?: string;
  modelId?: string | null;
  externalSessionId?: string | null;
  source?: AgentChatThreadSource;
}

export interface AgentRuntimeInitializeResult {
  thread: AgentChatThreadSnapshot;
  reusedExistingThread: boolean;
}

export interface AgentRuntimeSendMessageInput {
  workspacePath: string;
  message: string;
  modelId: string;
  threadId?: string;
  title?: string;
  externalSessionId?: string | null;
  source?: AgentChatThreadSource;
  currentFile?: string;
  selectedText?: string;
  maxIterations?: number;
  maxModelCalls?: number;
}

export interface AgentRuntimeSendMessageResult {
  threadId: string;
  turnId: string;
  accepted: boolean;
  thread: AgentChatThreadSnapshot | null;
  turn: AgentChatTurnSummary;
}

export interface AgentRuntimeResetConversationInput {
  threadId?: string;
  workspacePath?: string;
  title?: string;
  modelId?: string | null;
  externalSessionId?: string | null;
  source?: AgentChatThreadSource;
  interruptActiveTurn?: boolean;
}

export interface AgentRuntimeResetConversationResult {
  previousThreadId: string | null;
  thread: AgentChatThreadSnapshot;
}

export type AgentRuntimeGetThreadInput = AgentChatGetThreadInput;
export type AgentRuntimeGetThreadResult = AgentChatThreadSnapshot | null;

export type AgentRuntimeRespondToRequestInput = AgentChatRespondToRequestInput;
export type AgentRuntimeRespondToRequestResult = AgentChatServerRequest | null;

export type AgentRuntimeInterruptTurnInput = AgentChatInterruptTurnInput;
export type AgentRuntimeInterruptTurnResult = AgentChatTurnSummary | null;

export type AgentRuntimeListToolExecutionsInput = AgentChatListToolExecutionsInput;
export type AgentRuntimeListToolExecutionsResult = AgentChatToolExecutionRecord[];

export type AgentRuntimeRollbackToolExecutionInput = AgentChatRollbackToolExecutionInput;
export type AgentRuntimeRollbackToolExecutionResult = AgentChatRollbackToolExecutionResult;

export type AgentRuntimeEvent = AgentChatEvent;
