/**
 * 文件安全工具函数
 * 功能：路径验证、扩展名检查等安全机制
 * 描述：所有文件系统工具共享的安全检查逻辑
 */

import type { FileSystemToolConfig } from '../base/types';

/** 默认禁止的文件扩展名 */
const DEFAULT_DISALLOWED_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.bin'];

/** 默认最大文件大小（10MB） */
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

const WINDOWS_ABSOLUTE_PATH_REGEX = /^[a-zA-Z]:[\\/]/;
const WINDOWS_DRIVE_ROOT_REGEX = /^[a-zA-Z]:\/$/;

function isAbsolutePath(pathValue: string): boolean {
  return WINDOWS_ABSOLUTE_PATH_REGEX.test(pathValue) || pathValue.startsWith('/');
}

function trimTrailingSeparators(pathValue: string): string {
  if (pathValue === '/' || WINDOWS_DRIVE_ROOT_REGEX.test(pathValue)) {
    return pathValue;
  }
  return pathValue.replace(/\/+$/, '');
}

function canonicalizePath(pathValue: string): string | null {
  const normalized = pathValue.replace(/\\/g, '/').trim();
  if (!normalized) {
    return null;
  }

  const driveMatch = normalized.match(/^([a-zA-Z]):/);
  const hasDrive = !!driveMatch;
  const drivePrefix = hasDrive ? `${driveMatch![1].toUpperCase()}:` : '';

  let rest = hasDrive ? normalized.slice(2) : normalized;
  const absolute = hasDrive || rest.startsWith('/');
  if (rest.startsWith('/')) {
    rest = rest.slice(1);
  }

  const parts = rest.split('/').filter(Boolean);
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) {
        return null;
      }
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  if (hasDrive) {
    const joined = stack.join('/');
    return joined ? `${drivePrefix}/${joined}` : `${drivePrefix}/`;
  }

  if (absolute) {
    return stack.length > 0 ? `/${stack.join('/')}` : '/';
  }

  return stack.join('/');
}

function isPathInsideWorkspace(workspacePath: string, targetPath: string): boolean {
  const normalizedWorkspace = trimTrailingSeparators(workspacePath);
  const normalizedTarget = trimTrailingSeparators(targetPath);
  const useCaseInsensitive = WINDOWS_ABSOLUTE_PATH_REGEX.test(normalizedWorkspace);
  const workspaceComparable = useCaseInsensitive ? normalizedWorkspace.toLowerCase() : normalizedWorkspace;
  const targetComparable = useCaseInsensitive ? normalizedTarget.toLowerCase() : normalizedTarget;

  if (targetComparable === workspaceComparable) {
    return true;
  }

  const workspacePrefix = workspaceComparable.endsWith('/')
    ? workspaceComparable
    : `${workspaceComparable}/`;
  return targetComparable.startsWith(workspacePrefix);
}

/**
 * 安全地解析路径，确保在工作区范围内
 * @returns 完整路径，如果路径不安全则返回 null
 */
export function resolveSecurePath(workspacePath: string, relativePath: string): string | null {
  const normalizedWorkspace = canonicalizePath(workspacePath);
  if (!normalizedWorkspace) {
    return null;
  }

  const normalizedInput = (relativePath ?? '').replace(/\\/g, '/').trim();
  if (!normalizedInput) {
    return normalizedWorkspace;
  }

  const cleanRelative = normalizedInput.replace(/^\.?[\\/]/, '');
  const candidatePath = isAbsolutePath(normalizedInput)
    ? normalizedInput
    : `${normalizedWorkspace}/${cleanRelative}`;
  const normalizedCandidate = canonicalizePath(candidatePath);

  if (!normalizedCandidate) {
    return null;
  }

  if (!isPathInsideWorkspace(normalizedWorkspace, normalizedCandidate)) {
    return null;
  }

  return normalizedCandidate;
}

/** 获取文件扩展名 */
export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return '';
  }
  return filePath.substring(lastDot).toLowerCase();
}

/** 检查扩展名是否允许 */
export function isExtensionAllowed(ext: string, config: Partial<FileSystemToolConfig>): boolean {
  const disallowed = config.disallowedExtensions ?? DEFAULT_DISALLOWED_EXTENSIONS;
  if (disallowed.includes(ext)) {
    return false;
  }

  if (!config.allowedExtensions || config.allowedExtensions.length === 0) {
    return true;
  }

  return config.allowedExtensions.includes(ext);
}

/** 获取默认最大文件大小 */
export function getMaxFileSize(config: Partial<FileSystemToolConfig>): number {
  return config.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
}
