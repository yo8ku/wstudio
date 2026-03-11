/**
 * Agent runtime preload API type augmentation.
 */

import type {
  AgentRuntimeEvent,
  AgentRuntimeGetThreadInput,
  AgentRuntimeGetThreadResult,
  AgentRuntimeInitializeInput,
  AgentRuntimeInitializeResult,
  AgentRuntimeInterruptTurnInput,
  AgentRuntimeInterruptTurnResult,
  AgentRuntimeListToolExecutionsInput,
  AgentRuntimeListToolExecutionsResult,
  AgentRuntimeResetConversationInput,
  AgentRuntimeResetConversationResult,
  AgentRuntimeRespondToRequestInput,
  AgentRuntimeRespondToRequestResult,
  AgentRuntimeRollbackToolExecutionInput,
  AgentRuntimeRollbackToolExecutionResult,
  AgentRuntimeSendMessageInput,
  AgentRuntimeSendMessageResult,
} from '@note-studio/shared';

declare global {
  interface ElectronAPI {
    agentRuntime?: {
      initialize: (input: AgentRuntimeInitializeInput) => Promise<APIResponse<AgentRuntimeInitializeResult>>;
      getThread: (input: AgentRuntimeGetThreadInput) => Promise<APIResponse<AgentRuntimeGetThreadResult>>;
      sendMessage: (input: AgentRuntimeSendMessageInput) => Promise<APIResponse<AgentRuntimeSendMessageResult>>;
      resetConversation: (input?: AgentRuntimeResetConversationInput) => Promise<APIResponse<AgentRuntimeResetConversationResult>>;
      respondToRequest: (input: AgentRuntimeRespondToRequestInput) => Promise<APIResponse<AgentRuntimeRespondToRequestResult>>;
      interruptTurn: (input: AgentRuntimeInterruptTurnInput) => Promise<APIResponse<AgentRuntimeInterruptTurnResult>>;
      listToolExecutions: (input: AgentRuntimeListToolExecutionsInput) => Promise<APIResponse<AgentRuntimeListToolExecutionsResult>>;
      rollbackToolExecution: (
        input: AgentRuntimeRollbackToolExecutionInput,
      ) => Promise<APIResponse<AgentRuntimeRollbackToolExecutionResult>>;
      onEvent: (callback: (event: AgentRuntimeEvent) => void) => () => void;
    };
  }

  interface ElectronIPC {
    agentRuntime?: {
      initialize: (input: AgentRuntimeInitializeInput) => Promise<APIResponse<AgentRuntimeInitializeResult>>;
      getThread: (input: AgentRuntimeGetThreadInput) => Promise<APIResponse<AgentRuntimeGetThreadResult>>;
      sendMessage: (input: AgentRuntimeSendMessageInput) => Promise<APIResponse<AgentRuntimeSendMessageResult>>;
      resetConversation: (input?: AgentRuntimeResetConversationInput) => Promise<APIResponse<AgentRuntimeResetConversationResult>>;
      respondToRequest: (input: AgentRuntimeRespondToRequestInput) => Promise<APIResponse<AgentRuntimeRespondToRequestResult>>;
      interruptTurn: (input: AgentRuntimeInterruptTurnInput) => Promise<APIResponse<AgentRuntimeInterruptTurnResult>>;
      listToolExecutions: (input: AgentRuntimeListToolExecutionsInput) => Promise<APIResponse<AgentRuntimeListToolExecutionsResult>>;
      rollbackToolExecution: (
        input: AgentRuntimeRollbackToolExecutionInput,
      ) => Promise<APIResponse<AgentRuntimeRollbackToolExecutionResult>>;
      onEvent: (callback: (event: AgentRuntimeEvent) => void) => () => void;
    };
  }
}

export {};
