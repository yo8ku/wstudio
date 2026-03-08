/**
 * Flow classification and render-section helpers for AI chat timeline messages.
 */

import type { AgentTaskType } from '../../../services/agent/types';

export interface ToolLog {
  uiId: string;
  toolCallId?: string;
  name: string;
  label: string;
  detail?: string;
  summary?: string;
  command?: string;
  output?: string;
  status: 'pending' | 'success' | 'error';
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
  source: 'agent' | 'plan';
  stepId?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string; key?: string; isStreaming?: boolean }
  | { type: 'tool'; tool: ToolLog }
  | { type: 'act'; act: ActLog }
  | { type: 'todo'; key: string; title: string; items: TodoItemView[]; isStreaming?: boolean }
  | { type: 'decomposition'; title: string; content: string; key: string; isStreaming?: boolean }
  | { type: 'thinking'; content: string; isThinking: boolean; elapsedSeconds?: number };

export type MessageFlowKind = 'conversation' | 'agent_task';

export interface MessageFlowContext {
  hasCurrentFile: boolean;
  hasSelectedFiles: boolean;
  hasSelectedKnowledgeBases: boolean;
  hasSelectedForms: boolean;
  hasSelectedSkills: boolean;
}

export interface MessageFlowDecision {
  kind: MessageFlowKind;
  taskType: AgentTaskType;
  reason:
    | 'smalltalk'
    | 'meta_query'
    | 'conceptual_question'
    | 'workspace_question'
    | 'workspace_execution'
    | 'workspace_default';
  confidence: 'low' | 'medium' | 'high';
}

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

const EDIT_TASK_HINT_REGEX = /(?:修改|改写|重写|润色|优化|修复|编辑|重构|replace|edit|rewrite|revise|refactor|fix|patch|adjust|update)/i;
const WRITE_TASK_HINT_REGEX = /(?:写作|撰写|创作|生成|创建|新建|草拟|实现|开发|write|draft|compose|create|generate|implement|build)/i;
const QUERY_TASK_HINT_REGEX = /(?:读取|查看|搜索|检索|列出|总结|归纳|分析|解释|提取|查询|统计|对比|review|inspect|read|search|query|list|count|compare|summari[sz]e|analy[sz]e|explain)/i;
const NON_TASK_SMALLTALK_REGEX = /^(?:你好|您好|嗨|哈喽|嘿|在吗|在嘛|hello|hi|hey|thanks|thank you|thx|谢谢|多谢|好的|ok|okay|收到|明白了|嗯|哦|噢)\s*[!！?.。~～]*$/i;
const NON_TASK_META_QUERY_REGEX = /(?:你是什么模型|你是啥模型|你用的什么模型|当前是什么模型|现在是什么模型|你是谁|你能做什么|你会什么|what\s+model\s+are\s+you|which\s+model\s+are\s+you|who\s+are\s+you|what\s+can\s+you\s+do)/i;
const QUESTION_STYLE_REGEX = /(?:\?|？|什么|为什么|如何|怎么|哪些|区别|原理|介绍|解释|是不是|能否|what|why|how|which|difference|compare|explain)/i;
const WORKSPACE_NOUN_REGEX = /(?:文件|文件夹|目录|项目|仓库|代码|代码库|标签页|当前文件|当前标签页|知识库|表单|workspace|repo|repository|codebase|file|files|folder|directory|directories)/i;
const DEICTIC_CONTEXT_REGEX = /(?:这个|这些|当前|上面|下面|选中的|引用的|attached|selected|current|this|these)/i;

const normalizeText = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const hasContextHint = (context: MessageFlowContext): boolean =>
  context.hasCurrentFile
  || context.hasSelectedFiles
  || context.hasSelectedKnowledgeBases
  || context.hasSelectedForms
  || context.hasSelectedSkills;

const inferAgentTaskType = (
  input: string,
  context: MessageFlowContext,
): AgentTaskType => {
  const normalized = input.trim();
  if (!normalized) {
    return 'write';
  }

  if (EDIT_TASK_HINT_REGEX.test(normalized)) {
    return 'edit';
  }
  if (WRITE_TASK_HINT_REGEX.test(normalized)) {
    return 'write';
  }
  if (QUERY_TASK_HINT_REGEX.test(normalized)) {
    return 'query';
  }
  if (context.hasCurrentFile) {
    return 'edit';
  }
  if (hasContextHint(context)) {
    return 'query';
  }
  return 'write';
};

export const classifyMessageFlow = (
  input: string,
  context: MessageFlowContext,
): MessageFlowDecision => {
  const normalized = input.trim();
  const hasContext = hasContextHint(context);
  const asksQuestion = QUESTION_STYLE_REGEX.test(normalized);
  const mentionsWorkspace = WORKSPACE_NOUN_REGEX.test(normalized);
  const referencesCurrentContext = DEICTIC_CONTEXT_REGEX.test(normalized);
  const taskType = inferAgentTaskType(normalized, context);

  if (NON_TASK_SMALLTALK_REGEX.test(normalized)) {
    return {
      kind: 'conversation',
      taskType: 'query',
      reason: 'smalltalk',
      confidence: 'high',
    };
  }

  if (normalized.length <= 96 && NON_TASK_META_QUERY_REGEX.test(normalized)) {
    return {
      kind: 'conversation',
      taskType: 'query',
      reason: 'meta_query',
      confidence: 'high',
    };
  }

  if (EDIT_TASK_HINT_REGEX.test(normalized) || WRITE_TASK_HINT_REGEX.test(normalized)) {
    return {
      kind: 'agent_task',
      taskType,
      reason: 'workspace_execution',
      confidence: 'high',
    };
  }

  if (hasContext && QUERY_TASK_HINT_REGEX.test(normalized)) {
    return {
      kind: 'agent_task',
      taskType,
      reason: 'workspace_question',
      confidence: 'high',
    };
  }

  if (hasContext && asksQuestion && (mentionsWorkspace || referencesCurrentContext)) {
    return {
      kind: 'agent_task',
      taskType,
      reason: 'workspace_question',
      confidence: 'medium',
    };
  }

  if (!hasContext && asksQuestion) {
    return {
      kind: 'conversation',
      taskType: 'query',
      reason: 'conceptual_question',
      confidence: 'high',
    };
  }

  if (!hasContext && normalized.length <= 80 && !mentionsWorkspace) {
    return {
      kind: 'conversation',
      taskType: 'query',
      reason: 'conceptual_question',
      confidence: 'medium',
    };
  }

  if (hasContext) {
    return {
      kind: 'agent_task',
      taskType,
      reason: 'workspace_default',
      confidence: 'low',
    };
  }

  return {
    kind: 'conversation',
    taskType: 'query',
    reason: 'conceptual_question',
    confidence: 'low',
  };
};

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
  updates?: {
    detail?: string;
    command?: string;
    output?: string;
  }
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
  }
  return nextTool;
};

export const resolvePendingToolLogBlocks = (
  blocks: ContentBlock[],
  toolName: string,
  toolCallId: string | undefined,
  status: ToolLog['status'],
  summary?: string,
  updates?: {
    detail?: string;
    command?: string;
    output?: string;
  }
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
  updates?: {
    detail?: string;
    command?: string;
    output?: string;
  }
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
