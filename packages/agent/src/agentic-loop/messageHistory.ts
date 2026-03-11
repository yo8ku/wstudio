/**
 * Message history manager for the Agentic Loop module.
 */

import type {
  AgentLoopCheckpoint,
  AgentLoopHistoryCompactedEvent,
  AgentLoopHistoryCompactionOptions,
  AgentLoopMessage,
  AgentLoopToolCall,
} from './types';

const DEFAULT_MAX_MESSAGE_COUNT = 24;
const DEFAULT_MAX_CONTEXT_CHARS = 32000;
const DEFAULT_PRESERVE_LAST_ROUNDS = 10;
const DEFAULT_PRESERVE_LAST_MESSAGES = DEFAULT_PRESERVE_LAST_ROUNDS * 2;
const DEFAULT_MAX_SUMMARY_CHARS = 4000;
const DEFAULT_SUMMARY_LABEL = 'Earlier conversation summary:';
const HISTORY_SUMMARY_MARKER = '[history_summary]';
const MAX_SUMMARY_LINE_CHARS = 240;

const cloneMessages = (messages: AgentLoopMessage[]): AgentLoopMessage[] =>
  messages.map(message => ({ ...message }));

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const normalizeMultilineText = (value: string): string =>
  value
    .split(/\r?\n/)
    .map(line => normalizeText(line))
    .filter(Boolean)
    .join('\n');

const resolvePreservedTailMessages = (options?: AgentLoopHistoryCompactionOptions): number => {
  if (typeof options?.preserveLastRounds === 'number' && Number.isFinite(options.preserveLastRounds)) {
    return Math.max(4, Math.floor(options.preserveLastRounds) * 2);
  }

  if (typeof options?.preserveLastMessages === 'number' && Number.isFinite(options.preserveLastMessages)) {
    return Math.max(4, Math.floor(options.preserveLastMessages));
  }

  return DEFAULT_PRESERVE_LAST_MESSAGES;
};

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(1, maxLength - 3))}...`;
};

const isHistorySummaryMessage = (message: AgentLoopMessage): boolean =>
  message.role === 'system' && message.content.startsWith(HISTORY_SUMMARY_MARKER);

const estimateMessageChars = (messages: AgentLoopMessage[]): number =>
  messages.reduce((total, message) => total + message.role.length + message.content.length + 8, 0);

const countPinnedLeadingMessages = (messages: AgentLoopMessage[]): number => {
  let count = 0;

  for (const message of messages) {
    if (message.role !== 'system' || isHistorySummaryMessage(message)) {
      break;
    }

    count += 1;
  }

  return count;
};

const parseAssistantToolCallSummary = (content: string): string | null => {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const action = typeof parsed.action === 'string' ? parsed.action.trim() : '';
    if (action !== 'tool_call') {
      return null;
    }

    const toolName = typeof parsed.tool_name === 'string'
      ? parsed.tool_name.trim()
      : (typeof parsed.toolName === 'string' ? parsed.toolName.trim() : '');
    const parameters = parsed.parameters ?? parsed.params ?? {};
    const thinking = typeof parsed.thinking === 'string' ? normalizeText(parsed.thinking) : '';

    return truncateText(
      `assistant called ${toolName || 'unknown_tool'} with ${safeJsonStringify(parameters)}${thinking ? ` | thinking: ${thinking}` : ''}`,
      MAX_SUMMARY_LINE_CHARS,
    );
  } catch {
    return null;
  }
};

const summarizeMessage = (message: AgentLoopMessage): string => {
  if (message.role === 'assistant') {
    const toolCallSummary = parseAssistantToolCallSummary(message.content);
    if (toolCallSummary) {
      return toolCallSummary;
    }
  }

  if (message.role === 'user' && message.content.startsWith('工具执行结果:')) {
    return truncateText(
      `tool result: ${normalizeText(message.content.slice('工具执行结果:'.length))}`,
      MAX_SUMMARY_LINE_CHARS,
    );
  }

  const normalizedContent = normalizeText(
    isHistorySummaryMessage(message)
      ? message.content.slice(HISTORY_SUMMARY_MARKER.length)
      : message.content,
  );

  return truncateText(`${message.role}: ${normalizedContent}`, MAX_SUMMARY_LINE_CHARS);
};

const resolveHistoryCompactionOptions = (
  options?: AgentLoopHistoryCompactionOptions,
): Required<Omit<AgentLoopHistoryCompactionOptions, 'summarizeMessages'>> & Pick<AgentLoopHistoryCompactionOptions, 'summarizeMessages'> => ({
  maxMessageCount: Math.max(6, Math.floor(options?.maxMessageCount ?? DEFAULT_MAX_MESSAGE_COUNT)),
  maxContextChars: Math.max(4000, Math.floor(options?.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS)),
  preserveLastRounds: typeof options?.preserveLastRounds === 'number' && Number.isFinite(options.preserveLastRounds)
    ? Math.max(1, Math.floor(options.preserveLastRounds))
    : DEFAULT_PRESERVE_LAST_ROUNDS,
  preserveLastMessages: resolvePreservedTailMessages(options),
  maxSummaryChars: Math.max(400, Math.floor(options?.maxSummaryChars ?? DEFAULT_MAX_SUMMARY_CHARS)),
  summaryLabel: normalizeText(options?.summaryLabel ?? '') || DEFAULT_SUMMARY_LABEL,
  summarizeMessages: options?.summarizeMessages,
});

export class AgentLoopMessageHistory {
  private readonly messages: AgentLoopMessage[];

  constructor(messages: AgentLoopMessage[]) {
    this.messages = cloneMessages(messages);
  }

  snapshot(): AgentLoopMessage[] {
    return cloneMessages(this.messages);
  }

  createCheckpoint(nextIteration: number, modelCallsUsed: number = 0): AgentLoopCheckpoint {
    return {
      messages: this.snapshot(),
      nextIteration,
      modelCallsUsed,
    };
  }

  appendAssistantToolCall(toolCall: AgentLoopToolCall): void {
    this.messages.push({
      role: 'assistant',
      content: safeJsonStringify({
        action: 'tool_call',
        tool_name: toolCall.toolName,
        parameters: toolCall.parameters,
        thinking: toolCall.thinking,
      }),
    });
  }

  appendToolResult(formattedResult: string): void {
    this.messages.push({
      role: 'user',
      content: `工具执行结果:\n${formattedResult}`,
    });
  }

  async compactIfNeeded(
    iteration: number | null,
    options?: AgentLoopHistoryCompactionOptions,
  ): Promise<AgentLoopHistoryCompactedEvent | null> {
    const resolvedOptions = resolveHistoryCompactionOptions(options);
    const originalCharCount = estimateMessageChars(this.messages);
    const exceedsLimit = this.messages.length > resolvedOptions.maxMessageCount
      || originalCharCount > resolvedOptions.maxContextChars;

    if (!exceedsLimit) {
      return null;
    }

    const pinnedLeadingMessages = countPinnedLeadingMessages(this.messages);
    if (this.messages.length <= pinnedLeadingMessages + 2) {
      return null;
    }

    const availableTailSlots = Math.max(1, this.messages.length - pinnedLeadingMessages - 1);
    const tailCount = Math.min(resolvedOptions.preserveLastMessages, availableTailSlots);
    const compactStart = pinnedLeadingMessages;
    const compactEnd = this.messages.length - tailCount;

    if (compactEnd <= compactStart) {
      return null;
    }

    const messagesToCompact = this.messages.slice(compactStart, compactEnd);
    const summaryBody = normalizeMultilineText(
      resolvedOptions.summarizeMessages
        ? await resolvedOptions.summarizeMessages(cloneMessages(messagesToCompact))
        : messagesToCompact.map(message => `- ${summarizeMessage(message)}`).join('\n'),
    );

    const summaryMessage: AgentLoopMessage = {
      role: 'system',
      content: truncateText(
        `${HISTORY_SUMMARY_MARKER}\n${resolvedOptions.summaryLabel}\n${summaryBody || '- no significant prior context'}`,
        resolvedOptions.maxSummaryChars,
      ),
    };

    const originalMessageCount = this.messages.length;
    this.messages.splice(compactStart, messagesToCompact.length, summaryMessage);

    return {
      iteration,
      originalMessageCount,
      compactedMessageCount: this.messages.length,
      originalCharCount,
      compactedCharCount: estimateMessageChars(this.messages),
      summaryMessage: { ...summaryMessage },
    };
  }
}
