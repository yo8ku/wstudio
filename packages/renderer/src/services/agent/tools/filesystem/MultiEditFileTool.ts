/**
 * 多处原子编辑工具
 * 功能：在同一文件中执行多处精确替换，保证原子性
 * 描述：所有编辑要么全部成功，要么全部不执行，避免部分替换导致文件损坏
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema, FileChange } from '../../types';
import type { ToolMetadata, FileSystemToolConfig } from '../base/types';
import { resolveSecurePath, getFileExtension, isExtensionAllowed } from './FileSecurityUtils';

/** 单个编辑操作 */
interface EditOperation {
  old_string: string;
  new_string: string;
}

/** multiEdit IPC 返回数据 */
interface MultiEditResult {
  newContent: string;
  editCount: number;
  path: string;
}

export class MultiEditFileTool extends BaseTool<FileSystemToolConfig> {
  readonly name = 'multi_edit_file';

  readonly description = '在同一文件中执行多处精确替换编辑。所有编辑原子性执行：全部成功或全部不执行。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要编辑的文件路径（相对于工作区根目录）',
      },
      edits: {
        type: 'array',
        description: '编辑操作列表，每项包含 old_string 和 new_string',
        items: {
          type: 'object',
          properties: {
            old_string: { type: 'string', description: '要被替换的原始文本' },
            new_string: { type: 'string', description: '替换后的新文本' },
          },
          required: ['old_string', 'new_string'],
        },
      },
    },
    required: ['path', 'edits'],
  };

  readonly metadata: ToolMetadata = {
    category: 'filesystem',
    requiresConfirmation: true,
    readOnly: false,
    priority: 85,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { path, edits } = params as {
      path: string;
      edits: EditOperation[];
    };

    if (this.config.allowWrite === false) {
      return this.failure('当前配置不允许编辑文件');
    }

    if (!edits || edits.length === 0) {
      return this.failure('编辑操作列表不能为空');
    }

    const fullPath = resolveSecurePath(this.config.workspacePath, path);
    if (!fullPath) {
      return this.failure('路径不在工作区范围内');
    }

    const ext = getFileExtension(path);
    if (!isExtensionAllowed(ext, this.config)) {
      return this.failure(`不允许编辑 ${ext} 类型的文件`);
    }

    const result = await this.invokeIPC<MultiEditResult>(
      'agent:fs:multiEdit',
      fullPath,
      edits,
      this.config.workspacePath
    );

    if (!result.success) {
      return this.failure(result.error ?? '多处编辑失败');
    }

    const changes: FileChange[] = [{
      type: 'modify',
      filePath: fullPath,
      newContent: result.data?.newContent,
      timestamp: Date.now(),
    }];

    return this.success({
      path: fullPath,
      editCount: result.data?.editCount ?? edits.length,
    }, changes);
  }
}
