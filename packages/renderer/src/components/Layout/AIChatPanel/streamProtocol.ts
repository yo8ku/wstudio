/**
 * Render-section helpers for AI chat timeline messages.
 */

export interface ToolLog {
  uiId: string;
  toolCallId?: string;
  name: string;
  label: string;
  detail?: string;
  summary?: string;
  command?: string;
  output?: string;
  paramsText?: string;
  resultText?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  primaryPath?: string;
  changedFiles?: string[];
  status: 'pending' | 'success' | 'error';
}

interface ToolLogUpdates {
  detail?: string;
  command?: string;
  output?: string;
  paramsText?: string;
  resultText?: string;
  finishedAt?: number;
  durationMs?: number;
  primaryPath?: string;
  changedFiles?: string[];
}

export interface ActLog {
  id: string;
  ts: number;
  key?: string;
  kind: 'status' | 'step' | 'tool' | 'stream' | 'error';
  title: string;
  detail?: string;
  status: 'info' | 'pending' | 'running' | 'success' | 'error';
}

export type TodoItemStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItemView {
  id: string;
  content: string;
  status: TodoItemStatus;
  source: 'assistant' | 'plan';
  stepId?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string; key?: string; isStreaming?: boolean }
  | { type: 'tool'; tool: ToolLog }
  | { type: 'act'; act: ActLog }
  | { type: 'todo'; key: string; title: string; items: TodoItemView[]; isStreaming?: boolean }
  | { type: 'decomposition'; title: string; content: string; key: string; isStreaming?: boolean }
  | { type: 'thinking'; content: string; isThinking: boolean; elapsedSeconds?: number };

export interface AssistantMessageRenderSections {
  todoBlocks: Extract<ContentBlock, { type: 'todo' }>[]; 
  decompositionBlocks: Extract<ContentBlock, { type: 'decomposition' }>[]; 
  thinkingBlock: Extract<ContentBlock, { type: 'thinking' }> | null;
  progressTextBlocks: Extract<ContentBlock, { type: 'text' }>[];
  timelineBlocks: Array<Extract<ContentBlock, { type: 'act' }> | Extract<ContentBlock, { type: 'tool' }>>;
  finalText: string;
  hasTextContent: boolean;
  isTextStreaming: boolean;
}

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const mergeTextBlocks = (
  blocks: Extract<ContentBlock, { type: 'text' }>[],
  nextBlock: Extract<ContentBlock, { type: 'text' }>,
): void => {
  const lastBlock = blocks[blocks.length - 1];
  if (!lastBlock) {
    blocks.push({ ...nextBlock });
    return;
  }

  if (lastBlock.key && nextBlock.key && lastBlock.key === nextBlock.key) {
    lastBlock.text += nextBlock.text;
    lastBlock.isStreaming = !!(lastBlock.isStreaming || nextBlock.isStreaming);
    return;
  }

  if (normalizeText(lastBlock.text) === normalizeText(nextBlock.text)) {
    lastBlock.isStreaming = !!(lastBlock.isStreaming || nextBlock.isStreaming);
    return;
  }

  blocks.push({ ...nextBlock });
};

export const appendActLogBlock = (
  blocks: ContentBlock[],
  act: ActLog,
): ContentBlock[] => [...blocks, { type: 'act', act }];

export const upsertActLogBlock = (
  blocks: ContentBlock[],
  act: ActLog,
): ContentBlock[] => {
  const nextBlocks = [...blocks];
  const index = nextBlocks.findIndex(block =>
    block.type === 'act' && block.act.key && act.key && block.act.key === act.key
  );
  if (index >= 0) {
    nextBlocks[index] = {
      type: 'act',
      act,
    };
    return nextBlocks;
  }
  return [...nextBlocks, { type: 'act', act }];
};

export const upsertTodoBlock = (
  blocks: ContentBlock[],
  key: string,
  title: string,
  items: TodoItemView[],
  isStreaming: boolean,
): ContentBlock[] => {
  const nextBlocks = [...blocks];
  const nextBlock: Extract<ContentBlock, { type: 'todo' }> = {
    type: 'todo',
    key,
    title,
    items,
    isStreaming,
  };
  const index = nextBlocks.findIndex(block => block.type === 'todo' && block.key === key);
  if (index >= 0) {
    nextBlocks[index] = nextBlock;
    return nextBlocks;
  }
  return [...nextBlocks, nextBlock];
};

export const upsertThinkingBlock = (
  blocks: ContentBlock[],
  chunk: string,
  isThinking: boolean,
): ContentBlock[] => {
  if (!chunk) {
    return blocks;
  }

  const nextBlocks = [...blocks];
  const index = nextBlocks.findIndex(block => block.type === 'thinking');
  if (index >= 0) {
    const existingBlock = nextBlocks[index];
    if (existingBlock.type === 'thinking') {
      nextBlocks[index] = {
        ...existingBlock,
        content: `${existingBlock.content}${chunk}`,
        isThinking,
      };
    }
    return nextBlocks;
  }

  return [{
    type: 'thinking',
    content: chunk,
    isThinking,
  }, ...nextBlocks];
};

export const appendToolLogBlock = (
  blocks: ContentBlock[],
  tool: ToolLog,
): ContentBlock[] => [...blocks, { type: 'tool', tool }];

const resolvePendingTool = (
  tool: ToolLog,
  toolName: string,
  toolCallId: string | undefined,
  status: ToolLog['status'],
  summary?: string,
  updates?: ToolLogUpdates,
): ToolLog => {
  const nextTool: ToolLog = {
    ...tool,
    status,
    summary: summary ?? tool.summary,
  };
  if (updates) {
    if (typeof updates.detail === 'string') {
      nextTool.detail = updates.detail;
    }
    if (typeof updates.command === 'string') {
      nextTool.command = updates.command;
    }
    if (typeof updates.output === 'string') {
      nextTool.output = updates.output;
    }
    if (typeof updates.paramsText === 'string') {
      nextTool.paramsText = updates.paramsText;
    }
    if (typeof updates.resultText === 'string') {
      nextTool.resultText = updates.resultText;
    }
    if (typeof updates.finishedAt === 'number' && Number.isFinite(updates.finishedAt)) {
      nextTool.finishedAt = updates.finishedAt;
    }
    if (typeof updates.durationMs === 'number' && Number.isFinite(updates.durationMs)) {
      nextTool.durationMs = updates.durationMs;
    } else if (
      typeof nextTool.startedAt === 'number'
      && typeof updates.finishedAt === 'number'
      && Number.isFinite(nextTool.startedAt)
      && Number.isFinite(updates.finishedAt)
    ) {
      nextTool.durationMs = Math.max(0, updates.finishedAt - nextTool.startedAt);
    }
    if (typeof updates.primaryPath === 'string') {
      nextTool.primaryPath = updates.primaryPath;
    }
    if (Array.isArray(updates.changedFiles)) {
      nextTool.changedFiles = updates.changedFiles;
    }
  }
  return nextTool;
};

export const resolvePendingToolLogBlocks = (
  blocks: ContentBlock[],
  toolName: string,
  toolCallId: string | undefined,
  status: ToolLog['status'],
  summary?: string,
  updates?: ToolLogUpdates,
): ContentBlock[] => {
  let resolved = false;
  return blocks.map(block => {
    if (block.type !== 'tool') {
      return block;
    }

    const matchesTool = toolCallId
      ? block.tool.toolCallId === toolCallId
      : block.tool.name === toolName;
    if (!resolved && matchesTool && block.tool.status === 'pending') {
      resolved = true;
      return {
        type: 'tool' as const,
        tool: resolvePendingTool(block.tool, toolName, toolCallId, status, summary, updates),
      };
    }
    return block;
  });
};

export const resolvePendingToolCalls = (
  tools: ToolLog[],
  toolName: string,
  toolCallId: string | undefined,
  status: ToolLog['status'],
  summary?: string,
  updates?: ToolLogUpdates,
): ToolLog[] => {
  let resolved = false;
  return tools.map(tool => {
    const matchesTool = toolCallId
      ? tool.toolCallId === toolCallId
      : tool.name === toolName;
    if (!resolved && matchesTool && tool.status === 'pending') {
      resolved = true;
      return resolvePendingTool(tool, toolName, toolCallId, status, summary, updates);
    }
    return tool;
  });
};

export const upsertTextBlock = (
  blocks: ContentBlock[],
  key: string,
  text: string,
  options?: {
    mode?: 'append' | 'replace';
    isStreaming?: boolean;
  }
): ContentBlock[] => {
  const nextBlocks = [...blocks];
  const blockIndex = nextBlocks.findIndex(
    block => block.type === 'text' && block.key === key
  );
  const mode = options?.mode ?? 'append';
  const isStreaming = options?.isStreaming ?? false;

  if (blockIndex >= 0) {
    const existingBlock = nextBlocks[blockIndex];
    if (existingBlock.type === 'text') {
      nextBlocks[blockIndex] = {
        type: 'text',
        key,
        text: mode === 'replace' ? text : `${existingBlock.text}${text}`,
        isStreaming,
      };
    }
    return nextBlocks;
  }

  return [...nextBlocks, {
    type: 'text',
    key,
    text,
    isStreaming,
  }];
};

export const finalizeTextBlock = (
  blocks: ContentBlock[],
  key: string,
): ContentBlock[] => blocks.map(block => (
  block.type === 'text' && block.key === key
    ? { ...block, isStreaming: false }
    : block
));

export const buildAssistantRenderSections = (
  blocks: ContentBlock[],
): AssistantMessageRenderSections => {
  const todoBlocks: Extract<ContentBlock, { type: 'todo' }>[] = [];
  const decompositionBlocks: Extract<ContentBlock, { type: 'decomposition' }>[] = [];
  const timelineBlocks: Array<Extract<ContentBlock, { type: 'act' }> | Extract<ContentBlock, { type: 'tool' }>> = [];
  const textBlocks: Extract<ContentBlock, { type: 'text' }>[] = [];
  let thinkingBlock: Extract<ContentBlock, { type: 'thinking' }> | null = null;

  for (const block of blocks) {
    if (block.type === 'todo') {
      todoBlocks.push(block);
      continue;
    }

    if (block.type === 'decomposition') {
      decompositionBlocks.push(block);
      continue;
    }

    if (block.type === 'thinking') {
      if (!thinkingBlock) {
        thinkingBlock = { ...block };
      } else {
        const previousThinkingBlock: Extract<ContentBlock, { type: 'thinking' }> = thinkingBlock;
        thinkingBlock = {
          ...previousThinkingBlock,
          content: `${previousThinkingBlock.content}${block.content}`,
          isThinking: previousThinkingBlock.isThinking || block.isThinking,
          elapsedSeconds: block.elapsedSeconds ?? previousThinkingBlock.elapsedSeconds,
        };
      }
      continue;
    }

    if (block.type === 'act' || block.type === 'tool') {
      timelineBlocks.push(block);
      continue;
    }

    if (block.type === 'text') {
      mergeTextBlocks(textBlocks, block);
    }
  }

  const latestTextBlock = [...textBlocks]
    .reverse()
    .find(block => normalizeText(block.text).length > 0) ?? null;
  const latestTextIndex = latestTextBlock
    ? textBlocks.findIndex(block => block === latestTextBlock)
    : -1;
  const progressTextBlocks = latestTextIndex > 0
    ? textBlocks.slice(0, latestTextIndex)
    : [];

  return {
    todoBlocks,
    decompositionBlocks,
    thinkingBlock,
    progressTextBlocks,
    timelineBlocks,
    finalText: latestTextBlock?.text.trim() ?? '',
    hasTextContent: !!latestTextBlock,
    isTextStreaming: !!latestTextBlock?.isStreaming,
  };
};
