/**
 * Renderer-side service for the first-phase agent chat IPC bridge.
 */

import { EventEmitter } from '@note-studio/shared';
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

type AgentChatServiceEvents = Record<'event', (event: AgentChatEvent) => void>;

type Unsubscribe = () => void;

type AgentChatResponse<T> = Promise<{
  success?: boolean;
  data?: T;
} | null | undefined>;

type AgentChatApi = {
  startThread: (input?: AgentChatStartThreadInput) => AgentChatResponse<AgentChatThreadSnapshot>;
  listThreads: (input?: AgentChatListThreadsInput) => AgentChatResponse<AgentChatThreadSummary[]>;
  getThread: (input: AgentChatGetThreadInput) => AgentChatResponse<AgentChatThreadSnapshot | null>;
  syncLegacySession: (input: AgentChatSyncLegacySessionInput) => AgentChatResponse<AgentChatThreadSnapshot>;
  startTurn: (input: AgentChatStartTurnInput) => AgentChatResponse<AgentChatTurnSummary>;
  updateTurn: (input: AgentChatUpdateTurnInput) => AgentChatResponse<AgentChatTurnSummary | null>;
  appendTurnItems: (input: AgentChatAppendTurnItemsInput) => AgentChatResponse<AgentChatTurnItem[]>;
  runTurn: (input: AgentChatRunTurnInput) => AgentChatResponse<AgentChatRunTurnResult>;
  interruptTurn: (input: AgentChatInterruptTurnInput) => AgentChatResponse<AgentChatTurnSummary | null>;
  resumeTurn: (input: AgentChatResumeTurnInput) => AgentChatResponse<AgentChatTurnSummary | null>;
  createApprovalRequest: (input: AgentChatCreateApprovalRequestInput) => AgentChatResponse<AgentChatApprovalRequest>;
  createUserInputRequest: (input: AgentChatCreateUserInputRequestInput) => AgentChatResponse<AgentChatUserInputRequest>;
  respondToRequest: (input: AgentChatRespondToRequestInput) => AgentChatResponse<AgentChatServerRequest | null>;
  onEvent: (callback: (event: AgentChatEvent) => void) => Unsubscribe;
};

export class AgentChatService {
  private readonly eventEmitter = new EventEmitter<AgentChatServiceEvents>();
  private readonly threadIdsByExternalSessionId = new Map<string, string>();
  private detachEventListener: Unsubscribe | null = null;

  private getAgentChatApi(): AgentChatApi | null {
    const electronApi = window.electronAPI as ({ agentChat?: AgentChatApi } | undefined);
    if (electronApi?.agentChat) {
      return electronApi.agentChat;
    }

    const electron = window.electron as ({ agentChat?: AgentChatApi } | undefined);
    return electron?.agentChat ?? null;
  }

  private ensureEventBridge(): void {
    if (this.detachEventListener) {
      return;
    }

    const onEvent = this.getAgentChatApi()?.onEvent;
    if (typeof onEvent === 'function') {
      this.detachEventListener = onEvent((event: AgentChatEvent) => {
        this.handleRuntimeEvent(event);
      });
      return;
    }

    const ipcRenderer = window.electron?.ipcRenderer;
    if (ipcRenderer) {
      this.detachEventListener = ipcRenderer.on('agent-chat:event', (_event, payload: unknown) => {
        this.handleRuntimeEvent(payload as AgentChatEvent);
      });
    }
  }

  private handleRuntimeEvent(event: AgentChatEvent): void {
    if (event.method === 'thread/started' || event.method === 'thread/updated') {
      const summary = event.params.summary;
      if (summary.externalSessionId) {
        this.threadIdsByExternalSessionId.set(summary.externalSessionId, summary.id);
      }
    }

    this.eventEmitter.emit('event', event);
  }

  private rememberSnapshot(snapshot: AgentChatThreadSnapshot | null | undefined): void {
    const externalSessionId = snapshot?.summary.externalSessionId;
    const threadId = snapshot?.summary.id;
    if (!externalSessionId || !threadId) {
      return;
    }

    this.threadIdsByExternalSessionId.set(externalSessionId, threadId);
  }

  async startThread(input?: AgentChatStartThreadInput): Promise<AgentChatThreadSnapshot | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.startThread(input) : null;
    if (!result?.success) {
      return null;
    }

    this.rememberSnapshot(result.data);
    return result.data ?? null;
  }

  async listThreads(input?: AgentChatListThreadsInput): Promise<AgentChatThreadSummary[]> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.listThreads(input) : null;
    if (!result?.success || !result.data) {
      return [];
    }

    for (const summary of result.data) {
      if (summary.externalSessionId) {
        this.threadIdsByExternalSessionId.set(summary.externalSessionId, summary.id);
      }
    }

    return result.data;
  }

  async getThread(input: AgentChatGetThreadInput): Promise<AgentChatThreadSnapshot | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.getThread(input) : null;
    if (!result?.success) {
      return null;
    }

    this.rememberSnapshot(result.data ?? null);
    return result.data ?? null;
  }

  async syncLegacySession(input: AgentChatSyncLegacySessionInput): Promise<AgentChatThreadSnapshot | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.syncLegacySession(input) : null;
    if (!result?.success) {
      return null;
    }

    this.rememberSnapshot(result.data ?? null);
    return result.data ?? null;
  }

  async startTurn(input: AgentChatStartTurnInput): Promise<AgentChatTurnSummary | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.startTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async updateTurn(input: AgentChatUpdateTurnInput): Promise<AgentChatTurnSummary | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.updateTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async appendTurnItems(input: AgentChatAppendTurnItemsInput): Promise<AgentChatTurnItem[]> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.appendTurnItems(input) : null;
    if (!result?.success || !result.data) {
      return [];
    }

    return result.data;
  }

  async runTurn(input: AgentChatRunTurnInput): Promise<AgentChatRunTurnResult | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.runTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async interruptTurn(input: AgentChatInterruptTurnInput): Promise<AgentChatTurnSummary | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.interruptTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async resumeTurn(input: AgentChatResumeTurnInput): Promise<AgentChatTurnSummary | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.resumeTurn(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async createApprovalRequest(input: AgentChatCreateApprovalRequestInput): Promise<AgentChatApprovalRequest | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.createApprovalRequest(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async createUserInputRequest(input: AgentChatCreateUserInputRequestInput): Promise<AgentChatUserInputRequest | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.createUserInputRequest(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  async respondToRequest(input: AgentChatRespondToRequestInput): Promise<AgentChatServerRequest | null> {
    this.ensureEventBridge();
    const api = this.getAgentChatApi();
    const result = api ? await api.respondToRequest(input) : null;
    if (!result?.success) {
      return null;
    }

    return result.data ?? null;
  }

  getThreadIdByExternalSessionId(externalSessionId: string): string | null {
    const normalized = externalSessionId.trim();
    if (!normalized) {
      return null;
    }

    return this.threadIdsByExternalSessionId.get(normalized) ?? null;
  }

  onEvent(listener: (event: AgentChatEvent) => void): Unsubscribe {
    this.ensureEventBridge();
    this.eventEmitter.on('event', listener);
    return () => {
      this.eventEmitter.off('event', listener);
    };
  }
}

export const agentChatService = new AgentChatService();
