/**
 * Agent Shell IPC handlers.
 * Provides a controlled shell execution bridge for Agent tools.
 */

import { ipcMain } from 'electron';
import { exec, type ExecException } from 'child_process';
import * as fs from 'fs';
import { TextDecoder } from 'util';

interface ShellExecuteResult {
  success: boolean;
  data?: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  error?: string;
}

const MAX_BUFFER = 1024 * 1024;

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

const CJK_CHAR_REGEX = /[\u3400-\u9FFF]/g;
const REPLACEMENT_CHAR_REGEX = /\uFFFD/g;
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;
const BOM_UTF16LE_0 = 0xFF;
const BOM_UTF16LE_1 = 0xFE;
const UTF8_OUTPUT_HINT_REGEX = /(UTF8Encoding|OutputEncoding|chcp\s+65001|encoding\s*=\s*['"]?utf-?8['"]?)/i;

function scoreDecodedText(text: string): number {
  const cjkCount = (text.match(CJK_CHAR_REGEX) || []).length;
  const replacementCount = (text.match(REPLACEMENT_CHAR_REGEX) || []).length;
  const controlCount = (text.match(CONTROL_CHAR_REGEX) || []).length;
  return (cjkCount * 4) - (replacementCount * 10) - (controlCount * 2);
}

function decodeBufferWithEncoding(buffer: Buffer, encoding: string): string | null {
  try {
    const decoder = new TextDecoder(encoding as BufferEncoding, { fatal: false });
    return decoder.decode(buffer);
  } catch {
    return null;
  }
}

function decodeBufferStrict(buffer: Buffer, encoding: string): string | null {
  try {
    const decoder = new TextDecoder(encoding as BufferEncoding, { fatal: true });
    return decoder.decode(buffer);
  } catch {
    return null;
  }
}

function hasUtf16LeBOM(buffer: Buffer): boolean {
  return buffer.length >= 2
    && buffer[0] === BOM_UTF16LE_0
    && buffer[1] === BOM_UTF16LE_1;
}

function hasManyNullBytes(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  let nullCount = 0;
  const sampleSize = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleSize; i += 1) {
    if (buffer[i] === 0x00) nullCount += 1;
  }
  return (nullCount / sampleSize) > 0.08;
}

function hasUtf8OutputHint(command: string): boolean {
  return UTF8_OUTPUT_HINT_REGEX.test(command);
}

function decodeShellOutput(
  value: string | Buffer | undefined,
  options?: { preferUtf8?: boolean }
): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value.length === 0) return '';
  const preferUtf8 = options?.preferUtf8 === true;

  const looksUtf16 = hasUtf16LeBOM(value) || hasManyNullBytes(value);
  const utf16Text = looksUtf16
    ? (decodeBufferWithEncoding(value, 'utf-16le') || null)
    : null;
  if (looksUtf16 && utf16Text) {
    return utf16Text;
  }

  const strictUtf8Text = decodeBufferStrict(value, 'utf-8');
  if (strictUtf8Text && !looksUtf16) {
    return strictUtf8Text;
  }
  if (preferUtf8) {
    return strictUtf8Text || value.toString('utf8');
  }

  const utf8Text = strictUtf8Text || value.toString('utf8');
  const gbkText = decodeBufferWithEncoding(value, 'gbk');

  const candidates: string[] = [utf8Text];
  if (gbkText) candidates.push(gbkText);
  if (utf16Text) candidates.push(utf16Text);

  let bestText = candidates[0] || '';
  let bestScore = scoreDecodedText(bestText);
  for (let i = 1; i < candidates.length; i += 1) {
    const text = candidates[i];
    const score = scoreDecodedText(text);
    if (score > bestScore) {
      bestText = text;
      bestScore = score;
    }
  }

  if (strictUtf8Text) {
    const utf8Score = scoreDecodedText(strictUtf8Text);
    if (utf8Score >= bestScore - 2) {
      return strictUtf8Text;
    }
  }

  return bestText;
}

function isShellSpawnNotFound(error: ExecException | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? '').toUpperCase();
  if (code === 'ENOENT') return true;
  return /spawn .* ENOENT/i.test(error.message || '');
}

function getWindowsShellCandidates(): string[] {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
  const rawCandidates = [
    process.env.ComSpec,
    `${systemRoot}\\System32\\cmd.exe`,
    `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    'powershell.exe',
    'pwsh.exe',
    'cmd.exe',
  ];

  const dedup = new Set<string>();
  const candidates: string[] = [];

  for (const value of rawCandidates) {
    if (typeof value !== 'string') continue;
    const candidate = value.trim();
    if (!candidate) continue;

    const key = candidate.toLowerCase();
    if (dedup.has(key)) continue;

    const isAbsolute = /^(?:[a-zA-Z]:\\|\\\\)/.test(candidate);
    if (isAbsolute && !fs.existsSync(candidate)) continue;

    dedup.add(key);
    candidates.push(candidate);
  }

  return candidates;
}

export function registerAgentShellHandlers(): void {
  try {
    ipcMain.removeHandler('agent:shell:execute');
  } catch {
    // ignore
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
        for (const pattern of FORBIDDEN_COMMANDS) {
          if (pattern.test(command)) {
            return { success: false, error: `命令被安全策略禁止: ${command}` };
          }
        }

        if (!workspacePath) {
          return { success: false, error: '工作区路径不能为空' };
        }

        console.log('[AgentShell] execute:', command, 'workspace:', workspacePath);

        const runExecWithShell = async (
          shellOverride: string | undefined
        ): Promise<{ result: ShellExecuteResult; shellNotFound: boolean }> =>
          new Promise(resolve => {
            exec(
              command,
              {
                cwd: workspacePath,
                timeout: Math.min(timeout, 120000),
                maxBuffer: MAX_BUFFER,
                encoding: 'buffer',
                env: { ...process.env },
                windowsHide: true,
                shell: shellOverride,
              },
              (
                error: ExecException | null,
                stdout: string | Buffer,
                stderr: string | Buffer
              ) => {
                const preferUtf8 = hasUtf8OutputHint(command);
                const decodedStdout = decodeShellOutput(stdout as Buffer | string | undefined, { preferUtf8 });
                const decodedStderr = decodeShellOutput(stderr as Buffer | string | undefined, { preferUtf8 });

                if (error) {
                  if (error.killed) {
                    resolve({
                      shellNotFound: false,
                      result: {
                        success: false,
                        error: `命令执行超时 (${timeout}ms)`,
                        data: { stdout: decodedStdout, stderr: decodedStderr, exitCode: -1 },
                      },
                    });
                    return;
                  }

                  if (isShellSpawnNotFound(error)) {
                    resolve({
                      shellNotFound: true,
                      result: {
                        success: false,
                        error: error.message,
                        data: {
                          stdout: decodedStdout,
                          stderr: decodedStderr || error.message,
                          exitCode: -1,
                        },
                      },
                    });
                    return;
                  }

                  resolve({
                    shellNotFound: false,
                    result: {
                      success: true,
                      data: {
                        stdout: decodedStdout,
                        stderr: decodedStderr || error.message,
                        exitCode: typeof error.code === 'number' ? error.code : 1,
                      },
                    },
                  });
                  return;
                }

                resolve({
                  shellNotFound: false,
                  result: {
                    success: true,
                    data: {
                      stdout: decodedStdout,
                      stderr: decodedStderr,
                      exitCode: 0,
                    },
                  },
                });
              }
            );
          });

        const shellCandidates: Array<string | undefined> = process.platform === 'win32'
          ? [undefined, ...getWindowsShellCandidates()]
          : [undefined];
        let lastShellNotFoundError = '';

        for (const shellCandidate of shellCandidates) {
          const attempt = await runExecWithShell(shellCandidate);
          if (!attempt.shellNotFound) {
            return attempt.result;
          }
          if (attempt.result.error) {
            lastShellNotFoundError = attempt.result.error;
          }
        }

        return {
          success: false,
          error: lastShellNotFoundError || '命令执行失败: 无可用 shell',
        };
      } catch (error) {
        console.error('[AgentShell] execute failed:', error);
        return { success: false, error: String(error) };
      }
    }
  );

  console.log('[AgentShell] handler registered');
}
