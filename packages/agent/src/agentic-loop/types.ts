/**
 * Public type contracts for the Agentic Loop module.
 */

import type { AgentToolDefinition, AgentToolExecutionResult } from '../types';

export type AgentLoopMessageRole = 'system' | 'user' | 'assistant';

export interface AgentLoopMessage {
  role: AgentLoopMessageRole;
  content: string;
}

export type AgentLoopDecisionAction = 'tool_call' | 'final';

export interface AgentLoopDecision {
  action: AgentLoopDecisionAction;
  thinking: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  finalAnswer?: string;
}

export interface AgentLoopCheckpoint {
  messages: AgentLoopMessage[];
  nextIteration: number;
  modelCallsUsed?: number;
}

export interface AgentLoopToolCall {
  iteration: number;
  toolName: string;
  parameters: Record<string, unknown>;
  thinking: string;
}

export type AgentLoopTerminationReason =
  | 'assistant_text'
  | 'final_answer'
  | 'max_iterations'
  | 'generated_final_answer'
  | 'max_model_calls';

export interface AgentLoopFinalAnswerEvent {
  text: string;
  iteration: number | null;
  reason: AgentLoopTerminationReason;
}

export interface AgentLoopToolResultEvent<TToolContext = unknown> {
  toolCall: AgentLoopToolCall;
  result: AgentToolExecutionResult;
  formattedResult: string;
  toolCallContext?: TToolContext;
}

export interface AgentLoopHistoryCompactionOptions {
  maxMessageCount?: number;
  maxContextChars?: number;
  preserveLastRounds?: number;
  preserveLastMessages?: number;
  maxSummaryChars?: number;
  summaryLabel?: string;
  summarizeMessages?: (messages: AgentLoopMessage[]) => Promise<string> | string;
}

export interface AgentLoopHistoryCompactedEvent {
  iteration: number | null;
  originalMessageCount: number;
  compactedMessageCount: number;
  originalCharCount: number;
  compactedCharCount: number;
  summaryMessage: AgentLoopMessage;
}

export interface AgentLoopCallbacks<TToolContext = unknown> {
  assertCanContinue?: () => Promise<void> | void;
  onCheckpoint?: (checkpoint: AgentLoopCheckpoint) => Promise<void> | void;
  onIterationStart?: (iteration: number) => Promise<void> | void;
  onThinking?: (decision: AgentLoopDecision, iteration: number) => Promise<void> | void;
  onHistoryCompacted?: (event: AgentLoopHistoryCompactedEvent) => Promise<void> | void;
  onToolCall?: (toolCall: AgentLoopToolCall) => Promise<TToolContext | void> | TToolContext | void;
  onToolResult?: (event: AgentLoopToolResultEvent<TToolContext>) => Promise<void> | void;
  onFinalAnswer?: (event: AgentLoopFinalAnswerEvent) => Promise<void> | void;
}

export interface AgenticLoopRunInput<TToolContext = unknown> {
  initialMessages: AgentLoopMessage[];
  checkpoint?: AgentLoopCheckpoint | null;
  maxIterations: number;
  maxModelCalls?: number;
  maxFinalAnswerChars?: number;
  historyCompression?: AgentLoopHistoryCompactionOptions;
  callModel: (messages: AgentLoopMessage[], iteration: number) => Promise<string>;
  executeTool: (
    toolName: string,
    parameters: Record<string, unknown>,
    iteration: number,
  ) => Promise<AgentToolExecutionResult>;
  formatToolResult: (toolName: string, result: AgentToolExecutionResult) => string;
  generateFinalAnswer?: (messages: AgentLoopMessage[]) => Promise<string>;
  callbacks?: AgentLoopCallbacks<TToolContext>;
}

export interface AgenticLoopRunResult {
  finalOutput: string;
  messages: AgentLoopMessage[];
  iterationsCompleted: number;
  terminationReason: AgentLoopTerminationReason;
  checkpoint: AgentLoopCheckpoint;
}

export interface AgentLoopInitialMessageInput {
  systemPrompt: string;
  taskMessage: string;
  toolDefinitions: AgentToolDefinition[];
}
