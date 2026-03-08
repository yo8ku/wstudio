/**
 * Agent chat preload API type augmentation.
 */

import type {
  AgentChatAppendTurnItemsInput,
  AgentChatApprovalRequest,
  AgentChatCreateApprovalRequestInput,
  AgentChatCreateUserInputRequestInput,
  AgentChatEvent,
  AgentChatGetThreadInput,
  AgentChatInterruptTurnInput,
  AgentChatListThreadsInput,
  AgentChatRunTurnInput,
  AgentChatRunTurnResult,
  AgentChatRespondToRequestInput,
  AgentChatResumeTurnInput,
  AgentChatServerRequest,
  AgentChatStartThreadInput,
  AgentChatStartTurnInput,
  AgentChatSyncLegacySessionInput,
  AgentChatThreadSnapshot,
  AgentChatThreadSummary,
  AgentChatTurnItem,
  AgentChatTurnSummary,
  AgentChatUpdateTurnInput,
  AgentChatUserInputRequest,
} from '@note-studio/shared';

declare global {
  interface ElectronAPI {
    agentChat?: {
      startThread: (input?: AgentChatStartThreadInput) => Promise<APIResponse<AgentChatThreadSnapshot>>;
      listThreads: (input?: AgentChatListThreadsInput) => Promise<APIResponse<AgentChatThreadSummary[]>>;
      getThread: (input: AgentChatGetThreadInput) => Promise<APIResponse<AgentChatThreadSnapshot | null>>;
      syncLegacySession: (input: AgentChatSyncLegacySessionInput) => Promise<APIResponse<AgentChatThreadSnapshot>>;
      startTurn: (input: AgentChatStartTurnInput) => Promise<APIResponse<AgentChatTurnSummary>>;
      updateTurn: (input: AgentChatUpdateTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      appendTurnItems: (input: AgentChatAppendTurnItemsInput) => Promise<APIResponse<AgentChatTurnItem[]>>;
      runTurn: (input: AgentChatRunTurnInput) => Promise<APIResponse<AgentChatRunTurnResult>>;
      interruptTurn: (input: AgentChatInterruptTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      resumeTurn: (input: AgentChatResumeTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      createApprovalRequest: (input: AgentChatCreateApprovalRequestInput) => Promise<APIResponse<AgentChatApprovalRequest>>;
      createUserInputRequest: (input: AgentChatCreateUserInputRequestInput) => Promise<APIResponse<AgentChatUserInputRequest>>;
      respondToRequest: (input: AgentChatRespondToRequestInput) => Promise<APIResponse<AgentChatServerRequest | null>>;
      onEvent: (callback: (event: AgentChatEvent) => void) => () => void;
    };
  }

  interface ElectronIPC {
    agentChat?: {
      startThread: (input?: AgentChatStartThreadInput) => Promise<APIResponse<AgentChatThreadSnapshot>>;
      listThreads: (input?: AgentChatListThreadsInput) => Promise<APIResponse<AgentChatThreadSummary[]>>;
      getThread: (input: AgentChatGetThreadInput) => Promise<APIResponse<AgentChatThreadSnapshot | null>>;
      syncLegacySession: (input: AgentChatSyncLegacySessionInput) => Promise<APIResponse<AgentChatThreadSnapshot>>;
      startTurn: (input: AgentChatStartTurnInput) => Promise<APIResponse<AgentChatTurnSummary>>;
      updateTurn: (input: AgentChatUpdateTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      appendTurnItems: (input: AgentChatAppendTurnItemsInput) => Promise<APIResponse<AgentChatTurnItem[]>>;
      runTurn: (input: AgentChatRunTurnInput) => Promise<APIResponse<AgentChatRunTurnResult>>;
      interruptTurn: (input: AgentChatInterruptTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      resumeTurn: (input: AgentChatResumeTurnInput) => Promise<APIResponse<AgentChatTurnSummary | null>>;
      createApprovalRequest: (input: AgentChatCreateApprovalRequestInput) => Promise<APIResponse<AgentChatApprovalRequest>>;
      createUserInputRequest: (input: AgentChatCreateUserInputRequestInput) => Promise<APIResponse<AgentChatUserInputRequest>>;
      respondToRequest: (input: AgentChatRespondToRequestInput) => Promise<APIResponse<AgentChatServerRequest | null>>;
      onEvent: (callback: (event: AgentChatEvent) => void) => () => void;
    };
  }
}

export {};
