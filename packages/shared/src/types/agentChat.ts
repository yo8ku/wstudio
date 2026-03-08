/**
 * Shared contracts for the agent chat runtime, IPC bridge, and renderer state.
 */

export type AgentChatThreadSource = 'native' | 'legacy';

export type AgentChatItemKind =
  | 'message'
  | 'reasoning'
  | 'tool'
  | 'diff'
  | 'system';

export type AgentChatItemRole = 'user' | 'assistant' | 'system';

export interface AgentChatConversationItem {
  id: string;
  threadId: string;
  kind: AgentChatItemKind;
  role: AgentChatItemRole;
  text: string;
  createdAt: number;
  modelId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentChatConversationItemInput {
  id: string;
  kind: AgentChatItemKind;
  role: AgentChatItemRole;
  text: string;
  createdAt: number;
  modelId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AgentChatThreadStatus {
  isProcessing: boolean;
  activeTurnId: string | null;
  latestTurnId: string | null;
  latestTurnStatus: AgentChatTurnStatus | null;
  source: AgentChatThreadSource;
  lastError: string | null;
}

export interface AgentChatThreadSummary {
  id: string;
  title: string;
  workspacePath: string;
  externalSessionId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
  previewText: string | null;
  itemCount: number;
  status: AgentChatThreadStatus;
}

export interface AgentChatThreadSnapshot {
  summary: AgentChatThreadSummary;
  items: AgentChatConversationItem[];
  turnItems?: AgentChatTurnItem[];
  turns?: AgentChatTurnSummary[];
  pendingRequests?: AgentChatServerRequest[];
}

export type AgentChatTurnItemKind =
  | 'task'
  | 'step'
  | 'thinking'
  | 'content'
  | 'tool_call'
  | 'tool_result'
  | 'diff'
  | 'error';

export type AgentChatTurnItemStatus =
  | 'info'
  | 'running'
  | 'completed'
  | 'failed';

export type AgentChatTurnStreamKind =
  | 'task'
  | 'progress'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'final'
  | 'error';

export interface AgentChatTurnItemMetadata extends Record<string, unknown> {
  streamKind?: AgentChatTurnStreamKind;
  streamId?: string;
  responseKey?: string;
  toolName?: string;
  toolCallId?: string;
  iteration?: number;
  success?: boolean;
  source?: 'main_runtime' | 'legacy_renderer' | 'unknown';
  resumed?: boolean;
  nextIteration?: number;
}

export interface AgentChatTurnItem {
  id: string;
  threadId: string;
  turnId: string;
  kind: AgentChatTurnItemKind;
  title: string | null;
  text: string | null;
  status: AgentChatTurnItemStatus | null;
  createdAt: number;
  metadata?: AgentChatTurnItemMetadata;
}

export interface AgentChatTurnItemInput {
  id?: string;
  kind: AgentChatTurnItemKind;
  title?: string | null;
  text?: string | null;
  status?: AgentChatTurnItemStatus | null;
  createdAt?: number;
  metadata?: AgentChatTurnItemMetadata;
}

export type AgentChatTurnFrameKind =
  | 'task'
  | 'progress'
  | 'reasoning_delta'
  | 'tool_started'
  | 'tool_finished'
  | 'assistant_delta'
  | 'final_answer'
  | 'error';

export interface AgentChatTurnFrameBase {
  id: string;
  threadId: string;
  turnId: string;
  itemId: string;
  kind: AgentChatTurnFrameKind;
  title: string | null;
  text: string | null;
  status: AgentChatTurnItemStatus | null;
  createdAt: number;
  streamKind?: AgentChatTurnStreamKind;
  streamId?: string | null;
  responseKey?: string | null;
  iteration?: number | null;
}

export interface AgentChatTaskFrame extends AgentChatTurnFrameBase {
  kind: 'task';
}

export interface AgentChatProgressFrame extends AgentChatTurnFrameBase {
  kind: 'progress';
  resumed?: boolean;
  nextIteration?: number | null;
}

export interface AgentChatReasoningDeltaFrame extends AgentChatTurnFrameBase {
  kind: 'reasoning_delta';
  text: string;
}

export interface AgentChatToolStartedFrame extends AgentChatTurnFrameBase {
  kind: 'tool_started';
  toolName: string;
  toolCallId?: string | null;
  params: Record<string, unknown>;
}

export interface AgentChatToolFinishedFrame extends AgentChatTurnFrameBase {
  kind: 'tool_finished';
  toolName: string;
  toolCallId?: string | null;
  success: boolean;
  resultText: string;
}

export interface AgentChatAssistantDeltaFrame extends AgentChatTurnFrameBase {
  kind: 'assistant_delta';
  text: string;
}

export interface AgentChatFinalAnswerFrame extends AgentChatTurnFrameBase {
  kind: 'final_answer';
  text: string;
}

export interface AgentChatErrorFrame extends AgentChatTurnFrameBase {
  kind: 'error';
  text: string;
  toolName?: string | null;
  toolCallId?: string | null;
}

export type AgentChatTurnFrame =
  | AgentChatTaskFrame
  | AgentChatProgressFrame
  | AgentChatReasoningDeltaFrame
  | AgentChatToolStartedFrame
  | AgentChatToolFinishedFrame
  | AgentChatAssistantDeltaFrame
  | AgentChatFinalAnswerFrame
  | AgentChatErrorFrame;

export interface AgentChatStartThreadInput {
  title?: string;
  workspacePath?: string;
  externalSessionId?: string | null;
  modelId?: string | null;
  source?: AgentChatThreadSource;
}

export interface AgentChatListThreadsInput {
  workspacePath?: string;
  externalSessionId?: string | null;
  limit?: number;
}

export interface AgentChatGetThreadInput {
  threadId: string;
}

export interface AgentChatSyncLegacySessionInput {
  threadId?: string;
  externalSessionId: string;
  title?: string;
  workspacePath?: string;
  modelId?: string | null;
  items?: AgentChatConversationItemInput[];
}

export type AgentChatTurnStatus =
  | 'running'
  | 'waiting_approval'
  | 'waiting_user_input'
  | 'completed'
  | 'error'
  | 'interrupted';

export interface AgentChatTurnSummary {
  id: string;
  threadId: string;
  title: string;
  externalTaskId: string | null;
  modelId: string | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number;
  completedAt: number | null;
  status: AgentChatTurnStatus;
  source: AgentChatThreadSource;
  lastError: string | null;
}

export interface AgentChatStartTurnInput {
  threadId: string;
  turnId?: string;
  title?: string;
  externalTaskId?: string | null;
  modelId?: string | null;
  source?: AgentChatThreadSource;
  status?: AgentChatTurnStatus;
}

export interface AgentChatUpdateTurnInput {
  threadId: string;
  turnId: string;
  title?: string;
  modelId?: string | null;
  status?: AgentChatTurnStatus;
  lastError?: string | null;
}

export type AgentChatApprovalRequestType =
  | 'file_write'
  | 'command_execute'
  | 'diff_apply'
  | 'custom';

export interface AgentChatApprovalRequest {
  id: string;
  kind: 'approval';
  threadId: string;
  turnId: string;
  requestType: AgentChatApprovalRequestType;
  title: string | null;
  description: string;
  toolName: string | null;
  params?: Record<string, unknown>;
  command?: string | null;
  changedFiles?: string[];
  createdAt: number;
  resolvedAt: number | null;
  status: 'pending' | 'approved' | 'rejected';
  response?: {
    approved: boolean;
    feedback?: string | null;
  } | null;
}

export interface AgentChatUserInputQuestion {
  id: string;
  label: string;
  description?: string | null;
  required?: boolean;
  options?: string[];
}

export interface AgentChatUserInputRequest {
  id: string;
  kind: 'user_input';
  threadId: string;
  turnId: string;
  title: string | null;
  description: string | null;
  questions: AgentChatUserInputQuestion[];
  createdAt: number;
  resolvedAt: number | null;
  status: 'pending' | 'submitted' | 'cancelled';
  response?: {
    answers: Record<string, string>;
    feedback?: string | null;
  } | null;
}

export type AgentChatServerRequest =
  | AgentChatApprovalRequest
  | AgentChatUserInputRequest;

export interface AgentChatCreateApprovalRequestInput {
  threadId: string;
  turnId: string;
  requestId?: string;
  requestType: AgentChatApprovalRequestType;
  title?: string | null;
  description: string;
  toolName?: string | null;
  params?: Record<string, unknown>;
  command?: string | null;
  changedFiles?: string[];
}

export interface AgentChatCreateUserInputRequestInput {
  threadId: string;
  turnId: string;
  requestId?: string;
  title?: string | null;
  description?: string | null;
  questions: AgentChatUserInputQuestion[];
}

export interface AgentChatRespondToRequestInput {
  threadId: string;
  requestId: string;
  approved?: boolean;
  answers?: Record<string, string>;
  feedback?: string | null;
  nextTurnStatus?: AgentChatTurnStatus;
}

export interface AgentChatInterruptTurnInput {
  threadId: string;
  turnId?: string;
  reason?: string | null;
}

export interface AgentChatResumeTurnInput {
  threadId: string;
  turnId: string;
}

export interface AgentChatAppendTurnItemsInput {
  threadId: string;
  turnId: string;
  items: AgentChatTurnItemInput[];
}

export interface AgentChatRunTurnInput {
  threadId: string;
  turnId: string;
  instruction: string;
  workspacePath: string;
  modelId: string;
  currentFile?: string;
  selectedText?: string;
  maxIterations?: number;
}

export interface AgentChatRunTurnResult {
  threadId: string;
  turnId: string;
  accepted: boolean;
}

export interface AgentChatThreadStartedEvent {
  eventId: string;
  emittedAt: number;
  method: 'thread/started';
  params: {
    summary: AgentChatThreadSummary;
  };
}

export interface AgentChatThreadUpdatedEvent {
  eventId: string;
  emittedAt: number;
  method: 'thread/updated';
  params: {
    summary: AgentChatThreadSummary;
  };
}

export interface AgentChatThreadItemsReplacedEvent {
  eventId: string;
  emittedAt: number;
  method: 'thread/items/replaced';
  params: {
    threadId: string;
    itemCount: number;
    previewText: string | null;
  };
}

export interface AgentChatTurnStartedEvent {
  eventId: string;
  emittedAt: number;
  method: 'turn/started';
  params: {
    summary: AgentChatTurnSummary;
  };
}

export interface AgentChatTurnUpdatedEvent {
  eventId: string;
  emittedAt: number;
  method: 'turn/updated';
  params: {
    summary: AgentChatTurnSummary;
  };
}

export interface AgentChatTurnItemsAppendedEvent {
  eventId: string;
  emittedAt: number;
  method: 'turn/items/appended';
  params: {
    threadId: string;
    turnId: string;
    items: AgentChatTurnItem[];
    frames?: AgentChatTurnFrame[];
  };
}

export interface AgentChatRequestQueuedEvent {
  eventId: string;
  emittedAt: number;
  method: 'request/queued';
  params: {
    request: AgentChatServerRequest;
  };
}

export interface AgentChatRequestResolvedEvent {
  eventId: string;
  emittedAt: number;
  method: 'request/resolved';
  params: {
    request: AgentChatServerRequest;
  };
}

export type AgentChatEvent =
  | AgentChatThreadStartedEvent
  | AgentChatThreadUpdatedEvent
  | AgentChatThreadItemsReplacedEvent
  | AgentChatTurnStartedEvent
  | AgentChatTurnUpdatedEvent
  | AgentChatTurnItemsAppendedEvent
  | AgentChatRequestQueuedEvent
  | AgentChatRequestResolvedEvent;
