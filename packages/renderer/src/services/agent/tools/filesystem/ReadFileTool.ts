/**
 * 文件读取工具
 * 功能：读取指定文件的内容
 * 描述：支持文本文件、代码文件、配置文件等，可指定行范围读取
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath, getFileExtension, isExtensionAllowed, getMaxFileSize } from './FileSecurityUtils';

export class ReadFileTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'read_file';

  readonly description = '读取指定文件的内容。支持文本文件、代码文件、配置文件等。可通过 offset 和 limit 指定读取行范围。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径（相对于工作区根目录）',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认为 utf-8',
        enum: ['utf-8', 'utf-16', 'ascii', 'binary'],
        default: 'utf-8',
      },
    },
    required: ['path'],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: false,
    readOnly: true,
    priority: 100,
    version: '2.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { path } = params as { path: string };

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const ext = getFileExtension(path);
    if (!isExtensionAllowed(ext, this.config)) {
      return this.failure(`不允许读取 ${ext} 类型的文件`);
    }

    const result = await this.invokeIPC<string>(
      'agent:fs:readFile',
      fullPath,
      this.config.workspacePath
    );

    if (!result.success) {
      return this.failure(result.error ?? '读取文件失败');
    }

    const content = result.data ?? '';
    const maxSize = getMaxFileSize(this.config);
    if (content.length > maxSize) {
      return this.failure(`文件大小超过限制 (${maxSize} 字节)`);
    }

    return this.success({
      content,
      path: fullPath,
      size: content.length,
    });
  }
}
