/**
 * 文件内容搜索工具
 * 功能：在工作区文件中搜索匹配指定模式的内容
 * 描述：支持正则表达式搜索，可限制文件类型和最大结果数
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath } from './FileSecurityUtils';

/** 搜索结果项 */
interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export class SearchFilesTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'search_files';

  readonly description = '在工作区文件中搜索匹配指定模式的内容。支持正则表达式，可限制搜索的文件类型。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索模式（支持正则表达式）',
      },
      path: {
        type: 'string',
        description: '搜索起始目录（相对于工作区），默认为根目录',
        default: '.',
      },
      fileExtensions: {
        type: 'array',
        description: '限制搜索的文件扩展名列表，如 [".ts", ".js"]',
        items: { type: 'string' },
      },
      maxResults: {
        type: 'number',
        description: '最大返回结果数，默认 50',
        default: 50,
      },
    },
    required: ['pattern'],
  };

  readonly metadata: ToolMetadata = {
    category: 'search',
    requiresConfirmation: false,
    readOnly: true,
    priority: 85,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const {
      pattern,
      path = '.',
      fileExtensions,
      maxResults = 50,
    } = params as {
      pattern: string;
      path?: string;
      fileExtensions?: string[];
      maxResults?: number;
    };

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const result = await this.invokeIPC<SearchMatch[]>(
      'agent:fs:searchFiles',
      fullPath,
      pattern,
      this.config.workspacePath,
      fileExtensions,
      maxResults
    );

    if (!result.success) {
      return this.failure(result.error ?? '搜索文件失败');
    }

    return this.success({
      matches: result.data ?? [],
      pattern,
      totalMatches: (result.data ?? []).length,
    });
  }
}
