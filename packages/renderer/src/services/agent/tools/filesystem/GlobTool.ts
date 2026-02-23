/**
 * Glob 模式匹配工具
 * 功能：使用 glob 模式快速查找匹配的文件
 * 描述：支持 **\/*.ts、src/**\/*.scss 等标准 glob 模式
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath } from './FileSecurityUtils';

export class GlobTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'glob';

  readonly description = '使用 glob 模式匹配查找文件。支持 **/*.ts、src/**/*.scss 等模式。返回匹配的文件路径列表。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob 模式，如 "**/*.ts"、"src/**/*.scss"、"*.json"',
      },
      path: {
        type: 'string',
        description: '搜索起始目录（相对于工作区），默认为根目录',
        default: '.',
      },
    },
    required: ['pattern'],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: false,
    readOnly: true,
    priority: 80,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { pattern, path = '.' } = params as {
      pattern: string;
      path?: string;
    };

    const basePath = resolveSecurePath(this.config.workspacePath, path);
    if (!basePath) {
      return this.failure('路径不在工作区范围内');
    }

    const result = await this.invokeIPC<string[]>(
      'agent:fs:glob',
      pattern,
      basePath,
      this.config.workspacePath
    );

    if (!result.success) {
      return this.failure(result.error ?? 'Glob 匹配失败');
    }

    const files = result.data ?? [];

    return this.success({
      pattern,
      files,
      totalMatches: files.length,
    });
  }
}
