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

/**
 * 安全地解析路径，确保在工作区范围内
 * @returns 完整路径，如果路径不安全则返回 null
 */
export function resolveSecurePath(workspacePath: string, relativePath: string): string | null {
  const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
  const normalizedRelative = relativePath.replace(/\\/g, '/');
  const cleanRelative = normalizedRelative.replace(/^\.?\//, '');

  if (cleanRelative.includes('..')) {
    const parts = cleanRelative.split('/');
    let depth = 0;
    for (const part of parts) {
      if (part === '..') {
        depth--;
        if (depth < 0) {
          return null;
        }
      } else if (part !== '.' && part !== '') {
        depth++;
      }
    }
  }

  const fullPath = `${normalizedWorkspace}/${cleanRelative}`;

  if (!fullPath.startsWith(normalizedWorkspace)) {
    return null;
  }

  return fullPath;
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
