/**
 * Prompt helpers for Agentic Loop initialization and tool formatting.
 */

import type { AgentToolDefinition } from '../types';
import type { AgentLoopInitialMessageInput, AgentLoopMessage } from './types';

export const DEFAULT_FORCED_FINAL_ANSWER_PROMPT =
  '现在直接给出最终结果，不要再调用工具。请用中文简洁说明已完成的工作、结果和限制。';

const dedupeToolDefinitions = (toolDefinitions: AgentToolDefinition[]): AgentToolDefinition[] => {
  const seen = new Set<string>();
  const deduped: AgentToolDefinition[] = [];

  for (const toolDefinition of toolDefinitions) {
    const name = toolDefinition.name.trim();
    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    deduped.push(toolDefinition);
  }

  return deduped;
};

export const formatAgentToolDefinitionsForPrompt = (
  toolDefinitions: AgentToolDefinition[],
): string => {
  const lines: string[] = [];

  for (const toolDefinition of dedupeToolDefinitions(toolDefinitions)) {
    lines.push(`### ${toolDefinition.name}`);
    lines.push(toolDefinition.description);

    const propertyEntries = Object.entries(toolDefinition.input_schema.properties);
    if (propertyEntries.length === 0) {
      lines.push('参数: 无');
    } else {
      lines.push('参数:');
      const required = new Set(toolDefinition.input_schema.required ?? []);

      for (const [key, schema] of propertyEntries) {
        const type = schema.type || 'unknown';
        const suffix = required.has(key) ? 'required' : 'optional';
        lines.push(`- ${key} (${type}, ${suffix}): ${schema.description ?? ''}`.trim());
      }
    }

    lines.push(`requires_confirmation: ${toolDefinition.requiresConfirmation === true ? 'true' : 'false'}`);
    lines.push('');
  }

  return lines.join('\n').trim();
};

export const createAgentLoopInitialMessages = (
  input: AgentLoopInitialMessageInput,
): AgentLoopMessage[] => [
  {
    role: 'system',
    content: `${input.systemPrompt}\n\n## 可用工具\n${formatAgentToolDefinitionsForPrompt(input.toolDefinitions)}`,
  },
  {
    role: 'user',
    content: input.taskMessage,
  },
];

export const buildForcedFinalAnswerMessages = (
  messages: AgentLoopMessage[],
  prompt: string = DEFAULT_FORCED_FINAL_ANSWER_PROMPT,
): AgentLoopMessage[] => [
  ...messages.map(message => ({ ...message })),
  {
    role: 'user',
    content: prompt,
  },
];
