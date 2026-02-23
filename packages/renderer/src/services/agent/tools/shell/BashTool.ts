/**
 * Shell 命令执行工具
 * 功能：在工作区目录下安全地执行 Shell 命令
 * 描述：通过主进程 child_process 执行命令，有超时和安全限制
 */

import { BaseTool } from '../base/BaseTool';
import type { ToolResult, ToolParameterSchema } from '../../types';
import type { ToolMetadata, ShellToolConfig } from '../base/types';

/** Shell 执行结果 */
interface ShellExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** 默认禁止的命令模式 */
const DEFAULT_FORBIDDEN_COMMANDS: RegExp[] = [
  /rm\s+-rf\s+\//i,
  /format\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rmdir\s+\/s\s+\/q\s+[a-z]:\\/i,
];

/** 默认超时时间（30秒） */
const DEFAULT_TIMEOUT = 30000;

export class BashTool extends BaseTool<ShellToolConfig> {
  readonly name = 'bash';

  readonly description = '在工作区目录下执行 Shell 命令。可用于运行脚本、查看文件信息、安装依赖等。';

  readonly parameters: ToolParameterSchema = {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 Shell 命令',
      },
      timeout: {
        type: 'number',
        description: '超时时间（毫秒），默认 30000',
        default: DEFAULT_TIMEOUT,
      },
    },
    required: ['command'],
  };

  readonly metadata: ToolMetadata = {
    category: 'shell',
    requiresConfirmation: true,
    readOnly: false,
    priority: 70,
    version: '1.0.0',
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const { command, timeout } = params as {
      command: string;
      timeout?: number;
    };

    if (this.config.allowExecution === false) {
      return this.failure('当前配置不允许执行 Shell 命令');
    }

    // 安全检查：禁止危险命令
    const forbidden = this.config.forbiddenCommands ?? DEFAULT_FORBIDDEN_COMMANDS;
    for (const pattern of forbidden) {
      if (pattern.test(command)) {
        return this.failure(`命令被安全策略禁止: ${command}`);
      }
    }

    const execTimeout = timeout ?? this.config.timeout ?? DEFAULT_TIMEOUT;

    const result = await this.invokeIPC<ShellExecuteResult>(
      'agent:shell:execute',
      command,
      this.config.workspacePath,
      execTimeout
    );

    if (!result.success) {
      return this.failure(result.error ?? '命令执行失败');
    }

    const { stdout, stderr, exitCode } = result.data ?? { stdout: '', stderr: '', exitCode: -1 };

    return this.success({
      stdout,
      stderr,
      exitCode,
      command,
    });
  }
}
