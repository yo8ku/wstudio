/**
 * CodeRunnerService - 代码运行服务
 * 功能：在沙盒环境中执行代码，支持 JavaScript、TypeScript、Python 等语言
 * 描述：使用 child_process 在隔离环境中执行代码，提供超时控制和输出捕获
 */

import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ipcMain } from 'electron';
import type {
  CodeRunRequest,
  CodeRunResult,
  RuntimeCheckResult,
  SupportedLanguage
} from '../../../shared/src/types/codeRunner';
import { CODE_RUNNER_CHANNELS } from '../../../shared/src/types/codeRunner';

const execAsync = promisify(exec);

/** 语言运行时配置 */
interface RuntimeConfig {
  command: string;
  args: string[];
  fileExtension: string;
  versionCommand: string;
}

/** 运行时配置映射 */
const RUNTIME_CONFIGS: Record<SupportedLanguage, RuntimeConfig> = {
  javascript: {
    command: 'node',
    args: [],
    fileExtension: '.js',
    versionCommand: 'node --version'
  },
  typescript: {
    command: 'npx',
    args: ['ts-node', '--transpile-only'],
    fileExtension: '.ts',
    versionCommand: 'npx ts-node --version'
  },
  python: {
    command: 'python',
    args: [],
    fileExtension: '.py',
    versionCommand: 'python --version'
  },
  node: {
    command: 'node',
    args: [],
    fileExtension: '.js',
    versionCommand: 'node --version'
  },
  bash: {
    command: 'bash',
    args: [],
    fileExtension: '.sh',
    versionCommand: 'bash --version'
  },
  sh: {
    command: 'sh',
    args: [],
    fileExtension: '.sh',
    versionCommand: 'sh --version'
  }
};

/**
 * CodeRunnerService 类
 * 提供代码执行和运行时检查功能
 */
export class CodeRunnerService {
  private static instance: CodeRunnerService;
  private runningProcesses: Map<string, ChildProcess> = new Map();
  private tempDir: string;

  private constructor() {
    this.tempDir = path.join(os.tmpdir(), 'note-studio-code-runner');
    this.ensureTempDir();
    this.registerIpcHandlers();
    console.log('[CodeRunnerService] 服务初始化完成');
  }

  /** 获取单例实例 */
  public static getInstance(): CodeRunnerService {
    if (!CodeRunnerService.instance) {
      CodeRunnerService.instance = new CodeRunnerService();
    }
    return CodeRunnerService.instance;
  }

  /** 确保临时目录存在 */
  private ensureTempDir(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /** 注册 IPC 处理器 */
  private registerIpcHandlers(): void {
    ipcMain.handle(CODE_RUNNER_CHANNELS.RUN_CODE, async (_, request: CodeRunRequest) => {
      return this.runCode(request);
    });

    ipcMain.handle(CODE_RUNNER_CHANNELS.CHECK_RUNTIME, async (_, language: SupportedLanguage) => {
      return this.checkRuntime(language);
    });

    ipcMain.handle(CODE_RUNNER_CHANNELS.STOP_CODE, async (_, processId: string) => {
      return this.stopCode(processId);
    });
  }

  /** 执行代码 */
  public async runCode(request: CodeRunRequest): Promise<CodeRunResult> {
    const { code, language, timeout = 30000 } = request;
    const startTime = Date.now();

    const config = RUNTIME_CONFIGS[language];
    if (!config) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        executionTime: 0,
        error: `不支持的语言: ${language}`
      };
    }

    // 检查运行时是否可用
    const runtimeCheck = await this.checkRuntime(language);
    if (!runtimeCheck.available) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        executionTime: 0,
        error: `运行时不可用: ${language}。请确保已安装 ${config.command}`
      };
    }

    // 创建临时文件
    const tempFile = path.join(this.tempDir, `code_${Date.now()}${config.fileExtension}`);
    
    try {
      fs.writeFileSync(tempFile, code, 'utf-8');

      const result = await this.executeFile(tempFile, config, timeout);
      const executionTime = Date.now() - startTime;

      return {
        ...result,
        executionTime
      };
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // 清理临时文件
      this.cleanupTempFile(tempFile);
    }
  }

  /** 执行文件 */
  private executeFile(
    filePath: string,
    config: RuntimeConfig,
    timeout: number
  ): Promise<CodeRunResult> {
    return new Promise((resolve) => {
      const args = [...config.args, filePath];
      const processId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      let stdout = '';
      let stderr = '';
      let killed = false;

      const child = spawn(config.command, args, {
        cwd: this.tempDir,
        env: { ...process.env },
        shell: process.platform === 'win32'
      });

      this.runningProcesses.set(processId, child);

      // 设置超时
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 1000);
      }, timeout);

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (exitCode) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(processId);

        if (killed) {
          resolve({
            success: false,
            stdout,
            stderr,
            executionTime: 0,
            error: `执行超时 (${timeout}ms)`,
            exitCode: exitCode ?? -1
          });
        } else {
          resolve({
            success: exitCode === 0,
            stdout,
            stderr,
            executionTime: 0,
            exitCode: exitCode ?? 0
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        this.runningProcesses.delete(processId);
        resolve({
          success: false,
          stdout,
          stderr,
          executionTime: 0,
          error: error.message
        });
      });
    });
  }

  /** 检查运行时是否可用 */
  public async checkRuntime(language: SupportedLanguage): Promise<RuntimeCheckResult> {
    const config = RUNTIME_CONFIGS[language];
    if (!config) {
      return { language, available: false };
    }

    try {
      const { stdout } = await execAsync(config.versionCommand, { timeout: 5000 });
      const version = stdout.trim().split('\n')[0];
      
      return {
        language,
        available: true,
        version,
        path: config.command
      };
    } catch {
      return { language, available: false };
    }
  }

  /** 停止正在运行的代码 */
  public stopCode(processId: string): boolean {
    const child = this.runningProcesses.get(processId);
    if (child) {
      child.kill('SIGTERM');
      this.runningProcesses.delete(processId);
      return true;
    }
    return false;
  }

  /** 清理临时文件 */
  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn('[CodeRunnerService] 清理临时文件失败:', error);
    }
  }

  /** 清理所有临时文件 */
  public cleanupAllTempFiles(): void {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file.startsWith('code_')) {
          fs.unlinkSync(path.join(this.tempDir, file));
        }
      }
    } catch (error) {
      console.warn('[CodeRunnerService] 清理临时目录失败:', error);
    }
  }
}

/** 获取 CodeRunnerService 实例 */
let _codeRunnerInstance: CodeRunnerService | null = null;

export function getCodeRunnerService(): CodeRunnerService {
  if (!_codeRunnerInstance) {
    _codeRunnerInstance = CodeRunnerService.getInstance();
  }
  return _codeRunnerInstance;
}
