/**
 * Public type contracts for the Agent tool definition and execution modules.
 */

export type AgentToolSchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface AgentToolSchema {
  type?: AgentToolSchemaType;
  description?: string;
  properties?: Record<string, AgentToolSchema>;
  items?: AgentToolSchema;
  required?: string[];
  enum?: string[];
}

export interface AgentToolInputSchema extends AgentToolSchema {
  type: 'object';
  properties: Record<string, AgentToolSchema>;
  required?: string[];
}

export type AgentToolRequestType = 'file_write' | 'command_execute' | 'diff_apply' | 'custom';

export type AgentCommandRiskLevel = 'safe' | 'high' | 'blocked';

export interface AgentToolDefinition {
  name: string;
  description: string;
  input_schema: AgentToolInputSchema;
  requiresConfirmation?: boolean;
  requestType?: AgentToolRequestType;
}

export interface AgentToolExecutionContext {
  workspacePath: string;
}

export interface AgentToolExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  changedFiles?: string[];
}

export interface AgentCommandSecurityAssessment {
  level: AgentCommandRiskLevel;
  reasons: string[];
}

export interface AgentExecutableToolDefinition extends AgentToolDefinition {
  execute: (
    input: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ) => Promise<AgentToolExecutionResult>;
}

export interface AgentToolSearchMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

export interface AgentToolDiffChange {
  search: string;
  replace: string;
  replaceAll?: boolean;
}

export interface AgentWorkspaceToolOptions {
  maxListEntries?: number;
  maxListDepth?: number;
  maxFileChars?: number;
  maxSearchResults?: number;
  maxSearchFileBytes?: number;
  maxCommandTimeoutMs?: number;
  maxCommandBufferBytes?: number;
  allowedWriteExtensions?: string[];
  forbiddenPathPatterns?: RegExp[];
  forbiddenCommandPatterns?: RegExp[];
  highRiskCommandPatterns?: RegExp[];
  blockedDirectoryChangeCommandPatterns?: RegExp[];
}

export interface ResolvedAgentWorkspaceToolOptions {
  maxListEntries: number;
  maxListDepth: number;
  maxFileChars: number;
  maxSearchResults: number;
  maxSearchFileBytes: number;
  maxCommandTimeoutMs: number;
  maxCommandBufferBytes: number;
  allowedWriteExtensions: Set<string>;
  forbiddenPathPatterns: RegExp[];
  forbiddenCommandPatterns: RegExp[];
  highRiskCommandPatterns: RegExp[];
  blockedDirectoryChangeCommandPatterns: RegExp[];
}
