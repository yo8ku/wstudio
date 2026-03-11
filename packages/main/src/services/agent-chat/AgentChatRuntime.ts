/**
 * In-memory runtime for the first phase of main-owned agent chat threads, turns, and request queues.
 */

import { randomUUID } from 'crypto';
import { buildAgentChatTurnFrames, EventEmitter } from '@note-studio/shared';
import type {
  AgentChatApprovalRequest,
  AgentChatAppendTurnItemsInput,
  AgentChatConversationItem,
  AgentChatConversationItemInput,
  AgentChatCreateApprovalRequestInput,
  AgentChatChangeSet,
  AgentChatCreateUserInputRequestInput,
  AgentChatEvent,
  AgentChatGetThreadInput,
  AgentChatInterruptTurnInput,
  AgentChatRespondToRequestInput,
  AgentChatListThreadsInput,
  AgentChatResumeTurnInput,
  AgentChatServerRequest,
  AgentChatStartThreadInput,
  AgentChatStartTurnInput,
  AgentChatThreadSnapshot,
  AgentChatThreadSource,
  AgentChatThreadSummary,
  AgentChatTurnItem,
  AgentChatTurnItemInput,
  AgentChatTurnItemStatus,
  AgentChatTurnStatus,
  AgentChatTurnSummary,
  AgentChatUpdateTurnInput,
  AgentChatUserInputQuestion,
  AgentChatUserInputRequest,
} from '@note-studio/shared';

type AgentChatRuntimeEvents = Record<'event', (event: AgentChatEvent) => void>;

interface AgentChatThreadRecord {
  summary: AgentChatThreadSummary;
  items: AgentChatConversationItem[];
  turnItems: AgentChatTurnItem[];
  turns: Map<string, AgentChatTurnSummary>;
  requests: Map<string, AgentChatServerRequest>;
}

const DEFAULT_THREAD_TITLE = '新对话';
const DEFAULT_TURN_TITLE = 'Agent 执行';
const PREVIEW_MAX_LENGTH = 120;
const ACTIVE_TURN_STATUSES = new Set<AgentChatTurnStatus>([
  'running',
  'waiting_approval',
  'waiting_user_input',
]);

function sanitizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeStringList(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(value => sanitizeText(value))
    .filter(Boolean);
}

function cloneStringRecord(record: Record<string, string> | null | undefined): Record<string, string> | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return undefined;
  }

  const cloned: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = sanitizeText(key);
    if (!normalizedKey || typeof value !== 'string') {
      continue;
    }
    cloned[normalizedKey] = value;
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function cloneDecisionRecord(
  record: Record<string, 'approved' | 'rejected'> | null | undefined,
): Record<string, 'approved' | 'rejected'> | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return undefined;
  }

  const cloned: Record<string, 'approved' | 'rejected'> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = sanitizeText(key);
    if (!normalizedKey || (value !== 'approved' && value !== 'rejected')) {
      continue;
    }
    cloned[normalizedKey] = value;
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function sanitizeBooleanRecord(
  record: Record<string, boolean> | null | undefined,
): Record<string, 'approved' | 'rejected'> | undefined {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return undefined;
  }

  const cloned: Record<string, 'approved' | 'rejected'> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalizedKey = sanitizeText(key);
    if (!normalizedKey || typeof value !== 'boolean') {
      continue;
    }
    cloned[normalizedKey] = value ? 'approved' : 'rejected';
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function cloneChangeSet(changeSet: AgentChatChangeSet | null | undefined): AgentChatChangeSet | null | undefined {
  if (!changeSet) {
    return changeSet;
  }

  return {
    ...changeSet,
    files: changeSet.files.map(file => ({ ...file })),
  };
}

function normalizeTurnStatus(value: AgentChatTurnStatus | null | undefined): AgentChatTurnStatus {
  switch (value) {
    case 'waiting_approval':
    case 'waiting_user_input':
    case 'completed':
    case 'error':
    case 'interrupted':
      return value;
    case 'running':
    default:
      return 'running';
  }
}

function normalizeTurnItemStatus(
  value: AgentChatTurnItemStatus | null | undefined
): AgentChatTurnItemStatus | null {
  switch (value) {
    case 'info':
    case 'running':
    case 'completed':
    case 'failed':
      return value;
    default:
      return null;
  }
}

function isActiveTurnStatus(status: AgentChatTurnStatus): boolean {
  return ACTIVE_TURN_STATUSES.has(status);
}

function createPreviewText(items: AgentChatConversationItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const text = sanitizeText(items[index].text);
    if (!text) {
      continue;
    }

    if (text.length <= PREVIEW_MAX_LENGTH) {
      return text;
    }

    return `${text.slice(0, PREVIEW_MAX_LENGTH)}...`;
  }

  return null;
}

function cloneSummary(summary: AgentChatThreadSummary): AgentChatThreadSummary {
  return {
    ...summary,
    status: { ...summary.status },
  };
}

function cloneItem(item: AgentChatConversationItem): AgentChatConversationItem {
  return {
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined,
  };
}

function cloneTurnItem(item: AgentChatTurnItem): AgentChatTurnItem {
  return {
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined,
  };
}

function cloneTurnSummary(summary: AgentChatTurnSummary): AgentChatTurnSummary {
  return { ...summary };
}

function cloneServerRequest(request: AgentChatServerRequest): AgentChatServerRequest {
  if (request.kind === 'approval') {
    return {
      ...request,
      params: request.params ? { ...request.params } : undefined,
      changedFiles: request.changedFiles ? [...request.changedFiles] : undefined,
      changeSet: cloneChangeSet(request.changeSet) ?? null,
      response: request.response
        ? {
            ...request.response,
            fileDecisions: cloneDecisionRecord(request.response.fileDecisions),
          }
        : undefined,
    };
  }

  return {
    ...request,
    questions: request.questions.map(question => ({
      ...question,
      options: question.options ? [...question.options] : undefined,
    })),
    response: request.response
      ? {
          ...request.response,
          answers: { ...request.response.answers },
        }
      : undefined,
  };
}

function normalizeUserInputQuestions(
  questions: AgentChatUserInputQuestion[] | null | undefined
): AgentChatUserInputQuestion[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.reduce<AgentChatUserInputQuestion[]>((acc, question, index) => {
      const id = sanitizeText(question.id) || `answer-${index + 1}`;
      const label = sanitizeText(question.label);
      if (!label) {
        return acc;
      }

      acc.push({
        id,
        label,
        description: sanitizeText(question.description ?? undefined) || null,
        required: question.required !== false,
        options: sanitizeStringList(question.options),
      });

      return acc;
    }, []);
}

function createEmptyThreadSnapshot(summary: AgentChatThreadSummary): AgentChatThreadSnapshot {
  return {
    summary: cloneSummary(summary),
    items: [],
    turnItems: [],
    turns: [],
    pendingRequests: [],
  };
}

export class AgentChatRuntime {
  private readonly threads = new Map<string, AgentChatThreadRecord>();
  private readonly threadIdsByExternalSessionId = new Map<string, string>();
  private readonly eventEmitter = new EventEmitter<AgentChatRuntimeEvents>();

  onEvent(listener: (event: AgentChatEvent) => void): () => void {
    this.eventEmitter.on('event', listener);
    return () => {
      this.eventEmitter.off('event', listener);
    };
  }

  listThreads(input?: AgentChatListThreadsInput): AgentChatThreadSummary[] {
    const workspacePath = sanitizeText(input?.workspacePath);
    const externalSessionId = sanitizeText(input?.externalSessionId ?? undefined);
    const limit = typeof input?.limit === 'number' && input.limit > 0
      ? Math.floor(input.limit)
      : 0;

    const summaries = Array.from(this.threads.values())
      .map(record => cloneSummary(record.summary))
      .filter(summary => {
        if (workspacePath && summary.workspacePath !== workspacePath) {
          return false;
        }
        if (externalSessionId && summary.externalSessionId !== externalSessionId) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.updatedAt - left.updatedAt);

    return limit > 0 ? summaries.slice(0, limit) : summaries;
  }

  getThreadSnapshot(input: AgentChatGetThreadInput): AgentChatThreadSnapshot | null {
    const threadId = sanitizeText(input.threadId);
    if (!threadId) {
      return null;
    }

    const record = this.threads.get(threadId);
    if (!record) {
      return null;
    }

    return this.createSnapshotFromRecord(record);
  }

  startThread(input?: AgentChatStartThreadInput): AgentChatThreadSnapshot {
    const threadId = randomUUID();
    const now = Date.now();
    const externalSessionId = sanitizeText(input?.externalSessionId ?? undefined) || null;
    const source: AgentChatThreadSource = 'native';

    const summary: AgentChatThreadSummary = {
      id: threadId,
      title: sanitizeText(input?.title) || DEFAULT_THREAD_TITLE,
      workspacePath: sanitizeText(input?.workspacePath),
      externalSessionId,
      modelId: sanitizeText(input?.modelId ?? undefined) || null,
      createdAt: now,
      updatedAt: now,
      previewText: null,
      itemCount: 0,
      status: {
        isProcessing: false,
        activeTurnId: null,
        latestTurnId: null,
        latestTurnStatus: null,
        source,
        lastError: null,
      },
    };

    const record: AgentChatThreadRecord = {
      summary,
      items: [],
      turnItems: [],
      turns: new Map(),
      requests: new Map(),
    };

    this.threads.set(threadId, record);
    if (externalSessionId) {
      this.threadIdsByExternalSessionId.set(externalSessionId, threadId);
    }

    this.emit({
      method: 'thread/started',
      params: {
        summary: cloneSummary(summary),
      },
    });

    return createEmptyThreadSnapshot(summary);
  }

  startTurn(input: AgentChatStartTurnInput): AgentChatTurnSummary {
    const threadId = sanitizeText(input.threadId);
    if (!threadId) {
      throw new Error('threadId is required');
    }

    const record = this.threads.get(threadId);
    if (!record) {
      throw new Error(`thread not found: ${threadId}`);
    }

    const requestedTurnId = sanitizeText(input.turnId);
    const existingTurn = requestedTurnId
      ? record.turns.get(requestedTurnId) ?? null
      : null;
    const now = Date.now();

    if (existingTurn) {
      const nextTitle = sanitizeText(input.title) || existingTurn.title || DEFAULT_TURN_TITLE;
      const nextModelId = sanitizeText(input.modelId ?? undefined) || existingTurn.modelId || null;
      const nextStatus = typeof input.status === 'string'
        ? normalizeTurnStatus(input.status)
        : existingTurn.status;
      const nextSource: AgentChatThreadSource = 'native';

      existingTurn.title = nextTitle;
      existingTurn.externalTaskId = sanitizeText(input.externalTaskId ?? undefined) || existingTurn.externalTaskId;
      existingTurn.modelId = nextModelId;
      existingTurn.status = nextStatus;
      existingTurn.source = nextSource;
      existingTurn.updatedAt = now;
      existingTurn.completedAt = isActiveTurnStatus(nextStatus)
        ? null
        : (existingTurn.completedAt ?? now);

      record.summary.updatedAt = now;
      if (nextModelId) {
        record.summary.modelId = nextModelId;
      }
      this.reconcileThreadRuntime(record);

      this.emit({
        method: 'turn/updated',
        params: {
          summary: cloneTurnSummary(existingTurn),
        },
      });
      this.emit({
        method: 'thread/updated',
        params: {
          summary: cloneSummary(record.summary),
        },
      });

      return cloneTurnSummary(existingTurn);
    }

    const turnId = requestedTurnId || randomUUID();
    const status = normalizeTurnStatus(input.status);
    const source: AgentChatThreadSource = 'native';
    const modelId = sanitizeText(input.modelId ?? undefined) || record.summary.modelId || null;

    const turn: AgentChatTurnSummary = {
      id: turnId,
      threadId,
      title: sanitizeText(input.title) || DEFAULT_TURN_TITLE,
      externalTaskId: sanitizeText(input.externalTaskId ?? undefined) || null,
      modelId,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      completedAt: isActiveTurnStatus(status) ? null : now,
      status,
      source,
      lastError: null,
    };

    record.turns.set(turnId, turn);
    record.summary.updatedAt = now;
    if (modelId) {
      record.summary.modelId = modelId;
    }
    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/started',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });

    return cloneTurnSummary(turn);
  }

  updateTurn(input: AgentChatUpdateTurnInput): AgentChatTurnSummary | null {
    const threadId = sanitizeText(input.threadId);
    const turnId = sanitizeText(input.turnId);
    if (!threadId || !turnId) {
      return null;
    }

    const record = this.threads.get(threadId);
    const turn = record?.turns.get(turnId) ?? null;
    if (!record || !turn) {
      return null;
    }

    const nextTitle = sanitizeText(input.title) || turn.title || DEFAULT_TURN_TITLE;
    const nextModelId = sanitizeText(input.modelId ?? undefined) || turn.modelId || null;
    const nextLastError = input.lastError === undefined
      ? turn.lastError
      : (sanitizeText(input.lastError) || null);
    const nextStatus = typeof input.status === 'string'
      ? normalizeTurnStatus(input.status)
      : turn.status;
    const now = Date.now();

    turn.title = nextTitle;
    turn.modelId = nextModelId;
    turn.status = nextStatus;
    turn.lastError = nextLastError;
    turn.updatedAt = now;
    turn.completedAt = isActiveTurnStatus(nextStatus)
      ? null
      : (turn.completedAt ?? now);

    record.summary.updatedAt = now;
    if (nextModelId) {
      record.summary.modelId = nextModelId;
    }
    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/updated',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });

    return cloneTurnSummary(turn);
  }

  appendTurnItems(input: AgentChatAppendTurnItemsInput): AgentChatTurnItem[] {
    const threadId = sanitizeText(input.threadId);
    const turnId = sanitizeText(input.turnId);
    if (!threadId || !turnId) {
      throw new Error('threadId and turnId are required');
    }

    const record = this.threads.get(threadId);
    const turn = record?.turns.get(turnId) ?? null;
    if (!record || !turn) {
      throw new Error(`turn not found: ${turnId}`);
    }

    const items = this.normalizeTurnItemInputs(threadId, turnId, input.items);
    if (items.length === 0) {
      return [];
    }

    record.turnItems.push(...items);
    record.summary.updatedAt = Date.now();

    const clonedItems = items.map(item => cloneTurnItem(item));
    this.emit({
      method: 'turn/items/appended',
      params: {
        threadId,
        turnId,
        items: clonedItems,
        frames: buildAgentChatTurnFrames(clonedItems),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });

    return clonedItems;
  }

  createApprovalRequest(input: AgentChatCreateApprovalRequestInput): AgentChatApprovalRequest {
    const threadId = sanitizeText(input.threadId);
    const turnId = sanitizeText(input.turnId);
    if (!threadId || !turnId) {
      throw new Error('threadId and turnId are required');
    }

    const record = this.threads.get(threadId);
    const turn = record?.turns.get(turnId) ?? null;
    if (!record || !turn) {
      throw new Error(`turn not found: ${turnId}`);
    }

    const description = sanitizeText(input.description);
    if (!description) {
      throw new Error('description is required');
    }

    const requestId = sanitizeText(input.requestId) || randomUUID();
    const request: AgentChatApprovalRequest = {
      id: requestId,
      kind: 'approval',
      threadId,
      turnId,
      requestType: input.requestType,
      title: sanitizeText(input.title ?? undefined) || null,
      description,
      toolName: sanitizeText(input.toolName ?? undefined) || null,
      params: input.params ? { ...input.params } : undefined,
      command: sanitizeText(input.command ?? undefined) || null,
      changedFiles: sanitizeStringList(input.changedFiles),
      changeSet: cloneChangeSet(input.changeSet) ?? null,
      createdAt: Date.now(),
      resolvedAt: null,
      status: 'pending',
      response: null,
    };

    record.requests.set(requestId, request);
    turn.status = 'waiting_approval';
    turn.updatedAt = Date.now();
    record.summary.updatedAt = turn.updatedAt;
    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/updated',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });
    this.emit({
      method: 'request/queued',
      params: {
        request: cloneServerRequest(request),
      },
    });

    return cloneServerRequest(request) as AgentChatApprovalRequest;
  }

  createUserInputRequest(input: AgentChatCreateUserInputRequestInput): AgentChatUserInputRequest {
    const threadId = sanitizeText(input.threadId);
    const turnId = sanitizeText(input.turnId);
    if (!threadId || !turnId) {
      throw new Error('threadId and turnId are required');
    }

    const record = this.threads.get(threadId);
    const turn = record?.turns.get(turnId) ?? null;
    if (!record || !turn) {
      throw new Error(`turn not found: ${turnId}`);
    }

    const questions = normalizeUserInputQuestions(input.questions);
    if (questions.length === 0) {
      throw new Error('questions are required');
    }

    const requestId = sanitizeText(input.requestId) || randomUUID();
    const request: AgentChatUserInputRequest = {
      id: requestId,
      kind: 'user_input',
      threadId,
      turnId,
      title: sanitizeText(input.title ?? undefined) || null,
      description: sanitizeText(input.description ?? undefined) || null,
      questions,
      createdAt: Date.now(),
      resolvedAt: null,
      status: 'pending',
      response: null,
    };

    record.requests.set(requestId, request);
    turn.status = 'waiting_user_input';
    turn.updatedAt = Date.now();
    record.summary.updatedAt = turn.updatedAt;
    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/updated',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });
    this.emit({
      method: 'request/queued',
      params: {
        request: cloneServerRequest(request),
      },
    });

    return cloneServerRequest(request) as AgentChatUserInputRequest;
  }

  respondToRequest(input: AgentChatRespondToRequestInput): AgentChatServerRequest | null {
    const threadId = sanitizeText(input.threadId);
    const requestId = sanitizeText(input.requestId);
    if (!threadId || !requestId) {
      return null;
    }

    const record = this.threads.get(threadId);
    const request = record?.requests.get(requestId) ?? null;
    if (!record || !request) {
      return null;
    }

    const now = Date.now();
    const feedback = sanitizeText(input.feedback ?? undefined) || null;

    if (request.kind === 'approval') {
      request.status = input.approved ? 'approved' : 'rejected';
      request.resolvedAt = now;
      request.response = {
        approved: input.approved === true,
        feedback,
        fileDecisions: sanitizeBooleanRecord(input.fileDecisions),
      };
    } else {
      const answers = cloneStringRecord(input.answers) ?? {};
      request.status = Object.keys(answers).length > 0 ? 'submitted' : 'cancelled';
      request.resolvedAt = now;
      request.response = {
        answers,
        feedback,
      };
    }

    const turn = record.turns.get(request.turnId) ?? null;
    if (turn) {
      const nextTurnStatus = input.nextTurnStatus
        ? normalizeTurnStatus(input.nextTurnStatus)
        : 'running';
      turn.status = nextTurnStatus;
      turn.updatedAt = now;
      turn.completedAt = isActiveTurnStatus(nextTurnStatus)
        ? null
        : (turn.completedAt ?? now);
    }

    record.summary.updatedAt = now;
    this.reconcileThreadRuntime(record);

    if (turn) {
      this.emit({
        method: 'turn/updated',
        params: {
          summary: cloneTurnSummary(turn),
        },
      });
    }
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });
    this.emit({
      method: 'request/resolved',
      params: {
        request: cloneServerRequest(request),
      },
    });

    return cloneServerRequest(request);
  }

  interruptTurn(input: AgentChatInterruptTurnInput): AgentChatTurnSummary | null {
    const threadId = sanitizeText(input.threadId);
    if (!threadId) {
      return null;
    }

    const record = this.threads.get(threadId);
    if (!record) {
      return null;
    }

    const requestedTurnId = sanitizeText(input.turnId ?? undefined);
    const turn = requestedTurnId
      ? (record.turns.get(requestedTurnId) ?? null)
      : this.getActiveTurnRecord(record);
    if (!turn) {
      return null;
    }

    const now = Date.now();
    const reason = sanitizeText(input.reason ?? undefined) || '用户中断';

    turn.status = 'interrupted';
    turn.updatedAt = now;
    turn.completedAt = now;
    turn.lastError = reason;

    record.summary.updatedAt = now;

    for (const request of record.requests.values()) {
      if (request.turnId !== turn.id || request.status !== 'pending') {
        continue;
      }

      if (request.kind === 'approval') {
        request.status = 'rejected';
        request.resolvedAt = now;
        request.response = {
          approved: false,
          feedback: reason,
        };
      } else {
        request.status = 'cancelled';
        request.resolvedAt = now;
        request.response = {
          answers: {},
          feedback: reason,
        };
      }

      this.emit({
        method: 'request/resolved',
        params: {
          request: cloneServerRequest(request),
        },
      });
    }

    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/updated',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });

    return cloneTurnSummary(turn);
  }

  resumeTurn(input: AgentChatResumeTurnInput): AgentChatTurnSummary | null {
    const threadId = sanitizeText(input.threadId);
    const turnId = sanitizeText(input.turnId);
    if (!threadId || !turnId) {
      return null;
    }

    const record = this.threads.get(threadId);
    const turn = record?.turns.get(turnId) ?? null;
    if (!record || !turn) {
      return null;
    }

    const hasPendingRequest = Array.from(record.requests.values()).some(request =>
      request.turnId === turn.id && request.status === 'pending'
    );
    if (hasPendingRequest) {
      turn.status = this.hasPendingApproval(record, turn.id)
        ? 'waiting_approval'
        : 'waiting_user_input';
    } else {
      turn.status = 'running';
    }

    turn.updatedAt = Date.now();
    turn.completedAt = null;
    turn.lastError = null;

    record.summary.updatedAt = turn.updatedAt;
    this.reconcileThreadRuntime(record);

    this.emit({
      method: 'turn/updated',
      params: {
        summary: cloneTurnSummary(turn),
      },
    });
    this.emit({
      method: 'thread/updated',
      params: {
        summary: cloneSummary(record.summary),
      },
    });

    return cloneTurnSummary(turn);
  }

  private normalizeInputItems(
    threadId: string,
    items: AgentChatConversationItemInput[]
  ): AgentChatConversationItem[] {
    return items
      .map(item => {
        const id = sanitizeText(item.id);
        const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now();

        return {
          id: id || randomUUID(),
          threadId,
          kind: item.kind,
          role: item.role,
          text: typeof item.text === 'string' ? item.text : '',
          createdAt,
          modelId: sanitizeText(item.modelId ?? undefined) || null,
          metadata: item.metadata ? { ...item.metadata } : undefined,
        };
      })
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  private normalizeTurnItemInputs(
    threadId: string,
    turnId: string,
    items: AgentChatTurnItemInput[] | null | undefined
  ): AgentChatTurnItem[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .reduce<AgentChatTurnItem[]>((acc, item) => {
        const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now();
        const kind = item.kind;
        if (!kind) {
          return acc;
        }

        acc.push({
          id: sanitizeText(item.id) || randomUUID(),
          threadId,
          turnId,
          kind,
          title: sanitizeText(item.title ?? undefined) || null,
          text: sanitizeText(item.text ?? undefined) || null,
          status: normalizeTurnItemStatus(item.status),
          createdAt,
          metadata: item.metadata ? { ...item.metadata } : undefined,
        });

        return acc;
      }, [])
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  private getActiveTurnRecord(record: AgentChatThreadRecord): AgentChatTurnSummary | null {
    return Array.from(record.turns.values())
      .sort((left, right) => right.updatedAt - left.updatedAt || right.startedAt - left.startedAt)
      .find(turn => isActiveTurnStatus(turn.status)) ?? null;
  }

  private hasPendingApproval(record: AgentChatThreadRecord, turnId: string): boolean {
    return Array.from(record.requests.values()).some(request =>
      request.turnId === turnId
      && request.status === 'pending'
      && request.kind === 'approval'
    );
  }

  private createSnapshotFromRecord(record: AgentChatThreadRecord): AgentChatThreadSnapshot {
    return {
      summary: cloneSummary(record.summary),
      items: record.items.map(item => cloneItem(item)),
      turnItems: record.turnItems
        .slice()
        .sort((left, right) => left.createdAt - right.createdAt)
        .map(item => cloneTurnItem(item)),
      turns: Array.from(record.turns.values())
        .sort((left, right) => left.startedAt - right.startedAt || left.createdAt - right.createdAt)
        .map(turn => cloneTurnSummary(turn)),
      pendingRequests: Array.from(record.requests.values())
        .filter(request => request.status === 'pending')
        .sort((left, right) => left.createdAt - right.createdAt)
        .map(request => cloneServerRequest(request)),
    };
  }

  private reconcileThreadRuntime(record: AgentChatThreadRecord): void {
    const turnsByRecency = Array.from(record.turns.values())
      .sort((left, right) => right.updatedAt - left.updatedAt || right.startedAt - left.startedAt);
    const activeTurn = turnsByRecency.find(turn => isActiveTurnStatus(turn.status)) ?? null;
    const latestErroredTurn = turnsByRecency.find(turn => turn.lastError) ?? null;
    const latestTurn = turnsByRecency[0] ?? null;

    record.summary.status.activeTurnId = activeTurn?.id ?? null;
    record.summary.status.isProcessing = !!activeTurn;
    record.summary.status.latestTurnId = latestTurn?.id ?? null;
    record.summary.status.latestTurnStatus = latestTurn?.status ?? null;
    record.summary.status.lastError = activeTurn?.lastError ?? latestErroredTurn?.lastError ?? null;

    if (activeTurn?.modelId) {
      record.summary.modelId = activeTurn.modelId;
    }
  }

  private emit(
    payload: Omit<AgentChatEvent, 'eventId' | 'emittedAt'>
  ): void {
    const event = {
      ...payload,
      eventId: randomUUID(),
      emittedAt: Date.now(),
    } as AgentChatEvent;

    this.eventEmitter.emit('event', event);
  }
}

export const agentChatRuntime = new AgentChatRuntime();
