/**
 * 文件系统工具
 * 功能：提供文件读取、写入、列表等操作
 * 描述：Agent 可用的文件系统操作工具，包含安全边界控制
 */

import {
  AgentTool,
  ToolResult,
  ToolParameterSchema,
  FileChange
} from '../types';

/**
 * 文件系统工具配置
 */
export interface FileSystemToolConfig {
  /** 工作区根路径 */
  workspacePath: string;
  /** 允许的文件扩展名（空数组表示允许所有） */
  allowedExtensions?: string[];
  /** 禁止的文件扩展名 */
  disallowedExtensions?: string[];
  /** 最大文件大小（字节） */
  maxFileSize?: number;
  /** 是否允许写入 */
  allowWrite?: boolean;
  /** 是否允许删除 */
  allowDelete?: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<FileSystemToolConfig> = {
  allowedExtensions: [],
  disallowedExtensions: ['.exe', '.dll', '.so', '.dylib', '.bin'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowWrite: true,
  allowDelete: false
};

/**
 * 创建读取文件工具
 */
export function createReadFileTool(config: FileSystemToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'read_file',
    description: '读取指定文件的内容。可以读取文本文件、代码文件、配置文件等。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要读取的文件路径（相对于工作区根目录）'
        },
        encoding: {
          type: 'string',
          description: '文件编码，默认为 utf-8',
          enum: ['utf-8', 'utf-16', 'ascii', 'binary'],
          default: 'utf-8'
        }
      },
      required: ['path']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const { path } = params as { path: string };

      try {
        // 安全检查：确保路径在工作区内
        const fullPath = resolveSecurePath(mergedConfig.workspacePath, path);
        if (!fullPath) {
          return {
            success: false,
            error: '路径不在工作区范围内'
          };
        }

        // 检查文件扩展名
        const ext = getFileExtension(path);
        if (!isExtensionAllowed(ext, mergedConfig)) {
          return {
            success: false,
            error: `不允许读取 ${ext} 类型的文件`
          };
        }

        // 通过 IPC 读取文件（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke(
          'agent:fs:readFile',
          fullPath,
          mergedConfig.workspacePath
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || '读取文件失败'
          };
        }

        const content = result.data as string;

        // 检查文件大小
        if (content && content.length > (mergedConfig.maxFileSize || 10 * 1024 * 1024)) {
          return {
            success: false,
            error: `文件大小超过限制 (${mergedConfig.maxFileSize} 字节)`
          };
        }

        return {
          success: true,
          data: {
            content,
            path: fullPath,
            size: content?.length || 0
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建写入文件工具
 */
export function createWriteFileTool(config: FileSystemToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'write_file',
    description: '将内容写入指定文件。如果文件不存在则创建，如果存在则覆盖。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要写入的文件路径（相对于工作区根目录）'
        },
        content: {
          type: 'string',
          description: '要写入的内容'
        }
      },
      required: ['path', 'content']
    },
    requiresConfirmation: true, // 写入操作需要用户确认

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const { path } = params as { path: string; content: string };
      const content = typeof (params as { content?: unknown }).content === 'string'
        ? ((params as { content: string }).content)
        : '';

      // 检查是否允许写入
      if (!mergedConfig.allowWrite) {
        return {
          success: false,
          error: '当前配置不允许写入文件'
        };
      }

      try {
        // 安全检查：确保路径在工作区内
        const fullPath = resolveSecurePath(mergedConfig.workspacePath, path);
        if (!fullPath) {
          return {
            success: false,
            error: '路径不在工作区范围内'
          };
        }

        // 检查文件扩展名
        const ext = getFileExtension(path);
        if (!isExtensionAllowed(ext, mergedConfig)) {
          return {
            success: false,
            error: `不允许写入 ${ext} 类型的文件`
          };
        }

        // 检查内容大小
        if (content.length > (mergedConfig.maxFileSize || 10 * 1024 * 1024)) {
          return {
            success: false,
            error: `内容大小超过限制 (${mergedConfig.maxFileSize} 字节)`
          };
        }
        if (content.length === 0) {
          return {
            success: false,
            error: '写入内容为空，已阻止覆盖文件'
          };
        }

        // 读取原始内容（用于记录变更）
        let originalContent: string | undefined;
        try {
          const readResult = await window.electron?.ipcRenderer.invoke(
            'agent:fs:readFile',
            fullPath,
            mergedConfig.workspacePath
          );
          if (readResult.success) {
            originalContent = readResult.data as string;
          }
        } catch {
          // 文件可能不存在，忽略错误
        }

        // 通过 IPC 写入文件（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke(
          'agent:fs:writeFile',
          fullPath,
          content,
          mergedConfig.workspacePath
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || '写入文件失败'
          };
        }

        // 记录文件变更
        const fileChange: FileChange = {
          filePath: fullPath,
          type: originalContent === undefined ? 'create' : 'modify',
          originalContent,
          newContent: content,
          timestamp: Date.now()
        };

        return {
          success: true,
          data: {
            path: fullPath,
            bytesWritten: content.length
          },
          changes: [fileChange]
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建列出文件工具
 */
export function createListFilesTool(config: FileSystemToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'list_files',
    description: '列出指定目录下的文件和子目录。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要列出的目录路径（相对于工作区根目录），默认为根目录',
          default: '.'
        },
        recursive: {
          type: 'boolean',
          description: '是否递归列出子目录',
          default: false
        },
        pattern: {
          type: 'string',
          description: '文件名匹配模式（glob 格式），如 "*.ts"'
        },
        maxDepth: {
          type: 'number',
          description: '递归的最大深度',
          default: 3
        }
      },
      required: []
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        path = '.',
        recursive = false,
        maxDepth = 3
      } = params as {
        path?: string;
        recursive?: boolean;
        pattern?: string;
        maxDepth?: number;
      };

      try {
        // 安全检查：确保路径在工作区内
        const fullPath = resolveSecurePath(mergedConfig.workspacePath, path);
        if (!fullPath) {
          return {
            success: false,
            error: '路径不在工作区范围内'
          };
        }

        // 通过 IPC 列出文件（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke(
          'agent:fs:listFiles',
          fullPath,
          mergedConfig.workspacePath,
          recursive,
          maxDepth
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || '列出文件失败'
          };
        }

        const files = result.data as Array<{
          name: string;
          path: string;
          isDirectory: boolean;
          size: number;
          modifiedTime: number;
          extension: string;
        }>;

        // 分离文件和目录
        const fileList = files.filter(f => !f.isDirectory).map(f => f.path);
        const dirList = files.filter(f => f.isDirectory).map(f => f.path);

        return {
          success: true,
          data: {
            path: fullPath,
            files: fileList,
            directories: dirList,
            totalCount: files.length
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 创建搜索文件工具
 */
export function createSearchFilesTool(config: FileSystemToolConfig): AgentTool {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    name: 'search_files',
    description: '在工作区中搜索包含指定内容的文件。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的文本内容'
        },
        path: {
          type: 'string',
          description: '搜索的起始目录（相对于工作区根目录），默认为根目录',
          default: '.'
        },
        pattern: {
          type: 'string',
          description: '文件名匹配模式（glob 格式），如 "*.ts"'
        },
        caseSensitive: {
          type: 'boolean',
          description: '是否区分大小写',
          default: false
        },
        maxResults: {
          type: 'number',
          description: '最大结果数量',
          default: 50
        }
      },
      required: ['query']
    },
    requiresConfirmation: false,

    async execute(params: Record<string, unknown>): Promise<ToolResult> {
      const {
        query,
        path = '.',
        pattern,
        maxResults = 50
      } = params as {
        query: string;
        path?: string;
        pattern?: string;
        caseSensitive?: boolean;
        maxResults?: number;
      };

      try {
        // 安全检查：确保路径在工作区内
        const fullPath = resolveSecurePath(mergedConfig.workspacePath, path);
        if (!fullPath) {
          return {
            success: false,
            error: '路径不在工作区范围内'
          };
        }

        // 将 pattern 转换为文件扩展名数组
        let fileExtensions: string[] | undefined;
        if (pattern) {
          // 简单解析 glob 模式，如 "*.ts" -> [".ts"]
          const match = pattern.match(/\*\.(\w+)/);
          if (match) {
            fileExtensions = [`.${match[1]}`];
          }
        }

        // 通过 IPC 搜索文件（使用 Agent 专用通道）
        const result = await window.electron?.ipcRenderer.invoke(
          'agent:fs:searchFiles',
          fullPath,
          query,
          mergedConfig.workspacePath,
          fileExtensions,
          maxResults
        );

        if (!result.success) {
          return {
            success: false,
            error: result.error || '搜索文件失败'
          };
        }

        const searchResults = result.data as Array<{
          filePath: string;
          lineNumber: number;
          lineContent: string;
          matchStart: number;
          matchEnd: number;
        }>;

        return {
          success: true,
          data: {
            query,
            matches: searchResults.map(r => ({
              file: r.filePath,
              line: r.lineNumber,
              content: r.lineContent,
              matchRange: [r.matchStart, r.matchEnd]
            })),
            totalMatches: searchResults.length,
            truncated: searchResults.length >= maxResults
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

/**
 * 安全地解析路径，确保在工作区范围内
 */
function resolveSecurePath(workspacePath: string, relativePath: string): string | null {
  const normalizedWorkspace = canonicalizeSecurePath(workspacePath);
  if (!normalizedWorkspace) {
    return null;
  }

  const normalizedInput = (relativePath ?? '').replace(/\\/g, '/').trim();
  if (!normalizedInput) {
    return normalizedWorkspace;
  }

  const cleanRelative = normalizedInput.replace(/^\.?[\\/]/, '');
  const candidatePath = isAbsoluteSecurePath(normalizedInput)
    ? normalizedInput
    : `${normalizedWorkspace}/${cleanRelative}`;
  const normalizedCandidate = canonicalizeSecurePath(candidatePath);

  if (!normalizedCandidate) {
    return null;
  }

  if (!isPathInsideWorkspaceSecure(normalizedWorkspace, normalizedCandidate)) {
    return null;
  }

  return normalizedCandidate;
}

const WINDOWS_ABSOLUTE_SECURE_PATH_REGEX = /^[a-zA-Z]:[\\/]/;
const WINDOWS_DRIVE_ROOT_SECURE_PATH_REGEX = /^[a-zA-Z]:\/$/;

function isAbsoluteSecurePath(pathValue: string): boolean {
  return WINDOWS_ABSOLUTE_SECURE_PATH_REGEX.test(pathValue) || pathValue.startsWith('/');
}

function trimSecurePathTrailingSeparators(pathValue: string): string {
  if (pathValue === '/' || WINDOWS_DRIVE_ROOT_SECURE_PATH_REGEX.test(pathValue)) {
    return pathValue;
  }
  return pathValue.replace(/\/+$/, '');
}

function canonicalizeSecurePath(pathValue: string): string | null {
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

function isPathInsideWorkspaceSecure(workspacePath: string, targetPath: string): boolean {
  const normalizedWorkspace = trimSecurePathTrailingSeparators(workspacePath);
  const normalizedTarget = trimSecurePathTrailingSeparators(targetPath);
  const caseInsensitive = WINDOWS_ABSOLUTE_SECURE_PATH_REGEX.test(normalizedWorkspace);
  const workspaceComparable = caseInsensitive ? normalizedWorkspace.toLowerCase() : normalizedWorkspace;
  const targetComparable = caseInsensitive ? normalizedTarget.toLowerCase() : normalizedTarget;

  if (targetComparable === workspaceComparable) {
    return true;
  }

  const workspacePrefix = workspaceComparable.endsWith('/')
    ? workspaceComparable
    : `${workspaceComparable}/`;
  return targetComparable.startsWith(workspacePrefix);
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return '';
  }
  return filePath.substring(lastDot).toLowerCase();
}

/**
 * 检查扩展名是否允许
 */
function isExtensionAllowed(ext: string, config: Partial<FileSystemToolConfig>): boolean {
  // 如果在禁止列表中，不允许
  if (config.disallowedExtensions && config.disallowedExtensions.includes(ext)) {
    return false;
  }

  // 如果允许列表为空，允许所有（除了禁止的）
  if (!config.allowedExtensions || config.allowedExtensions.length === 0) {
    return true;
  }

  // 检查是否在允许列表中
  return config.allowedExtensions.includes(ext);
}

/**
 * 创建所有文件系统工具
 */
export function createFileSystemTools(config: FileSystemToolConfig): AgentTool[] {
  return [
    createReadFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createSearchFilesTool(config)
  ];
}
