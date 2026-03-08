/**
 * Legacy-compatible renderer agent service that preserves the old AI panel API
 * while delegating actual execution to the main-process agent chat runtime.
 */

import type {
  AgentChatApprovalRequest,
  AgentChatEvent,
  AgentChatTurnFrame,
  AgentChatThreadSnapshot,
  AgentChatTurnItem,
  AgentChatTurnSummary,
} from '@note-studio/shared';
import { buildAgentChatTurnFrames } from '@note-studio/shared';
import { getCachedModels } from '../ModelCacheService';
import { agentChatService } from '../agentChat';
import type {
  AgentExecutionCallbacks,
  AgentExecutionResult,
  AgentFileChange,
  AgentInitializeOptions,
  AgentMemoryStats,
  AgentTask,
  AgentTaskConstraints,
  AgentTaskType,
  AgentToolExecutionResult,
} from './types';

interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  params: Record<string, unknown>;
}

interface MemoryEntry {
  taskId: string;
  threadId: string;
  turnId: string;
  createdAt: number;
}

const LEGACY_MEMORY_LIMIT = 32;

const createId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const extractActualModelId = (modelId: string): string => {
  const normalized = modelId.trim();
  const colonIndex = normalized.indexOf(':');
  return colonIndex >= 0 ? normalized.slice(colonIndex + 1) : normalized;
};

const buildThreadTitle = (value: string): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Agent 任务';
  }

  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
};

const getTurnContentResponseKey = (item: AgentChatTurnItem): string | null => {
  const value = item.metadata?.responseKey;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const buildLatestTurnContent = (items: AgentChatTurnItem[], turnId: string): string => {
  const contentItems = items
    .filter(item => item.turnId === turnId && item.kind === 'content')
    .sort((left, right) => left.createdAt - right.createdAt);

  if (contentItems.length === 0) {
    return '';
  }

  const latestResponseKey = [...contentItems]
    .reverse()
    .map(item => getTurnContentResponseKey(item))
    .find(Boolean) ?? null;

  const resolvedItems = latestResponseKey
    ? contentItems.filter(item => getTurnContentResponseKey(item) === latestResponseKey)
    : contentItems;

  return resolvedItems
    .map(item => item.text ?? '')
    .join('')
    .trim();
};

const buildInstructionFromTask = (task: AgentTask): string => {
  const parts: string[] = [task.description.trim()];

  if (task.context.currentFile?.trim()) {
    parts.push(`当前文件：${task.context.currentFile.trim()}`);
  }

  if (task.context.selectedText?.trim()) {
    parts.push(`选中文本：\n${task.context.selectedText.trim()}`);
  }

  if (task.context.additionalContext && Object.keys(task.context.additionalContext).length > 0) {
    parts.push(`附加上下文：\n${JSON.stringify(task.context.additionalContext, null, 2)}`);
  }

  if (task.constraints && Object.keys(task.constraints).length > 0) {
    parts.push(`执行约束：\n${JSON.stringify(task.constraints, null, 2)}`);
  }

  return parts.filter(Boolean).join('\n\n');
};

const getMaxIterations = (constraints?: AgentTaskConstraints): number => {
  const value = constraints?.maxIterations;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.min(16, Math.floor(value)));
  }

  return 8;
};

const isWriteTool = (toolName: string): boolean =>
  toolName === 'write_file'
  || toolName === 'edit_file'
  || toolName === 'multi_edit_file';

const readFileContent = async (filePath: string): Promise<string> => {
  const result = await window.electron?.ipcRenderer.invoke('read-file', filePath);
  return typeof result === 'string' ? result : '';
};

class AgentService {
  private executionModelId = '';
  private workspacePath = '';
  private memoryEntries: MemoryEntry[] = [];

  async initialize(options?: AgentInitializeOptions): Promise<void> {
    const nextModelId = options?.execution?.modelId?.trim();
    if (nextModelId) {
      this.executionModelId = nextModelId;
    }
  }

  reset(): void {
    this.memoryEntries = [];
  }

  registerDefaultTools(options: { workspacePath?: string }): void {
    this.workspacePath = options.workspacePath?.trim() ?? '';
  }

  createTask(
    type: AgentTaskType,
    description: string,
    context: AgentTask['context'],
    constraints?: AgentTaskConstraints,
  ): AgentTask {
    return {
      id: createId(),
      type,
      description,
      context,
      constraints,
    };
  }

  getMemoryStats(): AgentMemoryStats {
    const totalEntries = this.memoryEntries.length;
    return {
      usagePercentage: Math.min(100, Math.round((totalEntries / LEGACY_MEMORY_LIMIT) * 100)),
      totalEntries,
    };
  }

  getMemory(): { clear: () => void } {
    return {
      clear: () => {
        this.memoryEntries = [];
      },
    };
  }

  private async syncUserModelsToMain(): Promise<void> {
    const builtinAI = window.electron?.builtinAI ?? window.electronAPI?.builtinAI;
    if (!builtinAI) {
      return;
    }

    const allModels = await getCachedModels();
    await builtinAI.updateUserModels(allModels.map(model => model.modelId));
    await builtinAI.updateUserModelConfigs(
      allModels.map(model => ({
        modelId: model.modelId,
        configName: model.configName,
        apiKey: model.apiKey,
        apiEndpoint: model.apiEndpoint,
        providerId: model.providerId,
        temperature: model.temperature,
      })),
    );
  }

  private async resolveThread(task: AgentTask, workspacePath: string): Promise<AgentChatThreadSnapshot> {
    const externalSessionId = task.context.externalSessionId?.trim() ?? '';
    if (externalSessionId) {
      const threads = await agentChatService.listThreads({
        externalSessionId,
        limit: 10,
      });
      const existing = [...threads].sort((left, right) => right.updatedAt - left.updatedAt)[0];
      if (existing) {
        const snapshot = await agentChatService.getThread({ threadId: existing.id });
        if (snapshot) {
          return snapshot;
        }
      }
    }

    const snapshot = await agentChatService.startThread({
      title: buildThreadTitle(task.description),
      workspacePath,
      externalSessionId: externalSessionId || null,
      modelId: this.executionModelId || null,
      source: 'legacy',
    });

    if (!snapshot) {
      throw new Error('无法创建 Agent 线程。');
    }

    return snapshot;
  }

  private async buildToolExecutionResult(
    toolName: string,
    params: Record<string, unknown>,
    toolCallId: string,
    payload: {
      success: boolean;
      text: string | null;
    },
  ): Promise<AgentToolExecutionResult & { finalWriteContent?: string }> {
    const success = payload.success;
    const resultText = payload.text?.trim() ?? '';
    const data: Record<string, unknown> = {
      output: resultText,
      rawText: resultText,
    };

    if (toolName === 'bash') {
      data.command = typeof params.command === 'string' ? params.command : undefined;
      data.stdout = resultText;
    }

    if (success && isWriteTool(toolName)) {
      const filePath = typeof params.path === 'string' ? params.path.trim() : '';
      if (filePath) {
        const newContent = await readFileContent(filePath);
        const changes: AgentFileChange[] = newContent
          ? [{ filePath, newContent }]
          : [{ filePath }];
        return {
          success: true,
          toolCallId,
          data: {
            ...data,
            path: filePath,
            newContent: newContent || undefined,
          },
          changes,
          finalWriteContent: newContent || undefined,
        };
      }
    }

    if (!success) {
      return {
        success: false,
        toolCallId,
        error: resultText || 'Tool execution failed',
        data,
      };
    }

    return {
      success: true,
      toolCallId,
      data,
    };
  }

  async executeTaskStream(task: AgentTask, callbacks: AgentExecutionCallbacks): Promise<void> {
    const workspacePath = task.context.workspacePath?.trim() || this.workspacePath;
    if (!workspacePath) {
      throw new Error('未找到工作区路径。');
    }

    if (!this.executionModelId.trim()) {
      throw new Error('未配置 Agent 执行模型。');
    }

    await this.syncUserModelsToMain();

    const threadSnapshot = await this.resolveThread(task, workspacePath);
    const threadId = threadSnapshot.summary.id;
    const turn = await agentChatService.startTurn({
      threadId,
      title: buildThreadTitle(task.description),
      modelId: this.executionModelId,
      source: 'legacy',
    });

    if (!turn) {
      throw new Error('无法创建 Agent 回合。');
    }

    const turnId = turn.id;
    this.memoryEntries = [
      ...this.memoryEntries.slice(-(LEGACY_MEMORY_LIMIT - 1)),
      {
        taskId: task.id,
        threadId,
        turnId,
        createdAt: Date.now(),
      },
    ];

    const pendingToolCalls: PendingToolCall[] = [];
    const fileChanges: AgentFileChange[] = [];
    let finalWriteContent = '';
    let streamedOutput = '';
    let settled = false;

    let resolveExecution: (() => void) | null = null;

    const settleWithError = (message: string): void => {
      if (settled) {
        return;
      }

      settled = true;
      const error = new Error(message);
      callbacks.onError?.(error);
      resolveExecution?.();
    };

    const settleWithResult = async (summary: AgentChatTurnSummary): Promise<void> => {
      if (settled) {
        return;
      }

      const snapshot = await agentChatService.getThread({ threadId });
      const finalOutput = snapshot?.turnItems
        ? buildLatestTurnContent(snapshot.turnItems, turnId)
        : streamedOutput.trim();
      const executionResult: AgentExecutionResult = {
        success: summary.status === 'completed',
        output: finalOutput || streamedOutput.trim(),
        error: summary.status === 'completed' ? undefined : (summary.lastError || 'Agent 执行失败'),
        changes: fileChanges,
        finalWriteContent: finalWriteContent || undefined,
      };

      settled = true;
      if (executionResult.success) {
        callbacks.onComplete?.(executionResult);
        resolveExecution?.();
        return;
      }

      const error = new Error(executionResult.error || 'Agent 执行失败');
      callbacks.onError?.(error);
      resolveExecution?.();
    };

    const handleApprovalRequest = async (request: AgentChatApprovalRequest): Promise<void> => {
      const toolName = request.toolName?.trim() || 'tool';
      const params = request.params ?? {};
      const approved = callbacks.onConfirmRequired
        ? await Promise.resolve(callbacks.onConfirmRequired(toolName, params))
        : true;

      await agentChatService.respondToRequest({
        threadId,
        requestId: request.id,
        approved,
        feedback: approved ? 'legacy-ui-approved' : 'legacy-ui-rejected',
        nextTurnStatus: approved ? 'running' : 'error',
      });
    };

    const handleTurnFrame = async (frame: AgentChatTurnFrame): Promise<void> => {
      callbacks.onTurnFrame?.(frame);

      if (frame.kind === 'reasoning_delta' && frame.text) {
        callbacks.onReasoning?.(frame.text);
        callbacks.onThinking?.(frame.text);
        return;
      }

      if (frame.kind === 'tool_started') {
        const toolName = frame.toolName.trim() || 'tool';
        const toolCallId = frame.toolCallId?.trim() || frame.itemId;
        const params = frame.params;

        pendingToolCalls.push({
          toolCallId,
          toolName,
          params,
        });
        callbacks.onToolCall?.(toolName, params, toolCallId);
        return;
      }

      if (frame.kind === 'tool_finished') {
        const toolName = frame.toolName.trim() || 'tool';
        const toolCallId = frame.toolCallId?.trim() || frame.itemId;
        const pendingIndex = pendingToolCalls.findIndex(entry =>
          entry.toolCallId === toolCallId
          || (!frame.toolCallId && entry.toolName === toolName)
        );
        const pendingToolCall = pendingIndex >= 0
          ? pendingToolCalls.splice(pendingIndex, 1)[0]
          : {
              toolCallId,
              toolName,
              params: {},
            };
        const toolResult = await this.buildToolExecutionResult(
          toolName,
          pendingToolCall.params,
          pendingToolCall.toolCallId,
          {
            success: frame.success,
            text: frame.resultText,
          },
        );

        if (toolResult.changes?.length) {
          fileChanges.push(...toolResult.changes);
        }
        if (toolResult.finalWriteContent) {
          finalWriteContent = toolResult.finalWriteContent;
        }

        callbacks.onToolResult?.(toolName, toolResult, pendingToolCall.toolCallId);
        return;
      }

      if ((frame.kind === 'assistant_delta' || frame.kind === 'final_answer') && frame.text) {
        streamedOutput += frame.text;
        callbacks.onContent?.(frame.text);
      }
    };

    const unsubscribe = agentChatService.onEvent((event: AgentChatEvent) => {
      if (settled) {
        return;
      }

      if (event.method === 'turn/items/appended') {
        if (event.params.threadId !== threadId || event.params.turnId !== turnId) {
          return;
        }

        void (async () => {
          const frames = event.params.frames && event.params.frames.length > 0
            ? event.params.frames
            : buildAgentChatTurnFrames(event.params.items);
          for (const frame of frames) {
            await handleTurnFrame(frame);
          }
        })().catch(error => {
          settleWithError(error instanceof Error ? error.message : String(error));
        });
        return;
      }

      if (event.method === 'request/queued') {
        const request = event.params.request;
        if (request.threadId !== threadId || request.turnId !== turnId || request.kind !== 'approval') {
          return;
        }

        void handleApprovalRequest(request).catch(error => {
          settleWithError(error instanceof Error ? error.message : String(error));
        });
        return;
      }

      if (event.method === 'turn/updated') {
        if (event.params.summary.threadId !== threadId || event.params.summary.id !== turnId) {
          return;
        }

        const summary = event.params.summary;
        if (summary.status === 'completed' || summary.status === 'error' || summary.status === 'interrupted') {
          void settleWithResult(summary).catch(error => {
            settleWithError(error instanceof Error ? error.message : String(error));
          });
        }
      }
    });

    try {
      const result = await agentChatService.runTurn({
        threadId,
        turnId,
        instruction: buildInstructionFromTask(task),
        workspacePath,
        modelId: this.executionModelId,
        currentFile: task.context.currentFile,
        selectedText: task.context.selectedText,
        maxIterations: getMaxIterations(task.constraints),
      });

      if (!result?.accepted) {
        throw new Error('Agent 任务未被接受。');
      }

      await new Promise<void>((resolve) => {
        resolveExecution = resolve;
      });
    } finally {
      unsubscribe();
    }
  }
}

export const agentService = new AgentService();
