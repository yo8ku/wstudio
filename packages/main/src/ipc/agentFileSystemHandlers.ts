/**
 * Agent 文件系统 IPC 处理器
 * 功能：为 Agent 提供安全的文件系统操作接口
 * 描述：包含路径验证、安全边界检查等安全机制
 */

import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Agent 文件操作结果 */
interface AgentFileResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/** 文件信息 */
interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedTime: number;
  extension: string;
}

/** 搜索结果 */
interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

/** 允许的文件扩展名（用于写入操作） */
const ALLOWED_EXTENSIONS = [
  '.md', '.markdown', '.txt', '.json', '.yaml', '.yml',
  '.js', '.ts', '.jsx', '.tsx', '.css', '.scss', '.less',
  '.html', '.xml', '.svg', '.vue', '.py', '.rb', '.go',
  '.java', '.c', '.cpp', '.h', '.hpp', '.rs', '.sh', '.bat'
];

/** 禁止访问的目录模式 */
const FORBIDDEN_PATTERNS = [
  /node_modules/i,
  /\.git/i,
  /\.env/i,
  /\.ssh/i,
  /\.aws/i,
  /\.credentials/i,
  /password/i,
  /secret/i
];

/**
 * 验证路径是否在工作区内
 */
function isPathInWorkspace(targetPath: string, workspacePath: string): boolean {
  const normalizedTarget = path.normalize(targetPath).toLowerCase();
  const normalizedWorkspace = path.normalize(workspacePath).toLowerCase();
  return normalizedTarget.startsWith(normalizedWorkspace);
}

/**
 * 检查路径是否包含禁止的模式
 */
function containsForbiddenPattern(targetPath: string): boolean {
  return FORBIDDEN_PATTERNS.some(pattern => pattern.test(targetPath));
}

/**
 * 验证文件扩展名是否允许写入
 */
function isExtensionAllowed(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * 注册 Agent 文件系统 IPC 处理器
 */
export function registerAgentFileSystemHandlers(): void {
  // 移除可能存在的旧处理器
  const handlersToRemove = [
    'agent:fs:readFile',
    'agent:fs:writeFile',
    'agent:fs:listFiles',
    'agent:fs:searchFiles',
    'agent:fs:fileExists',
    'agent:fs:createDirectory',
    'agent:fs:deleteFile'
  ];

  for (const handler of handlersToRemove) {
    try {
      ipcMain.removeHandler(handler);
    } catch (e) {
      // 忽略未注册的处理器
    }
  }

  /**
   * 读取文件内容
   * @param filePath - 文件路径
   * @param workspacePath - 工作区路径（用于安全验证）
   */
  ipcMain.handle(
    'agent:fs:readFile',
    async (event, filePath: string, workspacePath: string): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(filePath, workspacePath)) {
          return {
            success: false,
            error: '文件路径超出工作区范围'
          };
        }

        if (containsForbiddenPattern(filePath)) {
          return {
            success: false,
            error: '禁止访问该路径'
          };
        }

        // 检查文件是否存在
        try {
          await fs.access(filePath);
        } catch {
          return {
            success: false,
            error: `文件不存在: ${filePath}`
          };
        }

        // 读取文件内容
        const content = await fs.readFile(filePath, 'utf-8');

        return {
          success: true,
          data: content
        };
      } catch (error) {
        console.error('[AgentFS] 读取文件失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 写入文件内容
   * @param filePath - 文件路径
   * @param content - 文件内容
   * @param workspacePath - 工作区路径（用于安全验证）
   */
  ipcMain.handle(
    'agent:fs:writeFile',
    async (
      event,
      filePath: string,
      content: string,
      workspacePath: string
    ): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(filePath, workspacePath)) {
          return {
            success: false,
            error: '文件路径超出工作区范围'
          };
        }

        if (containsForbiddenPattern(filePath)) {
          return {
            success: false,
            error: '禁止写入该路径'
          };
        }

        if (!isExtensionAllowed(filePath)) {
          return {
            success: false,
            error: `不允许写入该类型的文件: ${path.extname(filePath)}`
          };
        }

        // 确保目录存在
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // 写入文件
        await fs.writeFile(filePath, content, 'utf-8');

        console.log('[AgentFS] 文件写入成功:', filePath);

        return {
          success: true,
          data: { path: filePath }
        };
      } catch (error) {
        console.error('[AgentFS] 写入文件失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 列出目录内容
   * @param dirPath - 目录路径
   * @param workspacePath - 工作区路径（用于安全验证）
   * @param recursive - 是否递归列出
   * @param maxDepth - 最大递归深度
   */
  ipcMain.handle(
    'agent:fs:listFiles',
    async (
      event,
      dirPath: string,
      workspacePath: string,
      recursive: boolean = false,
      maxDepth: number = 3
    ): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(dirPath, workspacePath)) {
          return {
            success: false,
            error: '目录路径超出工作区范围'
          };
        }

        if (containsForbiddenPattern(dirPath)) {
          return {
            success: false,
            error: '禁止访问该目录'
          };
        }

        const files: FileInfo[] = [];

        async function listDir(currentPath: string, depth: number): Promise<void> {
          if (depth > maxDepth) return;

          try {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
              const fullPath = path.join(currentPath, entry.name);

              // 跳过禁止的路径
              if (containsForbiddenPattern(fullPath)) {
                continue;
              }

              try {
                const stats = await fs.stat(fullPath);

                files.push({
                  name: entry.name,
                  path: fullPath,
                  isDirectory: entry.isDirectory(),
                  size: stats.size,
                  modifiedTime: stats.mtime.getTime(),
                  extension: entry.isDirectory() ? '' : path.extname(entry.name)
                });

                // 递归处理子目录
                if (recursive && entry.isDirectory()) {
                  await listDir(fullPath, depth + 1);
                }
              } catch {
                // 跳过无法访问的文件
              }
            }
          } catch {
            // 跳过无法访问的目录
          }
        }

        await listDir(dirPath, 0);

        return {
          success: true,
          data: files
        };
      } catch (error) {
        console.error('[AgentFS] 列出目录失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 搜索文件内容
   * @param dirPath - 搜索目录
   * @param pattern - 搜索模式（正则表达式字符串）
   * @param workspacePath - 工作区路径（用于安全验证）
   * @param fileExtensions - 限制搜索的文件扩展名
   * @param maxResults - 最大结果数
   */
  ipcMain.handle(
    'agent:fs:searchFiles',
    async (
      event,
      dirPath: string,
      pattern: string,
      workspacePath: string,
      fileExtensions?: string[],
      maxResults: number = 100
    ): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(dirPath, workspacePath)) {
          return {
            success: false,
            error: '搜索路径超出工作区范围'
          };
        }

        const regex = new RegExp(pattern, 'gi');
        const results: SearchResult[] = [];

        async function searchDir(currentPath: string): Promise<void> {
          if (results.length >= maxResults) return;

          try {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
              if (results.length >= maxResults) break;

              const fullPath = path.join(currentPath, entry.name);

              // 跳过禁止的路径
              if (containsForbiddenPattern(fullPath)) {
                continue;
              }

              if (entry.isDirectory()) {
                await searchDir(fullPath);
              } else {
                // 检查文件扩展名
                const ext = path.extname(entry.name).toLowerCase();
                if (fileExtensions && fileExtensions.length > 0) {
                  if (!fileExtensions.includes(ext)) {
                    continue;
                  }
                }

                // 只搜索文本文件
                if (!ALLOWED_EXTENSIONS.includes(ext)) {
                  continue;
                }

                try {
                  const content = await fs.readFile(fullPath, 'utf-8');
                  const lines = content.split('\n');

                  for (let i = 0; i < lines.length; i++) {
                    if (results.length >= maxResults) break;

                    const line = lines[i];
                    let match;

                    while ((match = regex.exec(line)) !== null) {
                      if (results.length >= maxResults) break;

                      results.push({
                        filePath: fullPath,
                        lineNumber: i + 1,
                        lineContent: line.trim(),
                        matchStart: match.index,
                        matchEnd: match.index + match[0].length
                      });
                    }

                    // 重置正则表达式
                    regex.lastIndex = 0;
                  }
                } catch {
                  // 跳过无法读取的文件
                }
              }
            }
          } catch {
            // 跳过无法访问的目录
          }
        }

        await searchDir(dirPath);

        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error('[AgentFS] 搜索文件失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 检查文件是否存在
   * @param filePath - 文件路径
   * @param workspacePath - 工作区路径（用于安全验证）
   */
  ipcMain.handle(
    'agent:fs:fileExists',
    async (event, filePath: string, workspacePath: string): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(filePath, workspacePath)) {
          return {
            success: false,
            error: '文件路径超出工作区范围'
          };
        }

        try {
          await fs.access(filePath);
          const stats = await fs.stat(filePath);

          return {
            success: true,
            data: {
              exists: true,
              isDirectory: stats.isDirectory(),
              isFile: stats.isFile(),
              size: stats.size
            }
          };
        } catch {
          return {
            success: true,
            data: {
              exists: false
            }
          };
        }
      } catch (error) {
        console.error('[AgentFS] 检查文件存在失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 创建目录
   * @param dirPath - 目录路径
   * @param workspacePath - 工作区路径（用于安全验证）
   */
  ipcMain.handle(
    'agent:fs:createDirectory',
    async (event, dirPath: string, workspacePath: string): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(dirPath, workspacePath)) {
          return {
            success: false,
            error: '目录路径超出工作区范围'
          };
        }

        if (containsForbiddenPattern(dirPath)) {
          return {
            success: false,
            error: '禁止创建该目录'
          };
        }

        await fs.mkdir(dirPath, { recursive: true });

        console.log('[AgentFS] 目录创建成功:', dirPath);

        return {
          success: true,
          data: { path: dirPath }
        };
      } catch (error) {
        console.error('[AgentFS] 创建目录失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  /**
   * 删除文件（需要确认）
   * @param filePath - 文件路径
   * @param workspacePath - 工作区路径（用于安全验证）
   */
  ipcMain.handle(
    'agent:fs:deleteFile',
    async (event, filePath: string, workspacePath: string): Promise<AgentFileResult> => {
      try {
        // 安全验证
        if (!isPathInWorkspace(filePath, workspacePath)) {
          return {
            success: false,
            error: '文件路径超出工作区范围'
          };
        }

        if (containsForbiddenPattern(filePath)) {
          return {
            success: false,
            error: '禁止删除该文件'
          };
        }

        // 检查文件是否存在
        try {
          await fs.access(filePath);
        } catch {
          return {
            success: false,
            error: `文件不存在: ${filePath}`
          };
        }

        // 删除文件
        await fs.unlink(filePath);

        console.log('[AgentFS] 文件删除成功:', filePath);

        return {
          success: true,
          data: { path: filePath }
        };
      } catch (error) {
        console.error('[AgentFS] 删除文件失败:', error);
        return {
          success: false,
          error: String(error)
        };
      }
    }
  );

  console.log('[AgentFS] Agent 文件系统 IPC 处理器已注册');
}
