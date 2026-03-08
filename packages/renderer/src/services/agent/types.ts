/**
 * Legacy-compatible agent type definitions backed by the main-process agent chat runtime.
 */

import type { AgentChatTurnFrame } from '@note-studio/shared';

export enum AgentState {
  IDLE = 'IDLE',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  WAITING = 'WAITING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
  INTERRUPTED = 'INTERRUPTED',
}

export type AgentTaskType = 'write' | 'edit' | 'query' | 'analyze' | 'custom';

export interface AgentTaskContext {
  workspacePath?: string;
  currentFile?: string;
  selectedText?: string;
  externalSessionId?: string;
  additionalContext?: Record<string, unknown>;
}

export interface AgentTaskConstraints {
  allowFileWrite?: boolean;
  allowCommandExecution?: boolean;
  maxIterations?: number;
}

export interface AgentTask {
  id: string;
  type: AgentTaskType;
  description: string;
  context: AgentTaskContext;
  constraints?: AgentTaskConstraints;
}

export interface DiffLineChange {
  type: 'add' | 'delete' | 'context';
  content: string;
  lineNumber?: number;
}

export interface DiffChange {
  filePath: string;
  lineChanges: DiffLineChange[];
}

export interface ConfirmationRequest {
  id: string;
  toolName: string;
  description: string;
  params: Record<string, unknown>;
  diffChanges?: DiffChange[];
}

export interface AgentFileChange {
  filePath: string;
  newContent?: string;
}

export interface AgentToolExecutionResult {
  success: boolean;
  toolCallId?: string;
  data?: Record<string, unknown>;
  error?: string;
  changes?: AgentFileChange[];
}

export interface AgentExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  changes?: AgentFileChange[];
  finalWriteContent?: string;
}

export interface AgentExecutionCallbacks {
  onTurnFrame?: (frame: AgentChatTurnFrame) => void;
  onContent?: (content: string) => void;
  onReasoning?: (reasoning: string) => void;
  onThinking?: (reasoning: string) => void;
  onToolCall?: (toolName: string, params: Record<string, unknown>, toolCallId?: string) => void;
  onToolResult?: (toolName: string, result: AgentToolExecutionResult, toolCallId?: string) => void;
  onConfirmRequired?: (toolName: string, params: Record<string, unknown>) => Promise<boolean> | boolean;
  onComplete?: (result: AgentExecutionResult) => void;
  onError?: (error: Error) => void;
}

export interface AgentInitializeOptions {
  execution?: {
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    streaming?: boolean;
  };
}

export interface AgentMemoryStats {
  usagePercentage: number;
  totalEntries: number;
}
