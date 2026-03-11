/**
 * Main-process single-track Agent runtime implementing a basic ReAct loop with local tools.
 */

import { randomUUID } from 'crypto';
import { exec, type ExecException } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';
import { parse as parseJsonc } from 'jsonc-parser';
import {
  assessCommandSecurity,
  buildForcedFinalAnswerMessages,
  createAgentLoopInitialMessages,
  createBuiltinWorkspaceToolExecutor,
  createWorkspaceCustomToolRegistry,
  formatAgentToolDefinitionsForPrompt,
  runAgenticLoop,
  runMultiAgentWorkflow,
  type AgentLoopMessage,
  type AgentExecutableToolDefinition,
  type AgentToolDefinition,
  type AgentToolExecutionResult,
  type AgentToolInputSchema,
  type AgentToolSchema,
} from '@note-studio/agent';
import type {
  AgentChatApprovalResponse,
  AgentChatApprovalRequestType,
  AgentChatAppendTurnItemsInput,
  AgentChatRunTurnInput,
  AgentChatRunTurnResult,
  AgentChatResumeTurnInput,
  AgentChatServerRequest,
  AgentChatTurnItemMetadata,
  AgentChatTurnItemInput,
  AgentChatTurnSummary,
} from '@note-studio/shared';
import {
  applyApprovalDecisionsToToolParams,
  buildApprovalChangeSet,
  buildExecutionChangeSet,
  collectWriteBeforeContents,
} from './AgentChangeSetService';
import { agentExecutionJournalService } from './AgentExecutionJournalService';
import { agentChatRuntime } from './AgentChatRuntime';
import { builtinAI } from '../builtinAIInstance';
import { getFormDatabase, type FormData, type FormQueryWhere } from '../FormDatabase';
import { resolveProjectPath } from '../../utils/projectRoot';

type RuntimeMessage = AgentLoopMessage;

type AgentDecisionAction = 'tool_call' | 'final';

interface AgentDecision {
  action: AgentDecisionAction;
  thinking: string;
  toolName?: string;
  parameters?: Record<string, unknown>;
  finalAnswer?: string;
}

type JsonSchemaProperty = AgentToolSchema;

type JsonSchemaDefinition = AgentToolInputSchema;

type MainAgentToolResult = AgentToolExecutionResult;

interface MainAgentToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchemaDefinition;
  requiresConfirmation: boolean;
  requestType?: AgentChatApprovalRequestType;
  execute: (params: Record<string, unknown>, context: { workspacePath: string }) => Promise<MainAgentToolResult>;
}

interface MainAgentActiveRun {
  executionId: string;
  promise: Promise<void>;
}

interface MainAgentTurnCheckpoint {
  messages: RuntimeMessage[];
  nextIteration: number;
  modelCallsUsed: number;
}

interface MainAgentTurnExecutionState {
  input: AgentChatRunTurnInput;
  executionId: string;
  checkpoint: MainAgentTurnCheckpoint | null;
}

const adaptAgentToolDefinition = (
  tool: AgentExecutableToolDefinition,
): MainAgentToolDefinition => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.input_schema,
  requiresConfirmation: tool.requiresConfirmation === true,
  requestType: tool.requestType as AgentChatApprovalRequestType | undefined,
  execute: tool.execute,
});

const DEFAULT_MAX_ITERATIONS = 8;
const MAX_MODEL_CALLS_LIMIT = 16;
const MAX_TOOL_RESULT_CHARS = 12000;
const MAX_FINAL_MESSAGE_CHARS = 24000;
const MAX_CONSOLE_LOG_CHARS = 4000;
const MAX_LIST_ENTRIES = 200;
const MAX_LIST_DEPTH = 4;
const MAX_FILE_CHARS = 24000;
const MAX_BUFFER = 1024 * 1024;
const ALLOWED_WRITE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.xml',
  '.svg',
  '.vue',
  '.py',
  '.rb',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.rs',
  '.sh',
  '.bat',
]);
const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])\.env(\.|$|[\\/])/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /password/i,
  /secret/i,
];
const FORBIDDEN_COMMANDS: RegExp[] = [
  /rm\s+-rf\s+\//i,
  /format\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rmdir\s+\/s\s+\/q\s+[a-z]:\\/i,
];
const FORM_LOOKUP_HINT_REGEX = /(?:表单|表格|表名|数据表|表里|表中|字段|记录|form|forms|table|tables|row|rows|column|columns)/i;
const FORM_FILE_SEARCH_COMMAND_REGEX = /(?:^|\s)(?:grep|rg|ripgrep|findstr|find|dir|ls|Get-ChildItem|Select-String)(?:\s|$)/i;
const CJK_CHAR_REGEX = /[\u3400-\u9FFF]/g;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const UTF8_OUTPUT_HINT_REGEX = /(UTF8Encoding|OutputEncoding|chcp\s+65001|encoding\s*=\s*['"]?utf-?8['"]?)/i;

class TurnInterruptedError extends Error {
  constructor() {
    super('Agent turn interrupted');
    this.name = 'TurnInterruptedError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
};

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const truncateConsoleText = (value: string, maxLength: number = MAX_CONSOLE_LOG_CHARS): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars]`;
};

const formatConsolePayload = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return truncateConsoleText(value);
  }

  if (Array.isArray(value)) {
    return value.map(item => formatConsolePayload(item));
  }

  if (isRecord(value)) {
    const formatted: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      formatted[key] = formatConsolePayload(item);
    }
    return formatted;
  }

  return value;
};

const formatMessagesForConsole = (messages: RuntimeMessage[]): Array<Record<string, unknown>> => messages.map((message, index) => ({
  index: index + 1,
  role: message.role,
  content: truncateConsoleText(message.content),
}));

const normalizeDecisionJsonCandidate = (value: string): string => {
  const quoteChars = new Set(['"', '\'', '“', '”', '‘', '’']);
  const getNextSignificantChar = (source: string, startIndex: number): string => {
    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index];
      if (!/\s/.test(char)) {
        return char;
      }
    }
    return '';
  };

  let normalized = '';
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (!inString) {
      if (quoteChars.has(char)) {
        inString = true;
        normalized += '"';
        continue;
      }

      if (char === '，') {
        normalized += ',';
        continue;
      }
      if (char === '：') {
        normalized += ':';
        continue;
      }
      if (char === '；') {
        normalized += ';';
        continue;
      }
      if (char === '\u00A0') {
        normalized += ' ';
        continue;
      }

      normalized += char;
      continue;
    }

    if (quoteChars.has(char)) {
      const nextSignificantChar = getNextSignificantChar(value, index + 1);
      if (!nextSignificantChar || [':', '：', ',', '，', '}', ']'].includes(nextSignificantChar)) {
        inString = false;
        normalized += '"';
        continue;
      }

      normalized += '\\"';
      continue;
    }

    if (char === '\\') {
      normalized += '\\\\';
      continue;
    }

    if (char === '\n') {
      normalized += '\\n';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    normalized += char;
  }

  if (inString) {
    normalized += '"';
  }

  return normalized;
};

const cloneRuntimeMessages = (messages: RuntimeMessage[]): RuntimeMessage[] =>
  messages.map(message => ({ ...message }));

const toPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
};

const countOccurrences = (source: string, search: string): number => {
  if (!search) {
    return 0;
  }

  let count = 0;
  let index = 0;
  while (true) {
    const nextIndex = source.indexOf(search, index);
    if (nextIndex < 0) {
      return count;
    }

    count += 1;
    index = nextIndex + search.length;
  }
};

const normalizeFormLookupKey = (value: string): string =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const splitFormLookupTerms = (value: string): string[] =>
  normalizeFormLookupKey(value)
    .replace(/["'`]+/g, ' ')
    .split(/[\s,，、|/\\:：;；(){}\[\]]+/)
    .map(term => term.trim())
    .filter(Boolean);

const scoreFormNameMatch = (name: string, query: string): number => {
  const normalizedName = normalizeFormLookupKey(name);
  const normalizedQuery = normalizeFormLookupKey(query);
  if (!normalizedName || !normalizedQuery) {
    return 0;
  }

  if (normalizedName === normalizedQuery) {
    return 200;
  }

  let score = 0;
  if (normalizedName.includes(normalizedQuery)) {
    score += 120;
  }

  const terms = splitFormLookupTerms(normalizedQuery);
  for (const term of terms) {
    if (!term) {
      continue;
    }
    if (normalizedName.includes(term)) {
      score += term.length >= 3 ? 24 : 10;
    }
  }

  return score;
};

const findBestMatchingForm = (forms: FormData[], query: string): FormData | null => {
  const normalizedQuery = normalizeFormLookupKey(query);
  if (!normalizedQuery) {
    return null;
  }

  const exactMatch = forms.find(form => normalizeFormLookupKey(form.name) === normalizedQuery);
  if (exactMatch) {
    return exactMatch;
  }

  const ranked = forms
    .map(form => ({
      form,
      score: scoreFormNameMatch(form.name, normalizedQuery),
    }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.form ?? null;
};

const parseStringListArg = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeText(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n，、]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const scoreDecodedText = (text: string): number => {
  const cjkCount = (text.match(CJK_CHAR_REGEX) || []).length;
  const replacementCount = (text.match(REPLACEMENT_CHAR_REGEX) || []).length;
  const controlCount = (text.match(CONTROL_CHAR_REGEX) || []).length;
  return (cjkCount * 4) - (replacementCount * 10) - (controlCount * 2);
};

const decodeBufferWithEncoding = (buffer: Buffer, encoding: string): string | null => {
  try {
    return new TextDecoder(encoding as BufferEncoding, { fatal: false }).decode(buffer);
  } catch {
    return null;
  }
};

const decodeShellOutput = (value: string | Buffer | undefined, preferUtf8: boolean): string => {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value.length === 0) {
    return '';
  }

  const utf8Text = value.toString('utf8');
  if (preferUtf8) {
    return utf8Text;
  }

  const gbkText = decodeBufferWithEncoding(value, 'gbk');
  if (!gbkText) {
    return utf8Text;
  }

  return scoreDecodedText(gbkText) > scoreDecodedText(utf8Text)
    ? gbkText
    : utf8Text;
};

const isPathInsideBase = (targetPath: string, basePath: string): boolean => {
  const normalizedBasePath = path.resolve(basePath);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedBasePath, normalizedTargetPath);
  return relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

const containsForbiddenPath = (targetPath: string): boolean =>
  FORBIDDEN_PATH_PATTERNS.some(pattern => pattern.test(targetPath));

const resolveDisplayPath = (workspacePath: string, filePath: string): string => {
  const relativePath = path.relative(workspacePath, filePath);
  return relativePath && !relativePath.startsWith('..')
    ? relativePath
    : filePath;
};

function resolveToolPath(workspacePath: string, rawPath: string): string {
  const normalizedInput = normalizeText(rawPath);
  const normalizedWorkspacePath = path.resolve(workspacePath);
  if (!normalizedInput) {
    throw new Error('path is required');
  }

  const candidatePath = path.isAbsolute(normalizedInput)
    ? path.normalize(normalizedInput)
    : path.resolve(normalizedWorkspacePath, normalizedInput);

  if (!isPathInsideBase(candidatePath, normalizedWorkspacePath)) {
    throw new Error('path escapes workspace');
  }
  if (containsForbiddenPath(candidatePath)) {
    throw new Error('path is blocked by security policy');
  }

  return candidatePath;
}

function ensureWritablePath(filePath: string): void {
  const extension = path.extname(filePath).toLowerCase();
  if (!ALLOWED_WRITE_EXTENSIONS.has(extension)) {
    throw new Error(`writing ${extension || 'unknown'} files is not allowed`);
  }
}

async function listDirectoryEntries(
  rootPath: string,
  currentPath: string,
  recursive: boolean,
  maxDepth: number,
  entries: Array<Record<string, unknown>>,
  depth: number,
): Promise<void> {
  if (entries.length >= MAX_LIST_ENTRIES || depth > maxDepth) {
    return;
  }

  const dirEntries = await fsp.readdir(currentPath, { withFileTypes: true });
  const sortedEntries = [...dirEntries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (entries.length >= MAX_LIST_ENTRIES) {
      return;
    }

    const fullPath = path.join(currentPath, entry.name);
    if (containsForbiddenPath(fullPath)) {
      continue;
    }

    const stats = await fsp.stat(fullPath);
    entries.push({
      name: entry.name,
      path: resolveDisplayPath(rootPath, fullPath),
      kind: entry.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    });

    if (recursive && entry.isDirectory()) {
      await listDirectoryEntries(rootPath, fullPath, recursive, maxDepth, entries, depth + 1);
    }
  }
}

function parseDecision(raw: string): AgentDecision | null {
  const normalizedRaw = normalizeText(raw);
  if (!normalizedRaw) {
    return null;
  }

  const candidates: string[] = [normalizedRaw];
  const fencedRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fencedMatch = fencedRegex.exec(normalizedRaw);
  while (fencedMatch) {
    const candidate = normalizeText(fencedMatch[1]);
    if (candidate) {
      candidates.push(candidate);
    }
    fencedMatch = fencedRegex.exec(normalizedRaw);
  }

  const firstBraceIndex = normalizedRaw.indexOf('{');
  const lastBraceIndex = normalizedRaw.lastIndexOf('}');
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    candidates.push(normalizedRaw.slice(firstBraceIndex, lastBraceIndex + 1).trim());
  }

  for (const candidate of Array.from(new Set(candidates))) {
    const normalizedCandidate = normalizeDecisionJsonCandidate(candidate);
    try {
      const parsed = (() => {
        try {
          return JSON.parse(normalizedCandidate);
        } catch {
          return parseJsonc(normalizedCandidate);
        }
      })();
      if (!isRecord(parsed)) {
        continue;
      }

      const actionValue = normalizeText(parsed.action ?? parsed.type ?? parsed.mode).toLowerCase();
      const action: AgentDecisionAction = actionValue.includes('tool') ? 'tool_call' : 'final';
      const toolName = normalizeText(parsed.tool_name ?? parsed.toolName ?? parsed.tool);
      const parametersValue = parsed.parameters ?? parsed.params;
      const parameters = isRecord(parametersValue) ? parametersValue : {};

      if (action === 'tool_call' && !toolName) {
        continue;
      }

      return {
        action,
        thinking: normalizeText(parsed.thinking ?? parsed.reason ?? parsed.thought),
        toolName: toolName || undefined,
        parameters,
        finalAnswer: normalizeText(parsed.final_answer ?? parsed.finalAnswer ?? parsed.final ?? parsed.output) || undefined,
      };
    } catch {
      // Ignore invalid candidate and continue.
    }
  }

  return null;
}

export class MainAgentRuntime {
  private readonly activeRuns = new Map<string, MainAgentActiveRun>();
  private readonly executionStates = new Map<string, MainAgentTurnExecutionState>();
  private systemPromptCache: string | null = null;
  private readonly workspaceCustomToolRegistry = createWorkspaceCustomToolRegistry();

  private readonly toolDefinitions: MainAgentToolDefinition[] = [
    ...createBuiltinWorkspaceToolExecutor().listTools().map(adaptAgentToolDefinition),
    {
      name: 'list_files',
      description: '列出工作区中的目录内容，可选递归列出。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，可为相对工作区路径。缺省时使用工作区根目录。' },
          recursive: { type: 'boolean', description: '是否递归列出子目录。' },
          maxDepth: { type: 'number', description: `递归深度，最大 ${MAX_LIST_DEPTH}。` },
        },
      },
      requiresConfirmation: false,
      execute: async (params, context) => {
        const dirPath = normalizeText(params.path) || '.';
        const resolvedPath = resolveToolPath(context.workspacePath, dirPath);
        const stats = await fsp.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error('path is not a directory');
        }

        const recursive = params.recursive === true;
        const maxDepth = Math.min(MAX_LIST_DEPTH, toPositiveInteger(params.maxDepth, 2));
        const entries: Array<Record<string, unknown>> = [];
        await listDirectoryEntries(context.workspacePath, resolvedPath, recursive, maxDepth, entries, 0);
        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            entries,
            truncated: entries.length >= MAX_LIST_ENTRIES,
          },
        };
      },
    },
    {
      name: 'read_file',
      description: '读取工作区中的文件内容。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，可为相对工作区路径。' },
        },
        required: ['path'],
      },
      requiresConfirmation: false,
      execute: async (params, context) => {
        const resolvedPath = resolveToolPath(context.workspacePath, normalizeText(params.path));
        const stats = await fsp.stat(resolvedPath);
        if (!stats.isFile()) {
          throw new Error('path is not a file');
        }

        const content = await fsp.readFile(resolvedPath, 'utf8');
        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            content: truncateText(content, MAX_FILE_CHARS),
            truncated: content.length > MAX_FILE_CHARS,
            size: stats.size,
          },
        };
      },
    },
    {
      name: 'write_file',
      description: '写入或创建工作区文件。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          content: { type: 'string', description: '完整文件内容。' },
        },
        required: ['path', 'content'],
      },
      requiresConfirmation: true,
      requestType: 'file_write',
      execute: async (params, context) => {
        const resolvedPath = resolveToolPath(context.workspacePath, normalizeText(params.path));
        ensureWritablePath(resolvedPath);
        const content = typeof params.content === 'string' ? params.content : '';

        await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fsp.writeFile(resolvedPath, content, 'utf8');

        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            bytesWritten: Buffer.byteLength(content, 'utf8'),
          },
          changedFiles: [resolvedPath],
        };
      },
    },
    {
      name: 'edit_file',
      description: '基于 oldText/newText 对文件执行一次文本替换。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          oldText: { type: 'string', description: '待替换的原始文本。' },
          newText: { type: 'string', description: '替换后的文本。' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配项。' },
        },
        required: ['path', 'oldText', 'newText'],
      },
      requiresConfirmation: true,
      requestType: 'file_write',
      execute: async (params, context) => {
        const resolvedPath = resolveToolPath(context.workspacePath, normalizeText(params.path));
        ensureWritablePath(resolvedPath);
        const oldText = typeof params.oldText === 'string' ? params.oldText : '';
        const newText = typeof params.newText === 'string' ? params.newText : '';
        if (!oldText) {
          throw new Error('oldText is required');
        }

        const replaceAll = params.replaceAll === true;
        const content = await fsp.readFile(resolvedPath, 'utf8');
        const occurrenceCount = countOccurrences(content, oldText);
        if (occurrenceCount === 0) {
          throw new Error('oldText not found in file');
        }

        const nextContent = replaceAll
          ? content.split(oldText).join(newText)
          : content.replace(oldText, newText);
        await fsp.writeFile(resolvedPath, nextContent, 'utf8');

        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            replacements: replaceAll ? occurrenceCount : 1,
          },
          changedFiles: [resolvedPath],
        };
      },
    },
    {
      name: 'multi_edit_file',
      description: '对同一个文件按顺序执行多次文本替换。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          edits: { type: 'array', description: '替换列表，每项包含 oldText、newText、可选 replaceAll。', items: { type: 'object' } },
        },
        required: ['path', 'edits'],
      },
      requiresConfirmation: true,
      requestType: 'file_write',
      execute: async (params, context) => {
        const resolvedPath = resolveToolPath(context.workspacePath, normalizeText(params.path));
        ensureWritablePath(resolvedPath);
        const edits = Array.isArray(params.edits) ? params.edits : [];
        if (edits.length === 0) {
          throw new Error('edits must contain at least one edit');
        }

        let content = await fsp.readFile(resolvedPath, 'utf8');
        let appliedCount = 0;

        for (const edit of edits) {
          if (!isRecord(edit)) {
            throw new Error('each edit must be an object');
          }
          const oldText = typeof edit.oldText === 'string' ? edit.oldText : '';
          const newText = typeof edit.newText === 'string' ? edit.newText : '';
          if (!oldText) {
            throw new Error('each edit.oldText is required');
          }

          const occurrenceCount = countOccurrences(content, oldText);
          if (occurrenceCount === 0) {
            throw new Error(`edit.oldText not found: ${truncateText(oldText, 80)}`);
          }

          const replaceAll = edit.replaceAll === true;
          content = replaceAll
            ? content.split(oldText).join(newText)
            : content.replace(oldText, newText);
          appliedCount += replaceAll ? occurrenceCount : 1;
        }

        await fsp.writeFile(resolvedPath, content, 'utf8');
        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            editsApplied: appliedCount,
          },
          changedFiles: [resolvedPath],
        };
      },
    },
    {
      name: 'list_forms',
      description: 'List available forms in the current project so the agent can discover the correct form before querying rows.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional form name keyword or alias to narrow the results.' },
          limit: { type: 'number', description: 'Maximum number of forms to return. Default 20, max 50.' },
        },
      },
      requiresConfirmation: false,
      execute: async (params) => {
        const formDatabase = getFormDatabase();
        const forms = await formDatabase.getAllForms();
        const query = normalizeText(params.query);
        const limit = Math.max(1, Math.min(50, toPositiveInteger(params.limit, 20)));
        const matchedForms = query
          ? forms
              .map(form => ({
                form,
                score: scoreFormNameMatch(form.name, query),
              }))
              .filter(entry => entry.score > 0)
              .sort((left, right) => right.score - left.score)
              .slice(0, limit)
              .map(entry => entry.form)
          : forms.slice(0, limit);

        return {
          success: true,
          data: {
            query: query || null,
            forms: matchedForms.map(form => ({
              id: form.id,
              name: form.name,
              groupId: form.groupId,
              updatedAt: form.updatedAt,
            })),
            returnedCount: matchedForms.length,
            totalForms: forms.length,
          },
        };
      },
    },
    {
      name: 'query_form',
      description: 'Query structured rows from a project form by formId or formName. Prefer this over bash or file search for form data.',
      parameters: {
        type: 'object',
        properties: {
          formId: { type: 'string', description: 'Exact form ID when known.' },
          formName: { type: 'string', description: 'Form name or alias when formId is unknown.' },
          query: { type: 'string', description: 'Optional keyword query for row filtering.' },
          columns: { type: 'array', description: 'Optional selected columns by id or name.', items: { type: 'string' } },
          where: { type: 'object', description: 'Optional filter object: { column, op, value }.' },
          limit: { type: 'number', description: 'Maximum rows to return. Default 80, max 80.' },
          offset: { type: 'number', description: 'Pagination offset. Default 0.' },
          rowIds: { type: 'array', description: 'Optional explicit rowId filter.', items: { type: 'string' } },
        },
      },
      requiresConfirmation: false,
      execute: async (params) => {
        const formDatabase = getFormDatabase();
        const forms = await formDatabase.getAllForms();
        const formIdArg = normalizeText(params.formId);
        const formNameArg = normalizeText(params.formName);

        let resolvedForm = formIdArg
          ? (forms.find(form => form.id === formIdArg) ?? findBestMatchingForm(forms, formIdArg))
          : null;
        if (!resolvedForm && formNameArg) {
          resolvedForm = findBestMatchingForm(forms, formNameArg);
        }

        if (!resolvedForm) {
          const lookupValue = formNameArg || formIdArg;
          const candidates = lookupValue
            ? forms
                .map(form => ({
                  form,
                  score: scoreFormNameMatch(form.name, lookupValue),
                }))
                .filter(entry => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .slice(0, 5)
                .map(entry => ({ id: entry.form.id, name: entry.form.name }))
            : [];

          return {
            success: false,
            error: lookupValue
              ? `form not found: ${lookupValue}`
              : 'formId or formName is required',
            data: candidates.length > 0 ? { candidates } : undefined,
          };
        }

        const parsedColumns = parseStringListArg(params.columns);
        const parsedRowIds = parseStringListArg(params.rowIds);
        const parsedWhere = (() => {
          if (!isRecord(params.where)) {
            return null;
          }
          const column = normalizeText(params.where.column);
          const op = normalizeText(params.where.op) as FormQueryWhere['op'];
          if (!column || !op) {
            return null;
          }
          return {
            column,
            op,
            value: params.where.value,
          } satisfies FormQueryWhere;
        })();

        const offset = typeof params.offset === 'number' && Number.isFinite(params.offset)
          ? Math.max(0, Math.floor(params.offset))
          : 0;
        const result = await formDatabase.queryFormRows({
          formId: resolvedForm.id,
          query: normalizeText(params.query) || undefined,
          where: parsedWhere,
          columns: parsedColumns.length > 0 ? parsedColumns : undefined,
          limit: Math.max(1, Math.min(80, toPositiveInteger(params.limit, 80))),
          offset,
          rowIds: parsedRowIds.length > 0 ? parsedRowIds : undefined,
        });

        if (!result) {
          return {
            success: false,
            error: `form not found: ${resolvedForm.id}`,
          };
        }

        return {
          success: true,
          data: {
            formId: result.formId,
            formName: result.formName,
            allColumns: result.allColumns,
            selectedColumns: result.selectedColumns,
            rows: result.rows,
            matchedTotal: result.matchedTotal,
            returnedCount: result.returnedCount,
            totalRows: result.totalRows,
            offset: result.offset,
            limit: result.limit,
            hasMore: result.hasMore,
            nextOffset: result.nextOffset,
            appliedWhere: result.appliedWhere,
            whereInferred: result.whereInferred,
          },
        };
      },
    },
    {
      name: 'multi_agent_run',
      description: '将一个复杂任务拆分给多个只读子 Agent 并行执行，再把结果汇总返回。适合大型分析、跨目录排查、方案对比等任务。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '本次多智能体计划的标题。' },
          subtasks: {
            type: 'array',
            description: '子任务列表。每个子任务至少提供 title 和 task，可选 role 与 maxIterations。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '子任务标识，可选。' },
                title: { type: 'string', description: '子任务标题。' },
                task: { type: 'string', description: '要交给子 Agent 的具体任务。' },
                role: { type: 'string', description: '子 Agent 角色，例如“前端审查”“后端排障”。' },
                maxIterations: { type: 'number', description: '该子 Agent 的最大循环次数，可选。' },
              },
              required: ['title', 'task'],
            },
          },
          maxConcurrency: { type: 'number', description: '最大并发子 Agent 数，默认 3，最大 4。' },
        },
        required: ['subtasks'],
      },
      requiresConfirmation: true,
      requestType: 'custom',
      execute: async () => ({
        success: false,
        error: 'multi_agent_run must be executed by MainAgentRuntime',
      }),
    },
    {
      name: 'bash',
      description: '在工作区中执行受限 shell 命令。',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令。' },
          timeoutMs: { type: 'number', description: '超时时间，毫秒，最大 120000。' },
          rollbackCommand: { type: 'string', description: '可选。如果该命令有可安全撤销的反向操作，在这里提供回滚命令。' },
        },
        required: ['command'],
      },
      requiresConfirmation: true,
      requestType: 'command_execute',
      execute: async (params, context) => {
        const command = normalizeText(params.command);
        if (!command) {
          throw new Error('command is required');
        }
        for (const pattern of FORBIDDEN_COMMANDS) {
          if (pattern.test(command)) {
            throw new Error('command blocked by security policy');
          }
        }

        const timeoutMs = Math.min(120000, toPositiveInteger(params.timeoutMs, 30000));
        const preferUtf8 = UTF8_OUTPUT_HINT_REGEX.test(command);
        const result = await new Promise<MainAgentToolResult>((resolve) => {
          exec(
            command,
            {
              cwd: context.workspacePath,
              timeout: timeoutMs,
              maxBuffer: MAX_BUFFER,
              encoding: 'buffer',
              env: { ...process.env },
              windowsHide: true,
            },
            (
              error: ExecException | null,
              stdout: string | Buffer,
              stderr: string | Buffer,
            ) => {
              const decodedStdout = decodeShellOutput(stdout as Buffer | string | undefined, preferUtf8);
              const decodedStderr = decodeShellOutput(stderr as Buffer | string | undefined, preferUtf8);

              if (error) {
                resolve({
                  success: false,
                  error: error.killed
                    ? `command timed out after ${timeoutMs}ms`
                    : error.message,
                  data: {
                    command,
                    stdout: decodedStdout,
                    stderr: decodedStderr || error.message,
                    exitCode: typeof error.code === 'number' ? error.code : 1,
                  },
                });
                return;
              }

              resolve({
                success: true,
                data: {
                  command,
                  stdout: decodedStdout,
                  stderr: decodedStderr,
                  exitCode: 0,
                },
              });
            },
          );
        });

        return result;
      },
    },
  ];

  private buildRunKey(threadId: string, turnId: string): string {
    return `${threadId}:${turnId}`;
  }

  private normalizeRunInput(input: AgentChatRunTurnInput): AgentChatRunTurnInput {
    return {
      ...input,
      threadId: normalizeText(input.threadId),
      turnId: normalizeText(input.turnId),
      instruction: normalizeText(input.instruction),
      workspacePath: normalizeText(input.workspacePath),
      modelId: normalizeText(input.modelId),
      currentFile: normalizeText(input.currentFile ?? undefined) || undefined,
      selectedText: normalizeText(input.selectedText ?? undefined) || undefined,
    };
  }

  private createCheckpoint(
    messages: RuntimeMessage[],
    nextIteration: number,
    modelCallsUsed: number = 0,
  ): MainAgentTurnCheckpoint {
    return {
      messages: cloneRuntimeMessages(messages),
      nextIteration,
      modelCallsUsed,
    };
  }

  private setCheckpoint(
    runKey: string,
    messages: RuntimeMessage[],
    nextIteration: number,
    modelCallsUsed: number = 0,
  ): void {
    const executionState = this.executionStates.get(runKey);
    if (!executionState) {
      return;
    }

    executionState.checkpoint = this.createCheckpoint(messages, nextIteration, modelCallsUsed);
  }

  private isExecutionCurrent(runKey: string, executionId: string): boolean {
    const executionState = this.executionStates.get(runKey);
    return executionState?.executionId === executionId;
  }

  private ensureExecutionActive(
    runKey: string,
    executionId: string,
    threadId: string,
    turnId: string,
  ): void {
    if (!this.isExecutionCurrent(runKey, executionId)) {
      throw new TurnInterruptedError();
    }

    this.ensureTurnRunnable(threadId, turnId);
  }

  private hasTurnItem(threadId: string, turnId: string, kind: string): boolean {
    const snapshot = agentChatRuntime.getThreadSnapshot({ threadId });
    return snapshot?.turnItems?.some(item =>
      item.turnId === turnId && item.kind === kind
    ) ?? false;
  }

  private startExecution(
    runKey: string,
    executionId: string,
    task: () => Promise<void>,
  ): void {
    const runPromise = task()
      .catch(error => {
        if (!(error instanceof TurnInterruptedError)) {
          console.error('[MainAgentRuntime] turn execution failed:', error);
        }
      })
      .finally(() => {
        const activeRun = this.activeRuns.get(runKey);
        if (activeRun?.executionId === executionId) {
          this.activeRuns.delete(runKey);
        }
      });

    this.activeRuns.set(runKey, {
      executionId,
      promise: runPromise,
    });
  }

  private logTurnEvent(
    threadId: string,
    turnId: string,
    stage: string,
    payload?: unknown,
  ): void {
    const prefix = `[AgentRuntime][${threadId}/${turnId}] ${stage}`;
    if (payload === undefined) {
      console.log(prefix);
      return;
    }

    console.log(prefix, formatConsolePayload(payload));
  }

  private logModelMessages(
    threadId: string,
    turnId: string,
    stage: string,
    messages: RuntimeMessage[],
  ): void {
    this.logTurnEvent(threadId, turnId, stage, formatMessagesForConsole(messages));
  }

  async runTurn(input: AgentChatRunTurnInput): Promise<AgentChatRunTurnResult> {
    const normalizedInput = this.normalizeRunInput(input);
    const threadId = normalizedInput.threadId;
    const turnId = normalizedInput.turnId;
    const runKey = this.buildRunKey(threadId, turnId);
    if (!threadId || !turnId) {
      throw new Error('threadId and turnId are required');
    }
    if (this.activeRuns.has(runKey)) {
      throw new Error('turn is already running');
    }

    const executionId = randomUUID();
    this.executionStates.set(runKey, {
      input: normalizedInput,
      executionId,
      checkpoint: null,
    });
    this.logTurnEvent(threadId, turnId, 'run accepted', {
      workspacePath: normalizedInput.workspacePath,
      modelId: normalizedInput.modelId,
      currentFile: normalizedInput.currentFile ?? null,
      selectedText: normalizedInput.selectedText ?? null,
      maxIterations: normalizedInput.maxIterations ?? null,
      maxModelCalls: normalizedInput.maxModelCalls ?? null,
      instruction: normalizedInput.instruction,
    });
    this.startExecution(runKey, executionId, () => this.runAgenticExecutionLoop(runKey));

    return {
      threadId,
      turnId,
      accepted: true,
    };
  }

  resumeTurn(input: AgentChatResumeTurnInput): AgentChatTurnSummary | null {
    const threadId = normalizeText(input.threadId);
    const turnId = normalizeText(input.turnId);
    if (!threadId || !turnId) {
      return null;
    }

    const runKey = this.buildRunKey(threadId, turnId);
    const executionState = this.executionStates.get(runKey);
    if (!executionState) {
      throw new Error('turn runtime context is missing');
    }

    const turn = this.getTurnSummary(threadId, turnId);
    if (!turn) {
      throw new Error('turn not found');
    }
    if (turn.status !== 'interrupted') {
      throw new Error('only interrupted turns can be resumed');
    }

    const resumedTurn = agentChatRuntime.resumeTurn({
      threadId,
      turnId,
    });
    if (!resumedTurn) {
      return null;
    }

    const executionId = randomUUID();
    executionState.executionId = executionId;
    this.startExecution(runKey, executionId, () => this.runAgenticExecutionLoop(runKey, true));

    return resumedTurn;
  }

  private async loadSystemPrompt(): Promise<string> {
    if (this.systemPromptCache) {
      return this.systemPromptCache;
    }

    const promptPath = resolveProjectPath('packages', 'prompts', 'agent', 'main-runtime.md');
    this.systemPromptCache = await fsp.readFile(promptPath, 'utf8');
    return this.systemPromptCache;
  }

  private async getWorkspaceToolDefinitions(workspacePath: string): Promise<MainAgentToolDefinition[]> {
    const customTools = (await this.workspaceCustomToolRegistry.list(workspacePath)).map(adaptAgentToolDefinition);
    const merged = [...this.toolDefinitions, ...customTools];
    const seenToolNames = new Set<string>();

    return merged.filter(tool => {
      if (seenToolNames.has(tool.name)) {
        return false;
      }

      seenToolNames.add(tool.name);
      return true;
    });
  }

  private async buildPromptToolDefinitions(workspacePath: string): Promise<AgentToolDefinition[]> {
    const tools = await this.getWorkspaceToolDefinitions(workspacePath);
    const promptTools = tools.map<AgentToolDefinition>(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      requiresConfirmation: tool.requiresConfirmation,
      requestType: tool.requestType as AgentToolDefinition['requestType'],
    }));

    promptTools.push({
      name: 'ask_user',
      description: '向用户请求补充信息。仅在缺少继续执行所必需的信息时使用。',
      input_schema: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: '需要用户回答的问题。',
          },
        },
        required: ['question'],
      },
    });

    return promptTools;
  }

  private async buildToolsDescription(workspacePath: string): Promise<string> {
    const tools = await this.getWorkspaceToolDefinitions(workspacePath);
    const lines: string[] = [];
    for (const tool of tools) {
      lines.push(`### ${tool.name}`);
      lines.push(tool.description);

      const propertyEntries = Object.entries(tool.parameters.properties);
      if (propertyEntries.length === 0) {
        lines.push('参数: 无');
      } else {
        lines.push('参数:');
        const required = new Set(tool.parameters.required ?? []);
        for (const [key, schema] of propertyEntries) {
          const type = schema.type || 'unknown';
          const suffix = required.has(key) ? 'required' : 'optional';
          lines.push(`- ${key} (${type}, ${suffix}): ${schema.description}`);
        }
      }

      lines.push(`requires_confirmation: ${tool.requiresConfirmation ? 'true' : 'false'}`);
      lines.push('');
    }

    lines.push('### ask_user');
    lines.push('向用户请求补充信息。仅在缺少继续执行所必需的信息时使用。');
    lines.push('参数:');
    lines.push('- question (string, required): 需要用户回答的问题。');

    return lines.join('\n').trim();
  }

  private async scanWorkspaceSummary(workspacePath: string): Promise<string> {
    try {
      const entries = await fsp.readdir(workspacePath, { withFileTypes: true });
      const visibleEntries = entries
        .filter(entry => !containsForbiddenPath(path.join(workspacePath, entry.name)))
        .slice(0, 30)
        .map(entry => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`);

      if (visibleEntries.length === 0) {
        return '工作区为空。';
      }

      return visibleEntries.join('\n');
    } catch (error) {
      return `工作区扫描失败: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async buildFormContextHint(instruction: string): Promise<string | null> {
    if (!FORM_LOOKUP_HINT_REGEX.test(instruction)) {
      return null;
    }

    const lines = [
      '[Form guidance]',
      '- This task appears to involve forms or tabular records.',
      '- Prefer list_forms and query_form before using bash, grep, or workspace file search.',
      '- If the exact form is unknown, call list_forms with a short query first.',
    ];

    try {
      const formDatabase = getFormDatabase();
      const forms = await formDatabase.getAllForms();
      if (forms.length === 0) {
        lines.push('- No forms are currently available in the workspace.');
        return lines.join('\n');
      }

      const matchedForms = forms
        .map(form => ({
          form,
          score: scoreFormNameMatch(form.name, instruction),
        }))
        .filter(entry => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(entry => entry.form);

      if (matchedForms.length > 0) {
        lines.push('[Candidate forms]');
        for (const form of matchedForms) {
          lines.push(`- ${form.name} (id: ${form.id})`);
        }
      }
    } catch (error) {
      lines.push(`- Form discovery failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return lines.join('\n');
  }

  private buildTaskMessage(
    input: AgentChatRunTurnInput,
    workspaceSummary: string,
    formContextHint?: string | null,
  ): string {
    const normalizedInstruction = normalizeText(input.instruction);
    const sections: string[] = [
      `用户任务: ${normalizedInstruction}`,
      `工作区: ${normalizeText(input.workspacePath)}`,
      '工作区摘要:',
      workspaceSummary,
    ];

    const currentFile = normalizeText(input.currentFile);
    if (currentFile) {
      sections.push(`当前文件: ${currentFile}`);
    }

    const selectedText = normalizeText(input.selectedText);
    if (selectedText) {
      sections.push(`选中文本:\n${selectedText}`);
    }

    if (formContextHint) {
      sections.push(formContextHint);
    } else if (FORM_LOOKUP_HINT_REGEX.test(normalizedInstruction)) {
      sections.push([
        '[Form guidance]',
        '- This task appears to involve forms or tabular records.',
        '- Prefer list_forms and query_form for form data.',
        '- Do not use bash, grep, or workspace file search as a substitute for querying forms.',
      ].join('\n'));
    }

    sections.push('请严格按照 JSON 协议输出。');
    return sections.join('\n\n');
  }

  private async appendTurnItems(
    threadId: string,
    turnId: string,
    items: AgentChatTurnItemInput[],
  ): Promise<void> {
    const payload: AgentChatAppendTurnItemsInput = {
      threadId,
      turnId,
      items,
    };
    agentChatRuntime.appendTurnItems(payload);
  }

  private async appendTurnItem(
    threadId: string,
    turnId: string,
    item: AgentChatTurnItemInput,
  ): Promise<void> {
    await this.appendTurnItems(threadId, turnId, [item]);
  }

  private buildTurnMetadata(
    metadata?: AgentChatTurnItemMetadata,
  ): AgentChatTurnItemMetadata {
    return {
      source: 'main_runtime',
      ...metadata,
    };
  }

  private createToolCallMetadata(
    toolName: string,
    iteration: number,
  ): AgentChatTurnItemMetadata {
    const toolCallId = randomUUID();
    return this.buildTurnMetadata({
      streamKind: 'tool_call',
      streamId: toolCallId,
      toolCallId,
      toolName,
      iteration,
    });
  }

  private getTurnSummary(threadId: string, turnId: string): AgentChatTurnSummary | null {
    const snapshot = agentChatRuntime.getThreadSnapshot({ threadId });
    if (!snapshot?.turns || snapshot.turns.length === 0) {
      return null;
    }

    return snapshot.turns.find(turn => turn.id === turnId) ?? null;
  }

  private ensureTurnRunnable(threadId: string, turnId: string): void {
    const turn = this.getTurnSummary(threadId, turnId);
    if (!turn) {
      throw new Error('turn not found');
    }
    if (turn.status === 'interrupted') {
      throw new TurnInterruptedError();
    }
    if (turn.status === 'error') {
      throw new Error(turn.lastError || 'turn is already in error state');
    }
    if (turn.status === 'completed') {
      throw new Error('turn is already completed');
    }
  }

  private buildToolResultForModel(toolName: string, result: MainAgentToolResult): string {
    const payload = {
      toolName,
      success: result.success,
      error: result.error ?? null,
      data: result.data ?? null,
      changedFiles: result.changedFiles ?? [],
    };

    return truncateText(safeJsonStringify(payload), MAX_TOOL_RESULT_CHARS);
  }

  private isReadOnlySubAgentTool(tool: MainAgentToolDefinition): boolean {
    if (tool.name === 'ask_user' || tool.name === 'multi_agent_run' || tool.name === 'bash') {
      return false;
    }

    if (tool.requiresConfirmation) {
      return false;
    }

    return tool.requestType !== 'file_write'
      && tool.requestType !== 'diff_apply'
      && tool.requestType !== 'command_execute'
      && tool.requestType !== 'custom';
  }

  private async getReadOnlySubAgentTools(workspacePath: string): Promise<MainAgentToolDefinition[]> {
    const tools = await this.getWorkspaceToolDefinitions(workspacePath);
    return tools.filter(tool => this.isReadOnlySubAgentTool(tool));
  }

  private buildSubAgentTaskMessage(
    parentInstruction: string,
    subtask: {
      title: string;
      task: string;
      role?: string;
    },
  ): string {
    const sections = [
      '你是一个被主 Agent 委派出来的子 Agent。',
      parentInstruction ? `主任务背景:\n${parentInstruction}` : '',
      subtask.role ? `子 Agent 角色:\n${subtask.role}` : '',
      `子任务标题:\n${subtask.title}`,
      `子任务要求:\n${subtask.task}`,
      '限制:\n- 只允许使用只读工具\n- 不允许写文件\n- 不允许执行 shell 命令\n- 不允许请求用户审批\n- 完成后直接给出可供主 Agent 汇总的结论',
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  private async runMultiAgentTool(
    params: Record<string, unknown>,
    context: {
      threadId: string;
      turnId: string;
      instruction: string;
      workspacePath: string;
      modelId: string;
    },
  ): Promise<MainAgentToolResult> {
    const subtaskValues = Array.isArray(params.subtasks) ? params.subtasks : [];
    const subtasks = subtaskValues.reduce<Array<{
      id: string;
      title: string;
      task: string;
      role?: string;
      maxIterations?: number;
      metadata?: Record<string, unknown>;
    }>>((acc, value, index) => {
      if (!isRecord(value)) {
        return acc;
      }

      const title = normalizeText(value.title);
      const task = normalizeText(value.task);
      if (!title || !task) {
        return acc;
      }

      const role = normalizeText(value.role) || undefined;
      const id = normalizeText(value.id) || `subagent-${index + 1}`;
      const maxIterations = typeof value.maxIterations === 'number' && Number.isFinite(value.maxIterations)
        ? Math.max(1, Math.min(6, Math.floor(value.maxIterations)))
        : undefined;

      acc.push({
        id,
        title,
        task,
        role,
        maxIterations,
        metadata: isRecord(value.metadata) ? { ...value.metadata } : undefined,
      });
      return acc;
    }, []);

    if (subtasks.length === 0) {
      return {
        success: false,
        error: 'subtasks must contain at least one valid item with title and task',
      };
    }

    const readOnlyTools = await this.getReadOnlySubAgentTools(context.workspacePath);
    if (readOnlyTools.length === 0) {
      return {
        success: false,
        error: 'no read-only tools are available for multi-agent execution',
      };
    }

    const promptToolDefinitions = readOnlyTools.map<AgentToolDefinition>(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      requiresConfirmation: false,
      requestType: tool.requestType as AgentToolDefinition['requestType'],
    }));

    const planId = randomUUID();
    const planTitle = normalizeText(params.title) || 'Parallel multi-agent workflow';
    const maxConcurrency = Math.min(4, Math.max(1, toPositiveInteger(params.maxConcurrency, Math.min(3, subtasks.length))));
    const systemPrompt = await this.loadSystemPrompt();

    const workflow = await runMultiAgentWorkflow({
      plan: {
        id: planId,
        title: planTitle,
        subtasks,
      },
      maxConcurrency,
      callbacks: {
        onSubtaskStart: async (subtask) => {
          this.ensureTurnRunnable(context.threadId, context.turnId);
          await this.appendTurnItem(context.threadId, context.turnId, {
            kind: 'step',
            title: `子 Agent 开始: ${subtask.title}`,
            text: subtask.role ? `${subtask.role}\n${subtask.task}` : subtask.task,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'progress',
              streamId: `multi-agent-${planId}-${subtask.id}-start`,
            }),
          });
        },
        onSubtaskFinish: async (result) => {
          this.ensureTurnRunnable(context.threadId, context.turnId);
          await this.appendTurnItem(context.threadId, context.turnId, {
            kind: 'thinking',
            title: `子 Agent 结果: ${result.title}`,
            text: truncateText(
              result.success
                ? result.output
                : `FAILED: ${result.error || 'unknown error'}`,
              4000,
            ),
            status: result.success ? 'info' : 'failed',
            metadata: this.buildTurnMetadata({
              streamKind: 'reasoning',
              streamId: `multi-agent-${planId}-${result.id}-result`,
            }),
          });
        },
      },
      runSubtask: async (subtask) => {
        const subtaskMaxIterations = Math.max(1, Math.min(6, toPositiveInteger(subtask.maxIterations, 4)));
        const initialMessages = createAgentLoopInitialMessages({
          systemPrompt,
          taskMessage: this.buildSubAgentTaskMessage(context.instruction, subtask),
          toolDefinitions: promptToolDefinitions,
        });

        const subtaskResult = await runAgenticLoop({
          initialMessages,
          maxIterations: subtaskMaxIterations,
          maxModelCalls: Math.min(MAX_MODEL_CALLS_LIMIT, subtaskMaxIterations + 1),
          maxFinalAnswerChars: 8000,
          historyCompression: {
            maxMessageCount: 24,
            maxContextChars: 24000,
            preserveLastRounds: 10,
            maxSummaryChars: 2500,
          },
          callModel: async (loopMessages) => {
            this.ensureTurnRunnable(context.threadId, context.turnId);
            return builtinAI.chat(context.modelId, loopMessages);
          },
          executeTool: async (toolName, toolParams) => {
            this.ensureTurnRunnable(context.threadId, context.turnId);
            const tool = readOnlyTools.find(candidate => candidate.name === toolName) ?? null;
            if (!tool) {
              return {
                success: false,
                error: `unknown sub-agent tool: ${toolName}`,
              };
            }

            return tool.execute(toolParams, { workspacePath: context.workspacePath });
          },
          formatToolResult: (toolName, result) => this.buildToolResultForModel(toolName, result),
          generateFinalAnswer: async (loopMessages) => builtinAI.chat(
            context.modelId,
            buildForcedFinalAnswerMessages(loopMessages),
          ),
          callbacks: {
            assertCanContinue: () => {
              this.ensureTurnRunnable(context.threadId, context.turnId);
            },
          },
        });

        return {
          id: subtask.id,
          success: true,
          output: subtaskResult.finalOutput,
          metadata: {
            role: subtask.role ?? null,
            iterationsCompleted: subtaskResult.iterationsCompleted,
            terminationReason: subtaskResult.terminationReason,
          },
        };
      },
    });

    return {
      success: true,
      data: {
        plan: workflow.plan,
        maxConcurrency,
        mergedOutput: workflow.mergedOutput,
        results: workflow.results,
        toolNames: readOnlyTools.map(tool => tool.name),
      },
    };
  }

  private async getToolDefinition(
    toolName: string,
    workspacePath: string,
  ): Promise<MainAgentToolDefinition | null> {
    const tools = await this.getWorkspaceToolDefinitions(workspacePath);
    return tools.find(tool => tool.name === toolName) ?? null;
  }

  private async waitForResolvedRequest(threadId: string, requestId: string): Promise<AgentChatServerRequest> {
    return new Promise<AgentChatServerRequest>((resolve, reject) => {
      const unsubscribe = agentChatRuntime.onEvent(event => {
        if (event.method === 'request/resolved') {
          const request = event.params.request;
          if (request.threadId === threadId && request.id === requestId) {
            unsubscribe();
            resolve(request);
          }
          return;
        }

        if (event.method !== 'turn/updated') {
          return;
        }

        const turn = event.params.summary;
        if (turn.threadId !== threadId) {
          return;
        }
        if (turn.status === 'interrupted') {
          unsubscribe();
          reject(new TurnInterruptedError());
        }
      });
    });
  }

  private async requestApproval(
    threadId: string,
    turnId: string,
    tool: MainAgentToolDefinition,
    params: Record<string, unknown>,
    workspacePath: string,
  ): Promise<AgentChatApprovalResponse | null> {
    const targetPath = typeof params.path === 'string'
      ? resolveDisplayPath(workspacePath, resolveToolPath(workspacePath, params.path))
      : null;
    const changeSet = await buildApprovalChangeSet(tool.name, params, workspacePath).catch(() => null);
    const rawCommand = typeof params.command === 'string' ? params.command : null;
    const commandSecurity = rawCommand ? assessCommandSecurity(rawCommand) : null;
    const commandRiskDescription = commandSecurity && commandSecurity.level !== 'safe'
      ? `\n\n风险等级: ${commandSecurity.level === 'blocked' ? '已阻止' : '高'}\n${commandSecurity.reasons.join('\n')}`
      : '';
    const command = rawCommand ? `${rawCommand}${commandRiskDescription}` : null;
    this.logTurnEvent(threadId, turnId, `approval requested: ${tool.name}`, {
      toolName: tool.name,
      params,
      command: rawCommand,
      targetPath,
    });
    const request = agentChatRuntime.createApprovalRequest({
      threadId,
      turnId,
      requestType: tool.requestType ?? 'custom',
      title: `工具执行确认: ${tool.name}`,
      description: command
        ? `是否允许执行命令？\n\n${command}`
        : (targetPath ? `是否允许修改文件？\n\n${targetPath}` : `是否允许执行工具 ${tool.name}？`),
      toolName: tool.name,
      params,
      command: rawCommand,
      changedFiles: changeSet?.files.map(file => file.path) ?? (targetPath ? [targetPath] : undefined),
      changeSet,
    });

    const resolved = await this.waitForResolvedRequest(threadId, request.id);
    this.ensureTurnRunnable(threadId, turnId);
    this.logTurnEvent(threadId, turnId, `approval resolved: ${tool.name}`, {
      approved: resolved.kind === 'approval' ? resolved.response?.approved ?? false : false,
      response: resolved.kind === 'approval' ? resolved.response ?? null : null,
    });

    return resolved.kind === 'approval'
      ? (resolved.response ?? null)
      : null;
  }

  private async requestUserInput(
    threadId: string,
    turnId: string,
    question: string,
  ): Promise<string | null> {
    this.logTurnEvent(threadId, turnId, 'user input requested', { question });
    const request = agentChatRuntime.createUserInputRequest({
      threadId,
      turnId,
      title: '需要你的输入',
      description: 'Agent 需要更多信息才能继续执行。',
      questions: [{
        id: 'answer',
        label: question,
        required: true,
      }],
    });

    const resolved = await this.waitForResolvedRequest(threadId, request.id);
    this.ensureTurnRunnable(threadId, turnId);

    if (resolved.kind !== 'user_input') {
      return null;
    }

    const answer = resolved.response?.answers?.answer;
    this.logTurnEvent(threadId, turnId, 'user input resolved', {
      question,
      answer: typeof answer === 'string' ? answer.trim() : null,
    });
    return typeof answer === 'string' && answer.trim()
      ? answer.trim()
      : null;
  }

  private async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: {
      threadId: string;
      turnId: string;
      instruction: string;
      workspacePath: string;
      modelId: string;
    },
  ): Promise<MainAgentToolResult> {
    if (toolName === 'ask_user') {
      const question = normalizeText(params.question);
      if (!question) {
        return {
          success: false,
          error: 'question is required',
        };
      }

      const answer = await this.requestUserInput(context.threadId, context.turnId, question);
      return answer
        ? {
            success: true,
            data: {
              question,
              answer,
            },
          }
        : {
            success: false,
            error: 'user did not provide an answer',
          };
    }

    const tool = await this.getToolDefinition(toolName, context.workspacePath);
    if (!tool) {
      return {
        success: false,
        error: `unknown tool: ${toolName}`,
      };
    }

    if (toolName === 'bash') {
      const instruction = normalizeText(context.instruction);
      const command = normalizeText(params.command);
      const commandSecurity = assessCommandSecurity(command);
      if (commandSecurity.level === 'blocked') {
        return {
          success: false,
          error: commandSecurity.reasons[0] || 'command blocked by security policy',
          data: {
            blockedCommand: command,
            security: commandSecurity,
          },
        };
      }

      if (FORM_LOOKUP_HINT_REGEX.test(instruction) && FORM_FILE_SEARCH_COMMAND_REGEX.test(command)) {
        return {
          success: false,
          error: 'This task appears to target form data. Use list_forms/query_form instead of shell file search.',
          data: {
            blockedCommand: command,
            security: commandSecurity,
            recommendedTools: ['list_forms', 'query_form'],
          },
        };
      }
    }

    let effectiveParams = { ...params };
    let approvedChangeSet = null;
    if (tool.requiresConfirmation) {
      const approval = await this.requestApproval(
        context.threadId,
        context.turnId,
        tool,
        params,
        context.workspacePath,
      );
      if (!approval?.approved) {
        return {
          success: false,
          error: `user rejected tool execution: ${toolName}`,
        };
      }

      const approvalDecision = applyApprovalDecisionsToToolParams(
        toolName,
        params,
        await buildApprovalChangeSet(toolName, params, context.workspacePath).catch(() => null),
        approval.fileDecisions,
      );

      if (!approvalDecision.approved) {
        return {
          success: false,
          error: `all requested file changes were rejected for tool: ${toolName}`,
        };
      }

      effectiveParams = approvalDecision.effectiveParams;
      approvedChangeSet = approvalDecision.approvedChangeSet;
    }

    this.logTurnEvent(context.threadId, context.turnId, `tool request: ${toolName}`, {
      toolName,
      params: effectiveParams,
    });
    const startedAt = Date.now();
    const beforeContents = await collectWriteBeforeContents(
      toolName,
      effectiveParams,
      context.workspacePath,
    ).catch(() => ({}));
    const result = toolName === 'multi_agent_run'
      ? await this.runMultiAgentTool(effectiveParams, context)
      : await tool.execute(effectiveParams, { workspacePath: context.workspacePath });
    const completedAt = Date.now();
    const resultText = this.buildToolResultForModel(toolName, result);
    const executionChangeSet = result.success
      ? await buildExecutionChangeSet(
          toolName,
          effectiveParams,
          context.workspacePath,
          beforeContents,
        ).catch(() => approvedChangeSet)
      : approvedChangeSet;

    agentExecutionJournalService.recordExecution({
      threadId: context.threadId,
      turnId: context.turnId,
      workspacePath: context.workspacePath,
      toolName,
      params: effectiveParams,
      success: result.success,
      resultText,
      changedFiles: executionChangeSet?.files.map(file => file.path) ?? (result.changedFiles ?? []),
      changeSet: executionChangeSet,
      rollbackCommand: typeof effectiveParams.rollbackCommand === 'string'
        ? effectiveParams.rollbackCommand
        : null,
      startedAt,
      completedAt,
    });
    this.logTurnEvent(context.threadId, context.turnId, `tool response: ${toolName}`, {
      success: result.success,
      changedFiles: executionChangeSet?.files.map(file => file.path) ?? (result.changedFiles ?? []),
      result: resultText,
    });

    return result;
  }

  private async createInitialMessages(input: AgentChatRunTurnInput): Promise<RuntimeMessage[]> {
    const systemPrompt = await this.loadSystemPrompt();
    const toolsDescription = await this.buildToolsDescription(normalizeText(input.workspacePath));
    const workspaceSummary = await this.scanWorkspaceSummary(normalizeText(input.workspacePath));
    const formContextHint = await this.buildFormContextHint(normalizeText(input.instruction));

    return createAgentLoopInitialMessages({
      systemPrompt,
      taskMessage: this.buildTaskMessage(input, workspaceSummary, formContextHint),
      toolDefinitions: await this.buildPromptToolDefinitions(normalizeText(input.workspacePath)),
    });

    return [
      {
        role: 'system',
        content: `${systemPrompt}\n\n## 可用工具\n${toolsDescription}`,
      },
      {
        role: 'user',
        content: this.buildTaskMessage(input, workspaceSummary, formContextHint),
      },
    ];
  }

  private async streamFinalAnswer(
    threadId: string,
    turnId: string,
    modelId: string,
    messages: RuntimeMessage[],
  ): Promise<string> {
    const streamKey = randomUUID();
    let output = '';

    await new Promise<void>((resolve, reject) => {
      void builtinAI.streamChat(
        modelId,
        messages,
        (chunk) => {
          output += chunk;
          void this.appendTurnItem(threadId, turnId, {
            kind: 'content',
            title: '最终答复',
            text: chunk,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'final',
              streamId: streamKey,
              responseKey: streamKey,
              streamKey,
            }),
          });
        },
        () => {
          resolve();
        },
        (error) => {
          reject(error);
        },
      );
    });

    return truncateText(output.trim(), MAX_FINAL_MESSAGE_CHARS);
  }

  private async generateFinalAnswer(
    threadId: string,
    turnId: string,
    modelId: string,
    messages: RuntimeMessage[],
  ): Promise<string> {
    return this.streamFinalAnswer(
      threadId,
      turnId,
      modelId,
      buildForcedFinalAnswerMessages(messages),
    );

    const finalMessages: RuntimeMessage[] = [
      ...messages,
      {
        role: 'user',
        content: '现在直接给出最终结果，不要再调用工具。请用中文简洁说明已完成的工作、结果和限制。',
      },
    ];

    return this.streamFinalAnswer(threadId, turnId, modelId, finalMessages);
  }

  private async completeTurn(
    threadId: string,
    turnId: string,
    status: 'completed' | 'error',
    lastError: string | null,
  ): Promise<void> {
    agentChatRuntime.updateTurn({
      threadId,
      turnId,
      status,
      lastError,
    });
  }

  private async streamLoopDecisionResponse(
    runKey: string,
    executionId: string,
    threadId: string,
    turnId: string,
    modelId: string,
    messages: RuntimeMessage[],
    iteration: number,
  ): Promise<string> {
    const responseKey = `decision-${iteration}-${randomUUID()}`;
    let output = '';
    this.logModelMessages(threadId, turnId, `model request: iteration ${iteration}`, messages);

    await new Promise<void>((resolve, reject) => {
      void builtinAI.streamChat(
        modelId,
        messages,
        (chunk) => {
          const turn = this.getTurnSummary(threadId, turnId);
          if (
            !this.isExecutionCurrent(runKey, executionId)
            || !turn
            || turn.status === 'interrupted'
            || turn.status === 'completed'
            || turn.status === 'error'
          ) {
            return;
          }

          output += chunk;
          void this.appendTurnItem(threadId, turnId, {
            kind: 'content',
            title: `迭代 ${iteration} 输出`,
            text: chunk,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'reasoning',
              streamId: responseKey,
              responseKey,
              streamKey: responseKey,
              iteration,
            }),
          });
        },
        () => {
          resolve();
        },
        (error) => {
          reject(error);
        },
      );
    });

    this.ensureExecutionActive(runKey, executionId, threadId, turnId);
    this.logTurnEvent(threadId, turnId, `model response: iteration ${iteration}`, output.trim());
    return output.trim();
  }

  private async executeTurn(input: AgentChatRunTurnInput): Promise<void> {
    const threadId = normalizeText(input.threadId);
    const turnId = normalizeText(input.turnId);
    const instruction = normalizeText(input.instruction);
    const workspacePath = normalizeText(input.workspacePath);
    const modelId = normalizeText(input.modelId);
    const maxIterations = Math.max(1, Math.min(12, toPositiveInteger(input.maxIterations, DEFAULT_MAX_ITERATIONS)));

    try {
      if (!threadId || !turnId || !instruction || !workspacePath || !modelId) {
        throw new Error('threadId, turnId, instruction, workspacePath, modelId are required');
      }
      if (!fs.existsSync(workspacePath)) {
        throw new Error('workspace path does not exist');
      }

      agentChatRuntime.updateTurn({
        threadId,
        turnId,
        status: 'running',
        modelId,
        lastError: null,
      });

      await this.appendTurnItems(threadId, turnId, [
        {
          kind: 'task',
          title: 'Agent 任务',
          text: instruction,
          status: 'running',
          metadata: this.buildTurnMetadata({
            streamKind: 'task',
            runtime: 'main',
            maxIterations,
          }),
        },
      ]);

      const messages = await this.createInitialMessages(input);

      /*
      const loopResult = await runAgenticLoop<AgentChatTurnItemMetadata>({
        initialMessages: messages,
        checkpoint: executionState.checkpoint
          ? {
              messages: cloneRuntimeMessages(executionState.checkpoint.messages),
              nextIteration,
            }
          : null,
        maxIterations,
        maxFinalAnswerChars: MAX_FINAL_MESSAGE_CHARS,
        callModel: async (loopMessages) => {
          this.ensureExecutionActive(runKey, executionId, threadId, turnId);
          return builtinAI.chat(modelId, loopMessages);
        },
        executeTool: async (toolName, params) => this.executeTool(toolName, params, {
          threadId,
          turnId,
          instruction,
          workspacePath,
          modelId,
        }),
        formatToolResult: (toolName, result) => this.buildToolResultForModel(toolName, result),
        generateFinalAnswer: async (loopMessages) => this.generateRecoveredFinalAnswer(
          runKey,
          executionId,
          threadId,
          turnId,
          modelId,
          loopMessages,
          randomUUID(),
        ),
        callbacks: {
          assertCanContinue: () => {
            this.ensureExecutionActive(runKey, executionId, threadId, turnId);
          },
          onCheckpoint: (checkpoint) => {
            this.setCheckpoint(runKey, checkpoint.messages, checkpoint.nextIteration);
          },
          onIterationStart: async (iteration) => {
            await this.appendTurnItem(threadId, turnId, {
              kind: 'step',
              title: `杩唬 ${iteration}`,
              status: 'running',
              metadata: this.buildTurnMetadata({
                streamKind: 'progress',
                streamId: `progress-${iteration}`,
                iteration,
              }),
            });
          },
          onThinking: async (decision, iteration) => {
            await this.appendTurnItem(threadId, turnId, {
              kind: 'thinking',
              title: `杩唬 ${iteration} 鎬濊矾`,
              text: decision.thinking,
              status: 'info',
              metadata: this.buildTurnMetadata({
                streamKind: 'reasoning',
                streamId: `reasoning-${iteration}`,
                iteration,
              }),
            });
          },
          onToolCall: async (toolCall) => {
            const toolCallMetadata = this.createToolCallMetadata(toolCall.toolName, toolCall.iteration);
            await this.appendTurnItem(threadId, turnId, {
              kind: 'tool_call',
              title: toolCall.toolName,
              text: safeJsonStringify(toolCall.parameters),
              status: 'running',
              metadata: toolCallMetadata,
            });
            return toolCallMetadata;
          },
          onToolResult: async ({ toolCall, result, formattedResult, toolCallContext }) => {
            const toolCallMetadata = toolCallContext ?? this.createToolCallMetadata(
              toolCall.toolName,
              toolCall.iteration,
            );

            await this.appendTurnItem(threadId, turnId, {
              kind: result.success ? 'tool_result' : 'error',
              title: toolCall.toolName,
              text: formattedResult,
              status: result.success ? 'completed' : 'failed',
              metadata: this.buildTurnMetadata({
                streamKind: result.success ? 'tool_result' : 'error',
                streamId: toolCallMetadata.streamId,
                toolCallId: toolCallMetadata.toolCallId,
                toolName: toolCall.toolName,
                iteration: toolCall.iteration,
                success: result.success,
              }),
            });
          },
          onFinalAnswer: async ({ text }) => {
            await this.appendRecoveredFinalContent(
              runKey,
              executionId,
              threadId,
              turnId,
              text,
              randomUUID(),
            );
          },
        },
      });

      if (!loopResult.finalOutput) {
        throw new Error('agent did not produce a final answer');
      }

      await this.completeTurn(threadId, turnId, 'completed', null);
      this.executionStates.delete(runKey);
      return;

      */
      let finalOutput = '';

      for (let index = 0; index < maxIterations; index += 1) {
        this.ensureTurnRunnable(threadId, turnId);

        const iteration = index + 1;
        await this.appendTurnItem(threadId, turnId, {
          kind: 'step',
          title: `迭代 ${iteration}`,
          status: 'running',
          metadata: this.buildTurnMetadata({
            streamKind: 'progress',
            streamId: `progress-${iteration}`,
            iteration,
          }),
        });

        const rawDecision = await builtinAI.chat(modelId, messages);
        this.ensureTurnRunnable(threadId, turnId);

        const decision = parseDecision(rawDecision);
        if (!decision) {
          finalOutput = truncateText(normalizeText(rawDecision), MAX_FINAL_MESSAGE_CHARS);
          if (finalOutput) {
            await this.appendTurnItem(threadId, turnId, {
              kind: 'content',
              title: '最终答复',
              text: finalOutput,
              status: 'completed',
              metadata: this.buildTurnMetadata({
                streamKind: 'final',
                streamId: randomUUID(),
              }),
            });
          }
          break;
        }

        if (decision.thinking) {
          await this.appendTurnItem(threadId, turnId, {
            kind: 'thinking',
            title: `迭代 ${iteration} 思路`,
            text: decision.thinking,
            status: 'info',
            metadata: this.buildTurnMetadata({
              streamKind: 'reasoning',
              streamId: `reasoning-${iteration}`,
              iteration,
            }),
          });
        }

        if (decision.action === 'final') {
          finalOutput = truncateText(decision.finalAnswer || '', MAX_FINAL_MESSAGE_CHARS);
          if (finalOutput) {
            await this.appendTurnItem(threadId, turnId, {
              kind: 'content',
              title: '最终答复',
              text: finalOutput,
              status: 'completed',
              metadata: this.buildTurnMetadata({
                streamKind: 'final',
                streamId: randomUUID(),
              }),
            });
          }
          break;
        }

        const toolName = decision.toolName || '';
        const params = decision.parameters ?? {};
        const toolCallMetadata = this.createToolCallMetadata(toolName, iteration);
        await this.appendTurnItem(threadId, turnId, {
          kind: 'tool_call',
          title: toolName,
          text: safeJsonStringify(params),
          status: 'running',
          metadata: toolCallMetadata,
        });

        const toolResult = await this.executeTool(toolName, params, {
          threadId,
          turnId,
          instruction,
          workspacePath,
          modelId,
        });
        this.ensureTurnRunnable(threadId, turnId);

        await this.appendTurnItem(threadId, turnId, {
          kind: toolResult.success ? 'tool_result' : 'error',
          title: toolName,
          text: this.buildToolResultForModel(toolName, toolResult),
          status: toolResult.success ? 'completed' : 'failed',
          metadata: this.buildTurnMetadata({
            streamKind: toolResult.success ? 'tool_result' : 'error',
            streamId: toolCallMetadata.streamId,
            toolCallId: toolCallMetadata.toolCallId,
            toolName,
            iteration,
            success: toolResult.success,
          }),
        });

        messages.push({
          role: 'assistant',
          content: safeJsonStringify({
            action: 'tool_call',
            tool_name: toolName,
            parameters: params,
            thinking: decision.thinking,
          }),
        });
        messages.push({
          role: 'user',
          content: `工具执行结果:\n${this.buildToolResultForModel(toolName, toolResult)}`,
        });
      }

      if (!finalOutput) {
        finalOutput = await this.generateFinalAnswer(threadId, turnId, modelId, messages);
      }

      if (!finalOutput) {
        throw new Error('agent did not produce a final answer');
      }

      await this.completeTurn(threadId, turnId, 'completed', null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof TurnInterruptedError)) {
        await this.appendTurnItem(threadId, turnId, {
          kind: 'error',
          title: 'Agent 运行错误',
          text: message,
          status: 'failed',
          metadata: this.buildTurnMetadata({
            streamKind: 'error',
            streamId: randomUUID(),
          }),
        });
        await this.completeTurn(threadId, turnId, 'error', message);
      }
    }
  }

  private async appendRecoveredFinalContent(
    runKey: string,
    executionId: string,
    threadId: string,
    turnId: string,
    text: string,
    responseKey: string,
  ): Promise<void> {
    this.ensureExecutionActive(runKey, executionId, threadId, turnId);
    await this.appendTurnItem(threadId, turnId, {
      kind: 'content',
      title: '最终答复',
      text,
      status: 'completed',
      metadata: this.buildTurnMetadata({
        streamKind: 'final',
        streamId: responseKey,
        responseKey,
      }),
    });
  }

  private async streamRecoveredFinalAnswer(
    runKey: string,
    executionId: string,
    threadId: string,
    turnId: string,
    modelId: string,
    messages: RuntimeMessage[],
    responseKey: string,
  ): Promise<string> {
    let output = '';
    this.logModelMessages(threadId, turnId, 'model request: final answer', messages);

    await new Promise<void>((resolve, reject) => {
      void builtinAI.streamChat(
        modelId,
        messages,
        (chunk) => {
          const turn = this.getTurnSummary(threadId, turnId);
          if (
            !this.isExecutionCurrent(runKey, executionId)
            || !turn
            || turn.status === 'interrupted'
            || turn.status === 'completed'
            || turn.status === 'error'
          ) {
            return;
          }

          output += chunk;
          void this.appendTurnItem(threadId, turnId, {
            kind: 'content',
            title: '最终答复',
            text: chunk,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'final',
              streamId: responseKey,
              responseKey,
              streamKey: responseKey,
            }),
          });
        },
        () => {
          resolve();
        },
        (error) => {
          reject(error);
        },
      );
    });

    this.ensureExecutionActive(runKey, executionId, threadId, turnId);
    this.logTurnEvent(threadId, turnId, 'model response: final answer', output.trim());
    return truncateText(output.trim(), MAX_FINAL_MESSAGE_CHARS);
  }

  private async generateRecoveredFinalAnswer(
    runKey: string,
    executionId: string,
    threadId: string,
    turnId: string,
    modelId: string,
    messages: RuntimeMessage[],
    responseKey: string,
  ): Promise<string> {
    return this.streamRecoveredFinalAnswer(
      runKey,
      executionId,
      threadId,
      turnId,
      modelId,
      buildForcedFinalAnswerMessages(messages),
      responseKey,
    );

    const finalMessages: RuntimeMessage[] = [
      ...messages,
      {
        role: 'user',
        content: '现在直接给出最终结果，不要再调用工具。请用中文简洁说明已完成的工作、结果和限制。',
      },
    ];

    return this.streamRecoveredFinalAnswer(
      runKey,
      executionId,
      threadId,
      turnId,
      modelId,
      finalMessages,
      responseKey,
    );
  }

  private async runAgenticExecutionLoop(runKey: string, isResumed = false): Promise<void> {
    const executionState = this.executionStates.get(runKey);
    if (!executionState) {
      throw new TurnInterruptedError();
    }

    const { input } = executionState;
    const executionId = executionState.executionId;
    const threadId = normalizeText(input.threadId);
    const turnId = normalizeText(input.turnId);
    const instruction = normalizeText(input.instruction);
    const workspacePath = normalizeText(input.workspacePath);
    const modelId = normalizeText(input.modelId);
    const maxIterations = Math.max(1, Math.min(12, toPositiveInteger(input.maxIterations, DEFAULT_MAX_ITERATIONS)));
    const maxModelCalls = Math.max(
      1,
      Math.min(MAX_MODEL_CALLS_LIMIT, toPositiveInteger(input.maxModelCalls, maxIterations + 1)),
    );

    try {
      if (!threadId || !turnId || !instruction || !workspacePath || !modelId) {
        throw new Error('threadId, turnId, instruction, workspacePath, modelId are required');
      }
      if (!fs.existsSync(workspacePath)) {
        throw new Error('workspace path does not exist');
      }

      agentChatRuntime.updateTurn({
        threadId,
        turnId,
        status: 'running',
        modelId,
        lastError: null,
      });
      this.ensureExecutionActive(runKey, executionId, threadId, turnId);

      if (!this.hasTurnItem(threadId, turnId, 'task')) {
        await this.appendTurnItems(threadId, turnId, [
          {
            kind: 'task',
            title: 'Agent 任务',
            text: instruction,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'task',
              runtime: 'main',
              maxIterations,
              maxModelCalls,
            }),
          },
        ]);
      }

      const initialMessages = executionState.checkpoint
        ? cloneRuntimeMessages(executionState.checkpoint.messages)
        : await this.createInitialMessages(input);
      this.ensureExecutionActive(runKey, executionId, threadId, turnId);
      this.logTurnEvent(threadId, turnId, isResumed ? 'run resumed' : 'run started', {
        workspacePath,
        modelId,
        maxIterations,
        maxModelCalls,
      });
      this.logModelMessages(threadId, turnId, 'initial messages', initialMessages);

      const nextIteration = executionState.checkpoint?.nextIteration ?? 1;
      if (isResumed) {
        const resumeText = nextIteration > maxIterations
          ? '继续生成最终答复。'
          : `从迭代 ${nextIteration} 继续执行。`;
        this.ensureExecutionActive(runKey, executionId, threadId, turnId);
        await this.appendTurnItem(threadId, turnId, {
          kind: 'step',
          title: '恢复执行',
          text: resumeText,
          status: 'info',
          metadata: this.buildTurnMetadata({
            streamKind: 'progress',
            streamId: `progress-resume-${nextIteration}`,
            resumed: true,
            nextIteration,
          }),
        });
      }

      const loopResult = await runAgenticLoop<AgentChatTurnItemMetadata>({
        initialMessages,
        checkpoint: executionState.checkpoint
          ? {
              messages: cloneRuntimeMessages(executionState.checkpoint.messages),
              nextIteration,
              modelCallsUsed: executionState.checkpoint.modelCallsUsed,
            }
          : null,
        maxIterations,
        maxModelCalls,
        maxFinalAnswerChars: MAX_FINAL_MESSAGE_CHARS,
        historyCompression: {
          maxMessageCount: 24,
          maxContextChars: 32000,
          preserveLastRounds: 10,
          maxSummaryChars: 4000,
        },
        callModel: async (loopMessages, iteration) => {
          this.ensureExecutionActive(runKey, executionId, threadId, turnId);
          return this.streamLoopDecisionResponse(
            runKey,
            executionId,
            threadId,
            turnId,
            modelId,
            loopMessages,
            iteration,
          );
        },
        executeTool: async (toolName, params) => this.executeTool(toolName, params, {
          threadId,
          turnId,
          instruction,
          workspacePath,
          modelId,
        }),
        formatToolResult: (toolName, result) => this.buildToolResultForModel(toolName, result),
        generateFinalAnswer: async (loopMessages) => this.generateRecoveredFinalAnswer(
          runKey,
          executionId,
          threadId,
          turnId,
          modelId,
          loopMessages,
          randomUUID(),
        ),
        callbacks: {
          assertCanContinue: () => {
            this.ensureExecutionActive(runKey, executionId, threadId, turnId);
          },
          onCheckpoint: (checkpoint) => {
            this.setCheckpoint(
              runKey,
              checkpoint.messages,
              checkpoint.nextIteration,
              checkpoint.modelCallsUsed ?? 0,
            );
          },
          onHistoryCompacted: async (event) => {
            this.logTurnEvent(threadId, turnId, 'history compacted', event);
            await this.appendTurnItem(threadId, turnId, {
              kind: 'step',
              title: '历史压缩',
              text: `已摘要更早历史，保留最近 10 轮。消息 ${event.originalMessageCount} -> ${event.compactedMessageCount}`,
              status: 'info',
              metadata: this.buildTurnMetadata({
                streamKind: 'progress',
                streamId: `history-compacted-${event.iteration ?? 'final'}-${Date.now()}`,
                iteration: event.iteration ?? undefined,
              }),
            });
          },
          onIterationStart: async (iteration) => {
            this.logTurnEvent(threadId, turnId, `iteration start: ${iteration}`);
            await this.appendTurnItem(threadId, turnId, {
              kind: 'step',
              title: `迭代 ${iteration}`,
              status: 'running',
              metadata: this.buildTurnMetadata({
                streamKind: 'progress',
                streamId: `progress-${iteration}`,
                iteration,
              }),
            });
          },
          onThinking: async (decision, iteration) => {
            this.logTurnEvent(threadId, turnId, `thinking: iteration ${iteration}`, decision.thinking);
            await this.appendTurnItem(threadId, turnId, {
              kind: 'thinking',
              title: `迭代 ${iteration} 思路`,
              text: decision.thinking,
              status: 'info',
              metadata: this.buildTurnMetadata({
                streamKind: 'reasoning',
                streamId: `reasoning-${iteration}`,
                iteration,
              }),
            });
          },
          onToolCall: async (toolCall) => {
            this.logTurnEvent(threadId, turnId, `tool planned: ${toolCall.toolName}`, {
              iteration: toolCall.iteration,
              params: toolCall.parameters,
            });
            const toolCallMetadata = this.createToolCallMetadata(toolCall.toolName, toolCall.iteration);
            await this.appendTurnItem(threadId, turnId, {
              kind: 'tool_call',
              title: toolCall.toolName,
              text: safeJsonStringify(toolCall.parameters),
              status: 'running',
              metadata: toolCallMetadata,
            });
            return toolCallMetadata;
          },
          onToolResult: async ({ toolCall, result, formattedResult, toolCallContext }) => {
            this.logTurnEvent(threadId, turnId, `tool completed: ${toolCall.toolName}`, {
              iteration: toolCall.iteration,
              success: result.success,
              formattedResult,
            });
            const toolCallMetadata = toolCallContext ?? this.createToolCallMetadata(
              toolCall.toolName,
              toolCall.iteration,
            );
            await this.appendTurnItem(threadId, turnId, {
              kind: result.success ? 'tool_result' : 'error',
              title: toolCall.toolName,
              text: formattedResult,
              status: result.success ? 'completed' : 'failed',
              metadata: this.buildTurnMetadata({
                streamKind: result.success ? 'tool_result' : 'error',
                streamId: toolCallMetadata.streamId,
                toolCallId: toolCallMetadata.toolCallId,
                toolName: toolCall.toolName,
                iteration: toolCall.iteration,
                success: result.success,
              }),
            });
          },
          onFinalAnswer: async ({ text }) => {
            this.logTurnEvent(threadId, turnId, 'final answer emitted', text);
            await this.appendRecoveredFinalContent(
              runKey,
              executionId,
              threadId,
              turnId,
              text,
              randomUUID(),
            );
          },
        },
      });

      if (!loopResult.finalOutput) {
        throw new Error('agent did not produce a final answer');
      }

      this.logTurnEvent(threadId, turnId, 'run completed', {
        terminationReason: loopResult.terminationReason,
        iterationsCompleted: loopResult.iterationsCompleted,
        finalOutput: loopResult.finalOutput,
      });
      await this.completeTurn(threadId, turnId, 'completed', null);
      this.executionStates.delete(runKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof TurnInterruptedError)) {
        this.logTurnEvent(threadId, turnId, 'run failed', { error: message });
        await this.appendTurnItem(threadId, turnId, {
          kind: 'error',
          title: 'Agent 运行错误',
          text: message,
          status: 'failed',
          metadata: this.buildTurnMetadata({
            streamKind: 'error',
            streamId: randomUUID(),
          }),
        });
        await this.completeTurn(threadId, turnId, 'error', message);
        this.executionStates.delete(runKey);
      }
    }
  }

  private async runExecutionLoop(runKey: string, isResumed = false): Promise<void> {
    const executionState = this.executionStates.get(runKey);
    if (!executionState) {
      throw new TurnInterruptedError();
    }

    const { input } = executionState;
    const executionId = executionState.executionId;
    const threadId = normalizeText(input.threadId);
    const turnId = normalizeText(input.turnId);
    const instruction = normalizeText(input.instruction);
    const workspacePath = normalizeText(input.workspacePath);
    const modelId = normalizeText(input.modelId);
    const maxIterations = Math.max(1, Math.min(12, toPositiveInteger(input.maxIterations, DEFAULT_MAX_ITERATIONS)));

    try {
      if (!threadId || !turnId || !instruction || !workspacePath || !modelId) {
        throw new Error('threadId, turnId, instruction, workspacePath, modelId are required');
      }
      if (!fs.existsSync(workspacePath)) {
        throw new Error('workspace path does not exist');
      }

      agentChatRuntime.updateTurn({
        threadId,
        turnId,
        status: 'running',
        modelId,
        lastError: null,
      });
      this.ensureExecutionActive(runKey, executionId, threadId, turnId);

      if (!this.hasTurnItem(threadId, turnId, 'task')) {
        await this.appendTurnItems(threadId, turnId, [
          {
            kind: 'task',
            title: 'Agent 任务',
            text: instruction,
            status: 'running',
            metadata: this.buildTurnMetadata({
              streamKind: 'task',
              runtime: 'main',
              maxIterations,
            }),
          },
        ]);
      }

      let messages = executionState.checkpoint
        ? cloneRuntimeMessages(executionState.checkpoint.messages)
        : await this.createInitialMessages(input);
      this.ensureExecutionActive(runKey, executionId, threadId, turnId);

      let nextIteration = executionState.checkpoint?.nextIteration ?? 1;
      if (!executionState.checkpoint) {
        this.setCheckpoint(runKey, messages, nextIteration);
      }

      if (isResumed) {
        const resumeText = nextIteration > maxIterations
          ? '继续生成最终答复。'
          : `从迭代 ${nextIteration} 继续执行。`;
        this.ensureExecutionActive(runKey, executionId, threadId, turnId);
        await this.appendTurnItem(threadId, turnId, {
          kind: 'step',
          title: '恢复执行',
          text: resumeText,
          status: 'info',
          metadata: this.buildTurnMetadata({
            streamKind: 'progress',
            streamId: `progress-resume-${nextIteration}`,
            resumed: true,
            nextIteration,
          }),
        });
      }

      let finalOutput = '';

      for (let iteration = nextIteration; iteration <= maxIterations; iteration += 1) {
        this.ensureExecutionActive(runKey, executionId, threadId, turnId);
        this.setCheckpoint(runKey, messages, iteration);

        await this.appendTurnItem(threadId, turnId, {
          kind: 'step',
          title: `迭代 ${iteration}`,
          status: 'running',
          metadata: this.buildTurnMetadata({
            streamKind: 'progress',
            streamId: `progress-${iteration}`,
            iteration,
          }),
        });

        const rawDecision = await builtinAI.chat(modelId, messages);
        this.ensureExecutionActive(runKey, executionId, threadId, turnId);

        const decision = parseDecision(rawDecision);
        if (!decision) {
          finalOutput = truncateText(normalizeText(rawDecision), MAX_FINAL_MESSAGE_CHARS);
          if (finalOutput) {
            await this.appendRecoveredFinalContent(
              runKey,
              executionId,
              threadId,
              turnId,
              finalOutput,
              randomUUID(),
            );
          }
          break;
        }

        if (decision.thinking) {
          this.ensureExecutionActive(runKey, executionId, threadId, turnId);
          await this.appendTurnItem(threadId, turnId, {
            kind: 'thinking',
            title: `迭代 ${iteration} 思路`,
            text: decision.thinking,
            status: 'info',
            metadata: this.buildTurnMetadata({
              streamKind: 'reasoning',
              streamId: `reasoning-${iteration}`,
              iteration,
            }),
          });
        }

        if (decision.action === 'final') {
          finalOutput = truncateText(decision.finalAnswer || '', MAX_FINAL_MESSAGE_CHARS);
          if (finalOutput) {
            await this.appendRecoveredFinalContent(
              runKey,
              executionId,
              threadId,
              turnId,
              finalOutput,
              randomUUID(),
            );
          }
          break;
        }

        const toolName = decision.toolName || '';
        const params = decision.parameters ?? {};

        this.ensureExecutionActive(runKey, executionId, threadId, turnId);
        const toolCallMetadata = this.createToolCallMetadata(toolName, iteration);
        await this.appendTurnItem(threadId, turnId, {
          kind: 'tool_call',
          title: toolName,
          text: safeJsonStringify(params),
          status: 'running',
          metadata: toolCallMetadata,
        });

        const toolResult = await this.executeTool(toolName, params, {
          threadId,
          turnId,
          instruction,
          workspacePath,
          modelId,
        });
        this.ensureExecutionActive(runKey, executionId, threadId, turnId);

        const toolResultText = this.buildToolResultForModel(toolName, toolResult);
        await this.appendTurnItem(threadId, turnId, {
          kind: toolResult.success ? 'tool_result' : 'error',
          title: toolName,
          text: toolResultText,
          status: toolResult.success ? 'completed' : 'failed',
          metadata: this.buildTurnMetadata({
            streamKind: toolResult.success ? 'tool_result' : 'error',
            streamId: toolCallMetadata.streamId,
            toolCallId: toolCallMetadata.toolCallId,
            toolName,
            iteration,
            success: toolResult.success,
          }),
        });

        messages = [
          ...messages,
          {
            role: 'assistant',
            content: safeJsonStringify({
              action: 'tool_call',
              tool_name: toolName,
              parameters: params,
              thinking: decision.thinking,
            }),
          },
          {
            role: 'user',
            content: `工具执行结果:\n${toolResultText}`,
          },
        ];
        this.setCheckpoint(runKey, messages, iteration + 1);
      }

      if (!finalOutput) {
        this.setCheckpoint(runKey, messages, maxIterations + 1);
        finalOutput = await this.generateRecoveredFinalAnswer(
          runKey,
          executionId,
          threadId,
          turnId,
          modelId,
          messages,
          randomUUID(),
        );
      }

      if (!finalOutput) {
        throw new Error('agent did not produce a final answer');
      }

      await this.completeTurn(threadId, turnId, 'completed', null);
      this.executionStates.delete(runKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof TurnInterruptedError)) {
        await this.appendTurnItem(threadId, turnId, {
          kind: 'error',
          title: 'Agent 运行错误',
          text: message,
          status: 'failed',
          metadata: this.buildTurnMetadata({
            streamKind: 'error',
            streamId: randomUUID(),
          }),
        });
        await this.completeTurn(threadId, turnId, 'error', message);
        this.executionStates.delete(runKey);
      }
    }
  }
}

export const mainAgentRuntime = new MainAgentRuntime();
