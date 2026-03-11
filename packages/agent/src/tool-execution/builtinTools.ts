/**
 * Built-in workspace tool definitions and executors for the Agent package.
 */

import { exec, type ExecException } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { TextDecoder } from 'util';
import type {
  AgentExecutableToolDefinition,
  AgentToolDiffChange,
  AgentToolExecutionResult,
  AgentToolSearchMatch,
  AgentWorkspaceToolOptions,
  ResolvedAgentWorkspaceToolOptions,
} from '../types';
import {
  assessCommandSecurity,
  containsForbiddenPath,
  ensureWritablePath,
  isBinaryBuffer,
  resolveAgentWorkspaceToolOptions,
  resolveDisplayPath,
  resolveWorkspacePath,
} from './security';

const CJK_CHAR_REGEX = /[\u3400-\u9FFF]/g;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const BOM_UTF16LE_0 = 0xFF;
const BOM_UTF16LE_1 = 0xFE;
const UTF8_OUTPUT_HINT_REGEX = /(UTF8Encoding|OutputEncoding|chcp\s+65001|encoding\s*=\s*['"]?utf-?8['"]?)/i;

interface ListDirectoryEntry {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  size: number;
  modifiedAt: number;
}

interface ApplyDiffResult {
  content: string;
  replacements: number;
  editCount: number;
}

interface PreparedBundleFileOperation {
  resolvedPath: string;
  displayPath: string;
  content: string;
  existed: boolean;
  mode: 'write' | 'diff';
}

const normalizeText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

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
  let startIndex = 0;

  while (true) {
    const matchIndex = source.indexOf(search, startIndex);
    if (matchIndex < 0) {
      return count;
    }

    count += 1;
    startIndex = matchIndex + search.length;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const scoreDecodedText = (value: string): number => {
  const cjkCount = (value.match(CJK_CHAR_REGEX) || []).length;
  const replacementCount = (value.match(REPLACEMENT_CHAR_REGEX) || []).length;
  const controlCount = (value.match(CONTROL_CHAR_REGEX) || []).length;
  return (cjkCount * 4) - (replacementCount * 10) - (controlCount * 2);
};

const decodeBufferWithEncoding = (value: Buffer, encoding: string): string | null => {
  try {
    return new TextDecoder(encoding as BufferEncoding, { fatal: false }).decode(value);
  } catch {
    return null;
  }
};

const decodeBufferStrict = (value: Buffer, encoding: string): string | null => {
  try {
    return new TextDecoder(encoding as BufferEncoding, { fatal: true }).decode(value);
  } catch {
    return null;
  }
};

const hasUtf16LeBOM = (value: Buffer): boolean =>
  value.length >= 2
  && value[0] === BOM_UTF16LE_0
  && value[1] === BOM_UTF16LE_1;

const hasManyNullBytes = (value: Buffer): boolean => {
  if (value.length < 8) {
    return false;
  }

  const sampleSize = Math.min(value.length, 4096);
  let nullCount = 0;
  for (let index = 0; index < sampleSize; index += 1) {
    if (value[index] === 0x00) {
      nullCount += 1;
    }
  }

  return (nullCount / sampleSize) > 0.08;
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

  const looksUtf16 = hasUtf16LeBOM(value) || hasManyNullBytes(value);
  if (looksUtf16) {
    const utf16Text = decodeBufferWithEncoding(value, 'utf-16le');
    if (utf16Text) {
      return utf16Text;
    }
  }

  const strictUtf8Text = decodeBufferStrict(value, 'utf-8');
  if (strictUtf8Text && !looksUtf16) {
    return strictUtf8Text;
  }

  if (preferUtf8) {
    return strictUtf8Text || value.toString('utf8');
  }

  const utf8Text = strictUtf8Text || value.toString('utf8');
  const gbkText = decodeBufferWithEncoding(value, 'gbk');
  if (!gbkText) {
    return utf8Text;
  }

  return scoreDecodedText(gbkText) > scoreDecodedText(utf8Text)
    ? gbkText
    : utf8Text;
};

const isShellSpawnNotFound = (error: ExecException | null): boolean => {
  if (!error) {
    return false;
  }

  const code = String(error.code ?? '').toUpperCase();
  return code === 'ENOENT' || /spawn .* ENOENT/i.test(error.message || '');
};

const getWindowsShellCandidates = (): string[] => {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    process.env.ComSpec,
    `${systemRoot}\\System32\\cmd.exe`,
    `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    'powershell.exe',
    'pwsh.exe',
    'cmd.exe',
  ];

  const deduped = new Set<string>();
  const results: string[] = [];

  for (const candidateValue of candidates) {
    if (typeof candidateValue !== 'string') {
      continue;
    }

    const candidate = candidateValue.trim();
    if (!candidate) {
      continue;
    }

    const lowerCaseCandidate = candidate.toLowerCase();
    if (deduped.has(lowerCaseCandidate)) {
      continue;
    }

    const isAbsolute = /^(?:[a-zA-Z]:\\|\\\\)/.test(candidate);
    if (isAbsolute && !fs.existsSync(candidate)) {
      continue;
    }

    deduped.add(lowerCaseCandidate);
    results.push(candidate);
  }

  return results;
};

const buildChangedFiles = (workspacePath: string, filePath: string): string[] => [
  resolveDisplayPath(workspacePath, filePath),
];

const applyDiffChanges = (content: string, changes: AgentToolDiffChange[]): ApplyDiffResult => {
  let nextContent = content;
  let replacements = 0;

  for (const change of changes) {
    if (!change.search) {
      throw new Error('each diff change.search is required');
    }

    const occurrenceCount = countOccurrences(nextContent, change.search);
    if (occurrenceCount === 0) {
      throw new Error(`diff search text not found: ${change.search.slice(0, 80)}`);
    }

    if (change.replaceAll === true) {
      nextContent = nextContent.split(change.search).join(change.replace);
      replacements += occurrenceCount;
      continue;
    }

    if (occurrenceCount > 1) {
      throw new Error(`diff search text is ambiguous and matched ${occurrenceCount} times`);
    }

    nextContent = nextContent.replace(change.search, change.replace);
    replacements += 1;
  }

  return {
    content: nextContent,
    replacements,
    editCount: changes.length,
  };
};

const parseDiffChanges = (value: unknown): AgentToolDiffChange[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<AgentToolDiffChange[]>((acc, item) => {
    if (!isRecord(item)) {
      return acc;
    }

    const search = typeof item.search === 'string'
      ? item.search
      : (typeof item.oldText === 'string' ? item.oldText : '');
    const replace = typeof item.replace === 'string'
      ? item.replace
      : (typeof item.newText === 'string' ? item.newText : '');

    if (!search) {
      return acc;
    }

    acc.push({
      search,
      replace,
      replaceAll: item.replaceAll === true,
    });
    return acc;
  }, []);
};

const ensureRecord = (value: unknown, errorMessage: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(errorMessage);
  }

  return value;
};

const prepareBundleFileOperation = async (
  value: unknown,
  workspacePath: string,
  options: ResolvedAgentWorkspaceToolOptions,
): Promise<PreparedBundleFileOperation> => {
  const item = ensureRecord(value, 'each files item must be an object');
  const resolvedPath = resolveWorkspacePath(workspacePath, normalizeText(item.path), options);
  ensureWritablePath(resolvedPath, options);

  const existed = await fsp.access(resolvedPath).then(() => true).catch(() => false);
  const directContent = typeof item.content === 'string' ? item.content : null;

  if (directContent !== null) {
    return {
      resolvedPath,
      displayPath: resolveDisplayPath(workspacePath, resolvedPath),
      content: directContent,
      existed,
      mode: 'write',
    };
  }

  const changes = parseDiffChanges(item.changes ?? item.edits);
  if (changes.length === 0) {
    throw new Error('each files item must provide content or changes');
  }

  const currentContent = await fsp.readFile(resolvedPath, 'utf8');
  const result = applyDiffChanges(currentContent, changes);
  return {
    resolvedPath,
    displayPath: resolveDisplayPath(workspacePath, resolvedPath),
    content: result.content,
    existed,
    mode: 'diff',
  };
};

const parseSearchMatches = (
  filePath: string,
  content: string,
  query: string,
  caseSensitive: boolean,
  maxResults: number,
): AgentToolSearchMatch[] => {
  if (!query) {
    return [];
  }

  const normalizedQuery = caseSensitive ? query : query.toLowerCase();
  const lines = content.split(/\r?\n/);
  const matches: AgentToolSearchMatch[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (matches.length >= maxResults) {
      break;
    }

    const lineContent = lines[index];
    const normalizedLine = caseSensitive ? lineContent : lineContent.toLowerCase();
    let startIndex = 0;

    while (matches.length < maxResults) {
      const matchIndex = normalizedLine.indexOf(normalizedQuery, startIndex);
      if (matchIndex < 0) {
        break;
      }

      matches.push({
        path: filePath,
        lineNumber: index + 1,
        lineContent,
        matchStart: matchIndex,
        matchEnd: matchIndex + query.length,
      });
      startIndex = matchIndex + query.length;
    }
  }

  return matches;
};

const collectDirectoryEntries = async (
  workspacePath: string,
  currentPath: string,
  options: ResolvedAgentWorkspaceToolOptions,
  recursive: boolean,
  maxDepth: number,
  depth: number,
  results: ListDirectoryEntry[],
): Promise<void> => {
  if (depth > maxDepth || results.length >= options.maxListEntries) {
    return;
  }

  const dirEntries = await fsp.readdir(currentPath, { withFileTypes: true });
  const sortedEntries = [...dirEntries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (results.length >= options.maxListEntries) {
      return;
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    if (containsForbiddenPath(fullPath, options)) {
      continue;
    }

    const stats = await fsp.stat(fullPath);
    results.push({
      name: entry.name,
      path: resolveDisplayPath(workspacePath, fullPath),
      kind: entry.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      modifiedAt: stats.mtimeMs,
    });

    if (recursive && entry.isDirectory()) {
      await collectDirectoryEntries(
        workspacePath,
        fullPath,
        options,
        recursive,
        maxDepth,
        depth + 1,
        results,
      );
    }
  }
};

const searchFilesInWorkspace = async (
  workspacePath: string,
  basePath: string,
  query: string,
  caseSensitive: boolean,
  options: ResolvedAgentWorkspaceToolOptions,
): Promise<{ matches: AgentToolSearchMatch[]; scannedFiles: number; truncated: boolean }> => {
  const matches: AgentToolSearchMatch[] = [];
  let scannedFiles = 0;

  const walk = async (currentPath: string): Promise<void> => {
    if (matches.length >= options.maxSearchResults) {
      return;
    }

    const stats = await fsp.stat(currentPath);
    if (stats.isFile()) {
      scannedFiles += 1;
      if (stats.size > options.maxSearchFileBytes) {
        return;
      }

      const buffer = await fsp.readFile(currentPath);
      if (isBinaryBuffer(buffer)) {
        return;
      }

      const content = buffer.toString('utf8');
      const fileMatches = parseSearchMatches(
        resolveDisplayPath(workspacePath, currentPath),
        content,
        query,
        caseSensitive,
        options.maxSearchResults - matches.length,
      );
      matches.push(...fileMatches);
      return;
    }

    if (!stats.isDirectory()) {
      return;
    }

    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of sortedEntries) {
      if (matches.length >= options.maxSearchResults) {
        return;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      const fullPath = path.join(currentPath, entry.name);
      if (containsForbiddenPath(fullPath, options)) {
        continue;
      }

      await walk(fullPath);
    }
  };

  await walk(basePath);

  return {
    matches,
    scannedFiles,
    truncated: matches.length >= options.maxSearchResults,
  };
};

const executeShellCommand = async (
  command: string,
  workspacePath: string,
  timeoutMs: number,
  options: ResolvedAgentWorkspaceToolOptions,
): Promise<AgentToolExecutionResult> => {
  const securityAssessment = assessCommandSecurity(command, options);
  if (securityAssessment.level === 'blocked') {
    throw new Error(securityAssessment.reasons[0] || 'command blocked by security policy');
  }

  const preferUtf8 = UTF8_OUTPUT_HINT_REGEX.test(command);

  const runExecWithShell = async (
    shellOverride: string | undefined,
  ): Promise<{ result: AgentToolExecutionResult; shellNotFound: boolean }> =>
    new Promise(resolve => {
      exec(
        command,
        {
          cwd: workspacePath,
          timeout: Math.min(timeoutMs, options.maxCommandTimeoutMs),
          maxBuffer: options.maxCommandBufferBytes,
          encoding: 'buffer',
          env: { ...process.env },
          windowsHide: true,
          shell: shellOverride,
        },
        (
          error: ExecException | null,
          stdout: string | Buffer,
          stderr: string | Buffer,
        ) => {
          const decodedStdout = decodeShellOutput(stdout as Buffer | string | undefined, preferUtf8);
          const decodedStderr = decodeShellOutput(stderr as Buffer | string | undefined, preferUtf8);

          if (error) {
            if (isShellSpawnNotFound(error)) {
              resolve({
                shellNotFound: true,
              result: {
                success: false,
                error: error.message,
                data: {
                  command,
                  security: securityAssessment,
                  stdout: decodedStdout,
                  stderr: decodedStderr || error.message,
                  exitCode: -1,
                  },
                },
              });
              return;
            }

            resolve({
              shellNotFound: false,
              result: {
                success: false,
                error: error.killed
                  ? `command timed out after ${timeoutMs}ms`
                  : error.message,
                data: {
                  command,
                  security: securityAssessment,
                  stdout: decodedStdout,
                  stderr: decodedStderr || error.message,
                  exitCode: typeof error.code === 'number' ? error.code : 1,
                },
              },
            });
            return;
          }

          resolve({
            shellNotFound: false,
            result: {
              success: true,
              data: {
                command,
                security: securityAssessment,
                stdout: decodedStdout,
                stderr: decodedStderr,
                exitCode: 0,
              },
            },
          });
        },
      );
    });

  const shellCandidates = process.platform === 'win32'
    ? [undefined, ...getWindowsShellCandidates()]
    : [undefined];
  let lastShellNotFoundError = '';

  for (const shellCandidate of shellCandidates) {
    const attempt = await runExecWithShell(shellCandidate);
    if (!attempt.shellNotFound) {
      return attempt.result;
    }

    if (attempt.result.error) {
      lastShellNotFoundError = attempt.result.error;
    }
  }

  return {
    success: false,
    error: lastShellNotFoundError || 'command execution failed: no available shell',
    data: {
      command,
      security: securityAssessment,
    },
  };
};

const createApplyDiffTool = (
  options: ResolvedAgentWorkspaceToolOptions,
): AgentExecutableToolDefinition => ({
  name: 'apply_diff',
  description: '精确修改工作区文件，只替换明确指定的片段，避免整文件重写。',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '目标文件路径，支持相对工作区路径。' },
      changes: {
        type: 'array',
        description: '差异列表。每一项都要提供 search 和 replace，可选 replaceAll。',
        items: {
          type: 'object',
          description: '单个精确替换操作。',
          properties: {
            search: { type: 'string', description: '要匹配的原始文本，必须与文件内容精确一致。' },
            replace: { type: 'string', description: '替换后的文本。' },
            replaceAll: { type: 'boolean', description: '是否替换全部匹配项。默认 false。' },
          },
          required: ['search', 'replace'],
        },
      },
    },
    required: ['path', 'changes'],
  },
  requiresConfirmation: true,
  requestType: 'diff_apply',
  execute: async (input, context) => {
    const resolvedPath = resolveWorkspacePath(context.workspacePath, normalizeText(input.path), options);
    ensureWritablePath(resolvedPath, options);

    const changes = parseDiffChanges(input.changes);
    if (changes.length === 0) {
      throw new Error('changes must contain at least one diff change');
    }

    const content = await fsp.readFile(resolvedPath, 'utf8');
    const result = applyDiffChanges(content, changes);
    await fsp.writeFile(resolvedPath, result.content, 'utf8');

    return {
      success: true,
      data: {
        path: resolveDisplayPath(context.workspacePath, resolvedPath),
        replacements: result.replacements,
        editCount: result.editCount,
      },
      changedFiles: buildChangedFiles(context.workspacePath, resolvedPath),
    };
  },
});

export const createBuiltinWorkspaceTools = (
  toolOptions?: AgentWorkspaceToolOptions,
): AgentExecutableToolDefinition[] => {
  const options = resolveAgentWorkspaceToolOptions(toolOptions);
  const applyDiffTool = createApplyDiffTool(options);

  return [
    {
      name: 'list_files',
      description: '列出工作区目录结构，适合在读取文件前先了解有哪些文件和文件夹。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径。为空时默认使用工作区根目录。' },
          recursive: { type: 'boolean', description: '是否递归列出子目录。默认 false。' },
          maxDepth: { type: 'number', description: `递归深度，默认 2，最大 ${options.maxListDepth}。` },
        },
      },
      execute: async (input, context) => {
        const targetPath = normalizeText(input.path) || '.';
        const resolvedPath = resolveWorkspacePath(context.workspacePath, targetPath, options);
        const stats = await fsp.stat(resolvedPath);
        if (!stats.isDirectory()) {
          throw new Error('path is not a directory');
        }

        const recursive = input.recursive === true;
        const maxDepth = Math.min(options.maxListDepth, toPositiveInteger(input.maxDepth, 2));
        const entries: ListDirectoryEntry[] = [];

        await collectDirectoryEntries(
          context.workspacePath,
          resolvedPath,
          options,
          recursive,
          maxDepth,
          0,
          entries,
        );

        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            entries,
            items: entries,
            truncated: entries.length >= options.maxListEntries,
          },
        };
      },
    },
    {
      name: 'read_file',
      description: '读取工作区文件内容，用于分析、提取上下文或确认改动前后的文件状态。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径。' },
        },
        required: ['path'],
      },
      execute: async (input, context) => {
        const resolvedPath = resolveWorkspacePath(context.workspacePath, normalizeText(input.path), options);
        const stats = await fsp.stat(resolvedPath);
        if (!stats.isFile()) {
          throw new Error('path is not a file');
        }

        const content = await fsp.readFile(resolvedPath, 'utf8');
        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            content: content.length > options.maxFileChars
              ? `${content.slice(0, options.maxFileChars)}\n...[truncated ${content.length - options.maxFileChars} chars]`
              : content,
            truncated: content.length > options.maxFileChars,
            size: stats.size,
          },
        };
      },
    },
    {
      name: 'write_file',
      description: '创建或覆盖工作区文件，适合在生成完整文件内容时使用。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          content: { type: 'string', description: '完整文件内容。' },
        },
        required: ['path', 'content'],
      },
      requiresConfirmation: true,
      requestType: 'file_write',
      execute: async (input, context) => {
        const resolvedPath = resolveWorkspacePath(context.workspacePath, normalizeText(input.path), options);
        ensureWritablePath(resolvedPath, options);

        const content = typeof input.content === 'string' ? input.content : '';
        const existed = await fsp.access(resolvedPath).then(() => true).catch(() => false);

        await fsp.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fsp.writeFile(resolvedPath, content, 'utf8');

        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, resolvedPath),
            bytesWritten: Buffer.byteLength(content, 'utf8'),
            existed,
          },
          changedFiles: buildChangedFiles(context.workspacePath, resolvedPath),
        };
      },
    },
    {
      name: 'search_files',
      description: '在工作区内按关键词搜索文本，避免盲目逐个读取文件。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '搜索起点。为空时默认搜索整个工作区。' },
          query: { type: 'string', description: '要搜索的关键词或字符串。' },
          caseSensitive: { type: 'boolean', description: '是否区分大小写。默认 false。' },
          maxResults: { type: 'number', description: `最大返回结果数，默认 ${options.maxSearchResults}。` },
        },
        required: ['query'],
      },
      execute: async (input, context) => {
        const basePath = resolveWorkspacePath(context.workspacePath, normalizeText(input.path) || '.', options);
        const query = typeof input.query === 'string' ? input.query : '';
        if (!query) {
          throw new Error('query is required');
        }

        const caseSensitive = input.caseSensitive === true;
        const maxResults = Math.min(options.maxSearchResults, toPositiveInteger(input.maxResults, options.maxSearchResults));
        const scopedOptions: ResolvedAgentWorkspaceToolOptions = {
          ...options,
          maxSearchResults: maxResults,
        };
        const result = await searchFilesInWorkspace(
          context.workspacePath,
          basePath,
          query,
          caseSensitive,
          scopedOptions,
        );

        return {
          success: true,
          data: {
            path: resolveDisplayPath(context.workspacePath, basePath),
            query,
            count: result.matches.length,
            scannedFiles: result.scannedFiles,
            truncated: result.truncated,
            matches: result.matches,
            items: result.matches,
          },
        };
      },
    },
    applyDiffTool,
    {
      name: 'apply_diff_bundle',
      description: '一次性提交多个文件的写入或精确 diff 修改，适合跨文件协同改动，并方便审批层按文件展示变更集。',
      input_schema: {
        type: 'object',
        properties: {
          files: {
            type: 'array',
            description: '变更文件列表。每项必须提供 path，并且二选一提供 content 或 changes。',
            items: {
              type: 'object',
              description: '单个文件变更定义。',
              properties: {
                path: { type: 'string', description: '目标文件路径，支持相对工作区路径。' },
                content: { type: 'string', description: '直接写入的完整文件内容。' },
                changes: {
                  type: 'array',
                  description: '精确 diff 列表；提供时会基于原文件内容逐项替换。',
                  items: {
                    type: 'object',
                    properties: {
                      search: { type: 'string', description: '要匹配的原始文本。' },
                      replace: { type: 'string', description: '替换后的文本。' },
                      replaceAll: { type: 'boolean', description: '是否替换全部匹配项。' },
                    },
                    required: ['search', 'replace'],
                  },
                },
              },
              required: ['path'],
            },
          },
        },
        required: ['files'],
      },
      requiresConfirmation: true,
      requestType: 'diff_apply',
      execute: async (input, context) => {
        if (!Array.isArray(input.files) || input.files.length === 0) {
          throw new Error('files must contain at least one file change');
        }

        const operations: PreparedBundleFileOperation[] = [];
        for (const item of input.files) {
          operations.push(await prepareBundleFileOperation(item, context.workspacePath, options));
        }

        for (const operation of operations) {
          await fsp.mkdir(path.dirname(operation.resolvedPath), { recursive: true });
          await fsp.writeFile(operation.resolvedPath, operation.content, 'utf8');
        }

        return {
          success: true,
          data: {
            fileCount: operations.length,
            files: operations.map(operation => ({
              path: operation.displayPath,
              existed: operation.existed,
              mode: operation.mode,
            })),
          },
          changedFiles: operations.map(operation => operation.displayPath),
        };
      },
    },
    {
      name: 'edit_file',
      description: '兼容型精确编辑工具，单次替换文件中的一段文本。推荐优先使用 apply_diff。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          oldText: { type: 'string', description: '要替换的原始文本。' },
          newText: { type: 'string', description: '替换后的文本。' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配项。默认 false。' },
        },
        required: ['path', 'oldText', 'newText'],
      },
      requiresConfirmation: true,
      requestType: 'diff_apply',
      execute: async (input, context) => applyDiffTool.execute(
        {
          path: input.path,
          changes: [{
            search: input.oldText,
            replace: input.newText,
            replaceAll: input.replaceAll,
          }],
        },
        context,
      ),
    },
    {
      name: 'multi_edit_file',
      description: '兼容型精确编辑工具，顺序执行多次局部替换。推荐优先使用 apply_diff。',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标文件路径。' },
          edits: {
            type: 'array',
            description: '替换列表。每一项包含 oldText、newText，可选 replaceAll。',
            items: {
              type: 'object',
              description: '单次文本替换。',
              properties: {
                oldText: { type: 'string', description: '要替换的原始文本。' },
                newText: { type: 'string', description: '替换后的文本。' },
                replaceAll: { type: 'boolean', description: '是否替换全部匹配项。默认 false。' },
              },
              required: ['oldText', 'newText'],
            },
          },
        },
        required: ['path', 'edits'],
      },
      requiresConfirmation: true,
      requestType: 'diff_apply',
      execute: async (input, context) => applyDiffTool.execute(
        {
          path: input.path,
          changes: Array.isArray(input.edits)
            ? input.edits.map(item => {
                const edit = isRecord(item) ? item : {};
                return {
                  search: edit.oldText,
                  replace: edit.newText,
                  replaceAll: edit.replaceAll,
                };
              })
            : [],
        },
        context,
      ),
    },
    {
      name: 'bash',
      description: '在工作区中执行受控 shell 命令，可用于安装依赖、运行测试或执行脚本，但会经过安全策略和审批。',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令。' },
          timeoutMs: { type: 'number', description: `超时时间，单位毫秒，最大 ${options.maxCommandTimeoutMs}。` },
          rollbackCommand: { type: 'string', description: '可选。如果该命令有可安全撤销的反向操作，在这里提供回滚命令。' },
        },
        required: ['command'],
      },
      requiresConfirmation: true,
      requestType: 'command_execute',
      execute: async (input, context) => {
        const command = normalizeText(input.command);
        if (!command) {
          throw new Error('command is required');
        }

        const timeoutMs = Math.min(
          options.maxCommandTimeoutMs,
          toPositiveInteger(input.timeoutMs, 30000),
        );

        return executeShellCommand(command, context.workspacePath, timeoutMs, options);
      },
    },
  ];
};
