/**
 * Registry for Agent tool definitions used by prompts, approvals, and UI metadata.
 */

import type { AgentToolDefinition } from '../types';

const cloneSchema = (value: AgentToolDefinition['input_schema']): AgentToolDefinition['input_schema'] =>
  JSON.parse(JSON.stringify(value)) as AgentToolDefinition['input_schema'];

const cloneDefinition = (value: AgentToolDefinition): AgentToolDefinition => ({
  ...value,
  input_schema: cloneSchema(value.input_schema),
});

export class AgentToolDefinitionRegistry {
  private readonly definitions = new Map<string, AgentToolDefinition>();

  constructor(definitions: AgentToolDefinition[] = []) {
    this.registerMany(definitions);
  }

  register(definition: AgentToolDefinition): void {
    const name = definition.name.trim();
    if (!name) {
      throw new Error('tool name is required');
    }

    this.definitions.set(name, cloneDefinition(definition));
  }

  registerMany(definitions: AgentToolDefinition[]): void {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  get(name: string): AgentToolDefinition | null {
    const definition = this.definitions.get(name.trim());
    return definition ? cloneDefinition(definition) : null;
  }

  list(): AgentToolDefinition[] {
    return Array.from(this.definitions.values()).map(cloneDefinition);
  }
}
