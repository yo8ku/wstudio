/**
 * 精确替换编辑工具
 * 功能：通过 old_string → new_string 精确替换文件中的指定内容
 * 描述：类似 Claude Code 的 Edit 工具，定位并替换文件中的精确文本片段
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema, FileChange } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath, getFileExtension, isExtensionAllowed } from './FileSecurityUtils';

/** editFile IPC 返回数据 */
interface EditFileResult {
  originalContent: string;
  newContent: string;
  matchCount: number;
  path: string;
}

export class EditFileTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'edit_file';

  readonly description = '精确替换文件中的指定内容。提供要替换的原始文本（old_string）和新文本（new_string），工具会定位并替换。原始文本必须在文件中唯一匹配。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要编辑的文件路径（相对于工作区根目录）',
      },
      old_string: {
        type: 'string',
        description: '要被替换的原始文本（必须精确匹配文件中的内容）',
      },
      new_string: {
        type: 'string',
        description: '替换后的新文本',
      },
    },
    required: ['path', 'old_string', 'new_string'],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: true,
    readOnly: false,
    priority: 95,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { path, old_string, new_string } = params as {
      path: string;
      old_string: string;
      new_string: string;
    };

    if (this.config.allowWrite === false) {
      return this.failure('当前配置不允许编辑文件');
    }

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const ext = getFileExtension(path);
    if (!isExtensionAllowed(ext, this.config)) {
      return this.failure(`不允许编辑 ${ext} 类型的文件`);
    }

    if (old_string === new_string) {
      return this.failure('old_string 和 new_string 相同，无需替换');
    }

    const result = await this.invokeIPC<EditFileResult>(
      'agent:fs:editFile',
      fullPath,
      old_string,
      new_string,
      this.config.workspacePath
    );

    if (!result.success) {
      return this.failure(result.error ?? '编辑文件失败');
    }

    const changes: FileChange[] = [{
      type: 'modify',
      filePath: fullPath,
      newContent: result.data?.newContent,
      timestamp: Date.now(),
    }];

    return this.success({
      path: fullPath,
      matchCount: result.data?.matchCount ?? 1,
    }, changes);
  }
}
