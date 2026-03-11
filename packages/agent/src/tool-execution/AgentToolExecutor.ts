/**
 * Executor for Agent tools with a simple registration and dispatch API.
 */

import type {
  AgentExecutableToolDefinition,
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolExecutionResult,
  AgentWorkspaceToolOptions,
} from '../types';
import { createBuiltinWorkspaceTools } from './builtinTools';

const cloneSchema = (value: AgentToolDefinition['input_schema']): AgentToolDefinition['input_schema'] =>
  JSON.parse(JSON.stringify(value)) as AgentToolDefinition['input_schema'];

const cloneToolDefinition = (tool: AgentExecutableToolDefinition): AgentExecutableToolDefinition => ({
  ...tool,
  input_schema: cloneSchema(tool.input_schema),
});

export class AgentToolExecutor {
  private readonly tools = new Map<string, AgentExecutableToolDefinition>();

  constructor(tools: AgentExecutableToolDefinition[] = []) {
    this.registerMany(tools);
  }

  register(tool: AgentExecutableToolDefinition): void {
    const name = tool.name.trim();
    if (!name) {
      throw new Error('tool name is required');
    }

    this.tools.set(name, cloneToolDefinition(tool));
  }

  registerMany(tools: AgentExecutableToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  get(name: string): AgentExecutableToolDefinition | null {
    const tool = this.tools.get(name.trim());
    return tool ? cloneToolDefinition(tool) : null;
  }

  listTools(): AgentExecutableToolDefinition[] {
    return Array.from(this.tools.values()).map(cloneToolDefinition);
  }

  listDefinitions(): AgentToolDefinition[] {
    return this.listTools().map(({ execute, ...definition }) => definition);
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    context: AgentToolExecutionContext,
  ): Promise<AgentToolExecutionResult> {
    const tool = this.tools.get(name.trim());
    if (!tool) {
      return {
        success: false,
        error: `unknown tool: ${name}`,
      };
    }

    return tool.execute(input, context);
  }
}

export const createBuiltinWorkspaceToolExecutor = (
  options?: AgentWorkspaceToolOptions,
): AgentToolExecutor => new AgentToolExecutor(createBuiltinWorkspaceTools(options));
