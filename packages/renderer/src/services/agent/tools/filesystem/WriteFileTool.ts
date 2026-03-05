/**
 * 文件写入工具
 * 功能：将内容写入指定文件
 * 描述：文件不存在则创建，存在则覆盖。写入操作需要用户确认。
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema, FileChange } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath, getFileExtension, isExtensionAllowed, getMaxFileSize } from './FileSecurityUtils';

export class WriteFileTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'write_file';

  readonly description = '将内容写入指定文件。如果文件不存在则创建，如果存在则覆盖。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要写入的文件路径（相对于工作区根目录）',
      },
      content: {
        type: 'string',
        description: '要写入的内容',
      },
    },
    required: ['path', 'content'],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: true,
    readOnly: false,
    priority: 90,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { path } = params as { path: string; content: string };
    const content = typeof (params as { content?: unknown }).content === 'string'
      ? ((params as { content: string }).content)
      : '';

    if (this.config.allowWrite === false) {
      return this.failure('当前配置不允许写入文件');
    }

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const ext = getFileExtension(path);
    if (!isExtensionAllowed(ext, this.config)) {
      return this.failure(`不允许写入 ${ext} 类型的文件`);
    }

    if (content.length === 0) {
      return this.failure('写入内容为空，已阻止覆盖文件');
    }

    const maxSize = getMaxFileSize(this.config);
    if (content.length > maxSize) {
      return this.failure(`内容大小超过限制 (${maxSize} 字节)`);
    }

    const result = await this.invokeIPC<{ path: string; bytesWritten: number }>(
      'agent:fs:writeFile',
      fullPath,
      content,
      this.config.workspacePath
    );

    if (!result.success) {
      return this.failure(result.error ?? '写入文件失败');
    }

    const changes: FileChange[] = [{
      type: 'create',
      filePath: fullPath,
      newContent: content,
      timestamp: Date.now(),
    }];

    return this.success({
      path: fullPath,
      bytesWritten: result.data?.bytesWritten ?? new TextEncoder().encode(content).length,
    }, changes);
  }
}
