/**
 * CodeRunnerService - 渲染进程代码运行服务
 * 功能：封装 IPC 调用，提供代码执行接口
 * 描述：与主进程 CodeRunnerService 通信，执行代码并返回结果
 */

import type {
  CodeRunRequest,
  CodeRunResult,
  RuntimeCheckResult,
  SupportedLanguage
} from '../../../shared/src/types/codeRunner';
import { CODE_RUNNER_CHANNELS } from '../../../shared/src/types/codeRunner';

/**
 * CodeRunnerService 类
 * 提供代码执行的渲染进程接口
 */
class CodeRunnerService {
  private static instance: CodeRunnerService;

  private constructor() {
    console.log('[CodeRunnerService] 渲染进程服务初始化');
  }

  /** 获取单例实例 */
  public static getInstance(): CodeRunnerService {
    if (!CodeRunnerService.instance) {
      CodeRunnerService.instance = new CodeRunnerService();
    }
    return CodeRunnerService.instance;
  }

  /** 执行代码 */
  public async runCode(request: CodeRunRequest): Promise<CodeRunResult> {
    try {
      if (!window.electron?.ipcRenderer) {
        throw new Error('Electron IPC 不可用');
      }
      const result = await window.electron.ipcRenderer.invoke(
        CODE_RUNNER_CHANNELS.RUN_CODE,
        request
      );
      return result as CodeRunResult;
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: '',
        executionTime: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /** 检查运行时是否可用 */
  public async checkRuntime(language: SupportedLanguage): Promise<RuntimeCheckResult> {
    try {
      if (!window.electron?.ipcRenderer) {
        return { language, available: false };
      }
      const result = await window.electron.ipcRenderer.invoke(
        CODE_RUNNER_CHANNELS.CHECK_RUNTIME,
        language
      );
      return result as RuntimeCheckResult;
    } catch {
      return { language, available: false };
    }
  }

  /** 停止正在运行的代码 */
  public async stopCode(processId: string): Promise<boolean> {
    try {
      if (!window.electron?.ipcRenderer) {
        return false;
      }
      const result = await window.electron.ipcRenderer.invoke(
        CODE_RUNNER_CHANNELS.STOP_CODE,
        processId
      );
      return result as boolean;
    } catch {
      return false;
    }
  }

  /** 检查语言是否支持运行 */
  public isSupportedLanguage(language: string): language is SupportedLanguage {
    const supported: SupportedLanguage[] = [
      'javascript', 'typescript', 'python', 'node', 'bash', 'sh'
    ];
    return supported.includes(language as SupportedLanguage);
  }

  /** 获取语言显示名称 */
  public getLanguageDisplayName(language: SupportedLanguage): string {
    const names: Record<SupportedLanguage, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      python: 'Python',
      node: 'Node.js',
      bash: 'Bash',
      sh: 'Shell'
    };
    return names[language] || language;
  }
}

/** 导出单例实例 */
export const codeRunnerService = CodeRunnerService.getInstance();

/** 导出类型 */
export type { CodeRunRequest, CodeRunResult, RuntimeCheckResult, SupportedLanguage };
