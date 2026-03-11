/**
 * Renderer-side service for the high-level Agent runtime IPC bridge.
 */

import { EventEmitter } from '@note-studio/shared';
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

type AgentRuntimeServiceEvents = Record<'event', (event: AgentRuntimeEvent) => void>;

type Unsubscribe = () => void;

type AgentRuntimeResponse<T> = Promise<{
  success?: boolean;
  data?: T;
} | null | undefined>;

type AgentRuntimeApi = {
  initialize: (input: AgentRuntimeInitializeInput) => AgentRuntimeResponse<AgentRuntimeInitializeResult>;
  getThread: (input: AgentRuntimeGetThreadInput) => AgentRuntimeResponse<AgentRuntimeGetThreadResult>;
  sendMessage: (input: AgentRuntimeSendMessageInput) => AgentRuntimeResponse<AgentRuntimeSendMessageResult>;
  resetConversation: (input?: AgentRuntimeResetConversationInput) => AgentRuntimeResponse<AgentRuntimeResetConversationResult>;
  respondToRequest: (input: AgentRuntimeRespondToRequestInput) => AgentRuntimeResponse<AgentRuntimeRespondToRequestResult>;
  interruptTurn: (input: AgentRuntimeInterruptTurnInput) => AgentRuntimeResponse<AgentRuntimeInterruptTurnResult>;
  listToolExecutions: (input: AgentRuntimeListToolExecutionsInput) => AgentRuntimeResponse<AgentRuntimeListToolExecutionsResult>;
  rollbackToolExecution: (
    input: AgentRuntimeRollbackToolExecutionInput,
  ) => AgentRuntimeResponse<AgentRuntimeRollbackToolExecutionResult>;
  onEvent: (callback: (event: AgentRuntimeEvent) => void) => Unsubscribe;
};

export class AgentRuntimeService {
  private readonly eventEmitter = new EventEmitter<AgentRuntimeServiceEvents>();
  private detachEventListener: Unsubscribe | null = null;

  private getAgentRuntimeApi(): AgentRuntimeApi | null {
    const electronApi = window.electronAPI as ({ agentRuntime?: AgentRuntimeApi } | undefined);
    if (electronApi?.agentRuntime) {
      return electronApi.agentRuntime;
    }

    const electron = window.electron as ({ agentRuntime?: AgentRuntimeApi } | undefined);
    return electron?.agentRuntime ?? null;
  }

  private ensureEventBridge(): void {
    if (this.detachEventListener) {
      return;
    }

    const onEvent = this.getAgentRuntimeApi()?.onEvent;
    if (typeof onEvent === 'function') {
      this.detachEventListener = onEvent((event: AgentRuntimeEvent) => {
        this.eventEmitter.emit('event', event);
      });
      return;
    }

    const ipcRenderer = window.electron?.ipcRenderer;
    if (ipcRenderer) {
      this.detachEventListener = ipcRenderer.on('agent-runtime:event', (_event, payload: unknown) => {
        this.eventEmitter.emit('event', payload as AgentRuntimeEvent);
      });
    }
  }

  async initialize(input: AgentRuntimeInitializeInput): Promise<AgentRuntimeInitializeResult | null> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.initialize(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async getThread(input: AgentRuntimeGetThreadInput): Promise<AgentRuntimeGetThreadResult> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.getThread(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async sendMessage(input: AgentRuntimeSendMessageInput): Promise<AgentRuntimeSendMessageResult | null> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.sendMessage(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async respondToRequest(
    input: AgentRuntimeRespondToRequestInput,
  ): Promise<AgentRuntimeRespondToRequestResult> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.respondToRequest(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async interruptTurn(
    input: AgentRuntimeInterruptTurnInput,
  ): Promise<AgentRuntimeInterruptTurnResult> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.interruptTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async listToolExecutions(
    input: AgentRuntimeListToolExecutionsInput,
  ): Promise<AgentRuntimeListToolExecutionsResult> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.listToolExecutions(input) : null;
    if (!result?.success) {
      return [];
    }

    return result.data ?? [];
  }

  async rollbackToolExecution(
    input: AgentRuntimeRollbackToolExecutionInput,
  ): Promise<AgentRuntimeRollbackToolExecutionResult | null> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.rollbackToolExecution(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async resetConversation(
    input?: AgentRuntimeResetConversationInput,
  ): Promise<AgentRuntimeResetConversationResult | null> {
    this.ensureEventBridge();
    const api = this.getAgentRuntimeApi();
    const result = api ? await api.resetConversation(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  onEvent(listener: (event: AgentRuntimeEvent) => void): Unsubscribe {
    this.ensureEventBridge();
    this.eventEmitter.on('event', listener);
    return () => {
      this.eventEmitter.off('event', listener);
    };
  }
}

export const agentRuntimeService = new AgentRuntimeService();
