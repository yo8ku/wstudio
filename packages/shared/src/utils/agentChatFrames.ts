/**
 * Shared helpers that normalize turn items into renderer-friendly stream frames.
 */

import type {
  AgentChatTurnFrame,
  AgentChatTurnFrameBase,
  AgentChatTurnFrameKind,
  AgentChatTurnItem,
  AgentChatTurnItemMetadata,
} from '../types/agentChat';

const getMetadataString = (
  metadata: AgentChatTurnItemMetadata | undefined,
  key: 'streamId' | 'responseKey' | 'toolName' | 'toolCallId',
): string | null => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const getMetadataNumber = (
  metadata: AgentChatTurnItemMetadata | undefined,
  key: 'iteration' | 'nextIteration',
): number | null => {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getMetadataBoolean = (
  metadata: AgentChatTurnItemMetadata | undefined,
  key: 'resumed' | 'success',
): boolean | undefined => {
  const value = metadata?.[key];
  return typeof value === 'boolean' ? value : undefined;
};

const parseParamsRecord = (value: string | null): Record<string, unknown> => {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const createBaseFrame = <TKind extends AgentChatTurnFrameKind>(
  item: AgentChatTurnItem,
  kind: TKind,
): AgentChatTurnFrameBase & { kind: TKind } => ({
  id: item.id,
  threadId: item.threadId,
  turnId: item.turnId,
  itemId: item.id,
  kind,
  title: item.title,
  text: item.text,
  status: item.status,
  createdAt: item.createdAt,
  streamKind: item.metadata?.streamKind,
  streamId: getMetadataString(item.metadata, 'streamId'),
  responseKey: getMetadataString(item.metadata, 'responseKey'),
  iteration: getMetadataNumber(item.metadata, 'iteration'),
});

const resolveToolName = (item: AgentChatTurnItem): string | null => {
  const metadataToolName = getMetadataString(item.metadata, 'toolName');
  if (metadataToolName) {
    return metadataToolName;
  }

  return item.title?.trim() ? item.title.trim() : null;
};

const buildFrameFromItem = (item: AgentChatTurnItem): AgentChatTurnFrame | null => {
  switch (item.kind) {
    case 'task':
      return createBaseFrame(item, 'task');
    case 'step':
      return {
        ...createBaseFrame(item, 'progress'),
        resumed: getMetadataBoolean(item.metadata, 'resumed'),
        nextIteration: getMetadataNumber(item.metadata, 'nextIteration'),
      };
    case 'thinking':
      return item.text
        ? {
            ...createBaseFrame(item, 'reasoning_delta'),
            text: item.text,
          }
        : null;
    case 'tool_call': {
      const toolName = resolveToolName(item) || 'tool';
      return {
        ...createBaseFrame(item, 'tool_started'),
        toolName,
        toolCallId: getMetadataString(item.metadata, 'toolCallId'),
        params: parseParamsRecord(item.text),
      };
    }
    case 'tool_result': {
      const toolName = resolveToolName(item) || 'tool';
      return {
        ...createBaseFrame(item, 'tool_finished'),
        toolName,
        toolCallId: getMetadataString(item.metadata, 'toolCallId'),
        success: true,
        resultText: item.text ?? '',
      };
    }
    case 'content':
      if (!item.text) {
        return null;
      }
      if (item.status === 'completed') {
        return {
          ...createBaseFrame(item, 'final_answer'),
          text: item.text,
        };
      }
      return {
        ...createBaseFrame(item, 'assistant_delta'),
        text: item.text,
      };
    case 'error': {
      const toolName = resolveToolName(item);
      const toolCallId = getMetadataString(item.metadata, 'toolCallId');
      if (toolName && (toolCallId || item.metadata?.streamKind === 'tool_result' || item.metadata?.streamKind === 'error')) {
        return {
          ...createBaseFrame(item, 'tool_finished'),
          toolName,
          toolCallId,
          success: false,
          resultText: item.text ?? '',
        };
      }

      return {
        ...createBaseFrame(item, 'error'),
        text: item.text ?? item.title ?? 'Agent error',
        toolName,
        toolCallId,
      };
    }
    default:
      return null;
  }
};

export const buildAgentChatTurnFrames = (
  items: AgentChatTurnItem[],
): AgentChatTurnFrame[] => items
  .map(item => buildFrameFromItem(item))
  .filter((frame): frame is AgentChatTurnFrame => frame !== null);
