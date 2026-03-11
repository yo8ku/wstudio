/**
 * Shared workspace security helpers used by Agent tool executors.
 */

import * as path from 'path';
import type {
  AgentCommandSecurityAssessment,
  AgentWorkspaceToolOptions,
  ResolvedAgentWorkspaceToolOptions,
} from '../types';

export const DEFAULT_ALLOWED_WRITE_EXTENSIONS = [
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
];

export const DEFAULT_FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])\.env(\.|$|[\\/])/i,
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /password/i,
  /secret/i,
];

export const DEFAULT_FORBIDDEN_COMMAND_PATTERNS: RegExp[] = [
  /\.\.[\\/]/,
  /rm\s+-rf\s+\//i,
  /format\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /git\s+reset\s+--hard/i,
  /git\s+clean\s+-fd/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rmdir\s+\/s\s+\/q\s+[a-z]:\\/i,
  /Remove-Item\s+-Recurse\s+-Force\s+[a-z]:\\/i,
];

export const DEFAULT_HIGH_RISK_COMMAND_PATTERNS: RegExp[] = [
  /\b(?:rm|del|erase|rmdir|rd|Remove-Item|mv|move|Move-Item|ren|rename|Rename-Item)\b/i,
  /\b(?:npm|pnpm|yarn)\s+(?:install|add|remove|update|upgrade|uninstall)\b/i,
  /\b(?:pip|pip3|python\s+-m\s+pip|uv\s+pip|poetry)\s+(?:install|add|remove|update|uninstall)\b/i,
  /\b(?:apt|apt-get|yum|dnf|brew|winget|choco)\b/i,
  /\b(?:reg|sc|netsh|bcdedit|Set-ExecutionPolicy|Set-ItemProperty|New-ItemProperty|Set-Service)\b/i,
  /\bgit\s+(?:commit|push|rebase|merge|cherry-pick|stash(?:\s+pop)?|tag)\b/i,
];

export const DEFAULT_BLOCKED_DIRECTORY_CHANGE_COMMAND_PATTERNS: RegExp[] = [
  /(?:^|[;&|]\s*|&&\s*|\|\|\s*)cd(?:\s+|$)/i,
  /(?:^|[;&|]\s*|&&\s*|\|\|\s*)(?:pushd|popd|chdir|Set-Location|sl)\b/i,
  /(?:^|[;&|]\s*|&&\s*|\|\|\s*)[a-zA-Z]:\s*(?=$|[;&|])/,
];

const DEFAULT_MAX_LIST_ENTRIES = 200;
const DEFAULT_MAX_LIST_DEPTH = 4;
const DEFAULT_MAX_FILE_CHARS = 24000;
const DEFAULT_MAX_SEARCH_RESULTS = 200;
const DEFAULT_MAX_SEARCH_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_COMMAND_TIMEOUT_MS = 120000;
const DEFAULT_MAX_COMMAND_BUFFER_BYTES = 1024 * 1024;
const ABSOLUTE_PATH_REFERENCE_REGEX = /(^|[\s"'`])(?:~[\\/]|[a-zA-Z]:[\\/]|\/(?:etc|usr|var|root|home|opt|private|Library)\b)/i;

type AgentWorkspaceToolOptionInput = AgentWorkspaceToolOptions | ResolvedAgentWorkspaceToolOptions;

const toPositiveInteger = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
};

const isResolvedAgentWorkspaceToolOptions = (
  value: AgentWorkspaceToolOptionInput | undefined,
): value is ResolvedAgentWorkspaceToolOptions =>
  !!value && value.allowedWriteExtensions instanceof Set;

export const resolveAgentWorkspaceToolOptions = (
  options?: AgentWorkspaceToolOptionInput,
): ResolvedAgentWorkspaceToolOptions => {
  if (isResolvedAgentWorkspaceToolOptions(options)) {
    return {
      ...options,
      allowedWriteExtensions: new Set(options.allowedWriteExtensions),
      forbiddenPathPatterns: [...options.forbiddenPathPatterns],
      forbiddenCommandPatterns: [...options.forbiddenCommandPatterns],
      highRiskCommandPatterns: [...options.highRiskCommandPatterns],
      blockedDirectoryChangeCommandPatterns: [...options.blockedDirectoryChangeCommandPatterns],
    };
  }

  return {
    maxListEntries: toPositiveInteger(options?.maxListEntries, DEFAULT_MAX_LIST_ENTRIES),
    maxListDepth: toPositiveInteger(options?.maxListDepth, DEFAULT_MAX_LIST_DEPTH),
    maxFileChars: toPositiveInteger(options?.maxFileChars, DEFAULT_MAX_FILE_CHARS),
    maxSearchResults: toPositiveInteger(options?.maxSearchResults, DEFAULT_MAX_SEARCH_RESULTS),
    maxSearchFileBytes: toPositiveInteger(options?.maxSearchFileBytes, DEFAULT_MAX_SEARCH_FILE_BYTES),
    maxCommandTimeoutMs: toPositiveInteger(options?.maxCommandTimeoutMs, DEFAULT_MAX_COMMAND_TIMEOUT_MS),
    maxCommandBufferBytes: toPositiveInteger(options?.maxCommandBufferBytes, DEFAULT_MAX_COMMAND_BUFFER_BYTES),
    allowedWriteExtensions: new Set(
      (options?.allowedWriteExtensions ?? DEFAULT_ALLOWED_WRITE_EXTENSIONS).map(value => value.toLowerCase()),
    ),
    forbiddenPathPatterns: [...(options?.forbiddenPathPatterns ?? DEFAULT_FORBIDDEN_PATH_PATTERNS)],
    forbiddenCommandPatterns: [...(options?.forbiddenCommandPatterns ?? DEFAULT_FORBIDDEN_COMMAND_PATTERNS)],
    highRiskCommandPatterns: [...(options?.highRiskCommandPatterns ?? DEFAULT_HIGH_RISK_COMMAND_PATTERNS)],
    blockedDirectoryChangeCommandPatterns: [
      ...(options?.blockedDirectoryChangeCommandPatterns ?? DEFAULT_BLOCKED_DIRECTORY_CHANGE_COMMAND_PATTERNS),
    ],
  };
};

const buildHighRiskReasons = (command: string): string[] => {
  const reasons: string[] = [];

  if (/\b(?:rm|del|erase|rmdir|rd|Remove-Item|mv|move|Move-Item|ren|rename|Rename-Item)\b/i.test(command)) {
    reasons.push('命令包含删除、移动或重命名等破坏性文件操作');
  }

  if (/\b(?:npm|pnpm|yarn)\s+(?:install|add|remove|update|upgrade|uninstall)\b/i.test(command)
    || /\b(?:pip|pip3|python\s+-m\s+pip|uv\s+pip|poetry)\s+(?:install|add|remove|update|uninstall)\b/i.test(command)
    || /\b(?:apt|apt-get|yum|dnf|brew|winget|choco)\b/i.test(command)) {
    reasons.push('命令会安装、升级或卸载依赖，可能修改当前工作区或系统环境');
  }

  if (/\b(?:reg|sc|netsh|bcdedit|Set-ExecutionPolicy|Set-ItemProperty|New-ItemProperty|Set-Service)\b/i.test(command)) {
    reasons.push('命令可能修改系统配置、注册表或服务状态');
  }

  if (/\bgit\s+(?:commit|push|rebase|merge|cherry-pick|stash(?:\s+pop)?|tag)\b/i.test(command)) {
    reasons.push('命令会修改 Git 历史或向远端推送变更');
  }

  if (ABSOLUTE_PATH_REFERENCE_REGEX.test(command)) {
    reasons.push('命令引用了绝对路径或用户目录路径，可能访问工作区之外的文件');
  }

  return Array.from(new Set(reasons));
};

export const assessCommandSecurity = (
  command: string,
  options?: AgentWorkspaceToolOptionInput,
): AgentCommandSecurityAssessment => {
  const resolvedOptions = resolveAgentWorkspaceToolOptions(options);
  const normalizedCommand = command.trim();

  if (!normalizedCommand) {
    return {
      level: 'blocked',
      reasons: ['command is required'],
    };
  }

  for (const pattern of resolvedOptions.blockedDirectoryChangeCommandPatterns) {
    if (pattern.test(normalizedCommand)) {
      return {
        level: 'blocked',
        reasons: ['命令试图切换工作目录。Agent 只允许在选定工作区根目录内执行命令'],
      };
    }
  }

  for (const pattern of resolvedOptions.forbiddenCommandPatterns) {
    if (pattern.test(normalizedCommand)) {
      return {
        level: 'blocked',
        reasons: ['命令命中黑名单安全规则，已被拒绝执行'],
      };
    }
  }

  const reasons = buildHighRiskReasons(normalizedCommand);
  const matchedHighRiskRule = resolvedOptions.highRiskCommandPatterns.some(pattern => pattern.test(normalizedCommand));
  if (matchedHighRiskRule && reasons.length === 0) {
    reasons.push('命令命中了高风险规则，执行前需要用户确认');
  }

  return {
    level: matchedHighRiskRule || reasons.length > 0 ? 'high' : 'safe',
    reasons,
  };
};

export const isPathInsideWorkspace = (targetPath: string, workspacePath: string): boolean => {
  const normalizedWorkspacePath = path.resolve(workspacePath);
  const normalizedTargetPath = path.resolve(targetPath);
  const relativePath = path.relative(normalizedWorkspacePath, normalizedTargetPath);
  return relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
};

export const containsForbiddenPath = (
  targetPath: string,
  options?: AgentWorkspaceToolOptionInput,
): boolean => {
  const resolvedOptions = resolveAgentWorkspaceToolOptions(options);
  return resolvedOptions.forbiddenPathPatterns.some(pattern => pattern.test(targetPath));
};

export const resolveWorkspacePath = (
  workspacePath: string,
  rawPath: string,
  options?: AgentWorkspaceToolOptionInput,
): string => {
  const normalizedWorkspacePath = workspacePath.trim();
  const normalizedRawPath = rawPath.trim();
  const resolvedWorkspacePath = path.resolve(normalizedWorkspacePath);

  if (!normalizedWorkspacePath) {
    throw new Error('workspacePath is required');
  }

  if (!normalizedRawPath) {
    throw new Error('path is required');
  }

  const candidatePath = path.isAbsolute(normalizedRawPath)
    ? path.normalize(normalizedRawPath)
    : path.resolve(resolvedWorkspacePath, normalizedRawPath);

  if (!isPathInsideWorkspace(candidatePath, resolvedWorkspacePath)) {
    throw new Error('path escapes workspace');
  }

  if (containsForbiddenPath(candidatePath, options)) {
    throw new Error('path is blocked by security policy');
  }

  return candidatePath;
};

export const resolveDisplayPath = (workspacePath: string, filePath: string): string => {
  const relativePath = path.relative(workspacePath, filePath);
  return relativePath && !relativePath.startsWith('..')
    ? relativePath.replace(/\\/g, '/')
    : filePath;
};

export const ensureWritablePath = (
  filePath: string,
  options?: AgentWorkspaceToolOptionInput,
): void => {
  const resolvedOptions = resolveAgentWorkspaceToolOptions(options);
  const extension = path.extname(filePath).toLowerCase();
  if (!resolvedOptions.allowedWriteExtensions.has(extension)) {
    throw new Error(`writing ${extension || 'unknown'} files is not allowed`);
  }
};

export const isBinaryBuffer = (buffer: Buffer): boolean => {
  if (buffer.length === 0) {
    return false;
  }

  const sampleSize = Math.min(buffer.length, 1024);
  let zeroByteCount = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      zeroByteCount += 1;
    }
  }

  return (zeroByteCount / sampleSize) > 0.02;
};
