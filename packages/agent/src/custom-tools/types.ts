/**
 * Type contracts for workspace-scoped custom Agent tools.
 */

import type {
  AgentExecutableToolDefinition,
  AgentToolInputSchema,
  AgentToolRequestType,
  AgentWorkspaceToolOptions,
} from '../types';

export interface AgentCustomCommandToolConfig {
  type?: 'command';
  name: string;
  description: string;
  input_schema: AgentToolInputSchema;
  commandTemplate: string;
  cwd?: string;
  timeoutMs?: number;
  requiresConfirmation?: boolean;
  requestType?: AgentToolRequestType;
}

export interface AgentCustomToolConfigFile {
  tools: AgentCustomCommandToolConfig[];
}

export interface AgentWorkspaceCustomToolRegistryOptions {
  configFilePath?: string;
  toolOptions?: AgentWorkspaceToolOptions;
}

export interface AgentWorkspaceCustomToolRegistry {
  list(workspacePath: string): Promise<AgentExecutableToolDefinition[]>;
}
