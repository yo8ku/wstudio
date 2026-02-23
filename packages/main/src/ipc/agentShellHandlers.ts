/**
 * Agent Shell IPC 处理器
 * 功能：为 Agent 提供安全的 Shell 命令执行接口
 * 描述：通过 child_process.exec 执行命令，有超时、输出大小和安全限制
 */

import { ipcMain } from 'electron';
import { exec } from 'child_process';
import * as path from 'path';

/** Shell 执行结果 */
interface ShellExecuteResult {
  success: boolean;
  data?: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  error?: string;
}

/** 最大输出缓冲区大小（1MB） */
const MAX_BUFFER = 1024 * 1024;

/** 禁止的命令模式（主进程二次校验） */
const FORBIDDEN_COMMANDS: RegExp[] = [
  /rm\s+-rf\s+\//i,
  /format\s+/i,
  /mkfs/i,
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /del\s+\/s\s+\/q\s+[a-z]:\\/i,
  /rmdir\s+\/s\s+\/q\s+[a-z]:\\/i,
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
 * 注册 Agent Shell IPC 处理器
 */
export function registerAgentShellHandlers(): void {
  // 移除可能存在的旧处理器
  try {
    ipcMain.removeHandler('agent:shell:execute');
  } catch {
    // 忽略未注册的处理器
  }

  ipcMain.handle(
    'agent:shell:execute',
    async (
      _event: Electron.IpcMainInvokeEvent,
      command: string,
      workspacePath: string,
      timeout: number = 30000
    ): Promise<ShellExecuteResult> => {
      try {
        // 安全检查：禁止危险命令
        for (const pattern of FORBIDDEN_COMMANDS) {
          if (pattern.test(command)) {
            return { success: false, error: `命令被安全策略禁止: ${command}` };
          }
        }

        // 验证工作区路径
        if (!workspacePath) {
          return { success: false, error: '工作区路径不能为空' };
        }

        console.log('[AgentShell] 执行命令:', command, '工作区:', workspacePath);

        return await new Promise<ShellExecuteResult>((resolve) => {
          exec(
            command,
            {
              cwd: workspacePath,
              timeout: Math.min(timeout, 120000),
              maxBuffer: MAX_BUFFER,
              env: { ...process.env },
              windowsHide: true,
            },
            (error, stdout, stderr) => {
              if (error) {
                // 超时或其他错误
                if (error.killed) {
                  resolve({
                    success: false,
                    error: `命令执行超时 (${timeout}ms)`,
                    data: { stdout: stdout || '', stderr: stderr || '', exitCode: -1 },
                  });
                  return;
                }

                // 命令执行失败但有输出
                resolve({
                  success: true,
                  data: {
                    stdout: stdout || '',
                    stderr: stderr || error.message,
                    exitCode: error.code ?? 1,
                  },
                });
                return;
              }

              resolve({
                success: true,
                data: {
                  stdout: stdout || '',
                  stderr: stderr || '',
                  exitCode: 0,
                },
              });
            }
          );
        });
      } catch (error) {
        console.error('[AgentShell] 命令执行失败:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  console.log('[AgentShell] Agent Shell IPC 处理器已注册');
}
