/**
 * 目录列表工具
 * 功能：列出指定目录下的文件和子目录
 * 描述：支持递归列出和深度限制，返回文件名、类型、大小等信息
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath } from './FileSecurityUtils';

/** 目录项信息 */
interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  path: string;
}

export class ListFilesTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'list_files';

  readonly description = '列出指定目录下的文件和子目录。可选择是否递归列出。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要列出的目录路径（相对于工作区根目录），默认为根目录',
        default: '.',
      },
      recursive: {
        type: 'boolean',
        description: '是否递归列出子目录内容，默认 false',
        default: false,
      },
      maxDepth: {
        type: 'number',
        description: '递归最大深度，默认 3',
        default: 3,
      },
    },
    required: [],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: false,
    readOnly: true,
    priority: 75,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const path = (params.path as string) || '.';
    const recursive = (params.recursive as boolean) || false;
    const maxDepth = (params.maxDepth as number) || 3;

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const result = await this.invokeIPC<DirectoryEntry[]>(
      'agent:fs:listFiles',
      fullPath,
      this.config.workspacePath,
      recursive,
      maxDepth
    );

    if (!result.success) {
      return this.failure(result.error ?? '列出目录失败');
    }

    return this.success({
      entries: result.data ?? [],
      path: fullPath,
      count: (result.data ?? []).length,
    });
  }
}
