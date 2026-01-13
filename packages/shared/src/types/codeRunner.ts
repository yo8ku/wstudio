/**
 * 代码运行器类型定义
 * 功能：定义代码执行相关的类型接口
 */

/** 支持的编程语言 */
export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'node' | 'bash' | 'sh';

/** 代码执行请求 */
export interface CodeRunRequest {
  /** 要执行的代码 */
  code: string;
  /** 编程语言 */
  language: SupportedLanguage;
  /** 执行超时时间（毫秒） */
  timeout?: number;
}

/** 代码执行结果 */
export interface CodeRunResult {
  /** 是否执行成功 */
  success: boolean;
  /** 标准输出 */
  stdout: string;
  /** 错误输出 */
  stderr: string;
  /** 执行时间（毫秒） */
  executionTime: number;
  /** 错误信息 */
  error?: string;
  /** 退出码 */
  exitCode?: number;
}

/** 代码运行器 IPC 通道 */
export const CODE_RUNNER_CHANNELS = {
  RUN_CODE: 'code-runner:run',
  STOP_CODE: 'code-runner:stop',
  CHECK_RUNTIME: 'code-runner:check-runtime'
} as const;

/** 运行时检查结果 */
export interface RuntimeCheckResult {
  /** 语言 */
  language: SupportedLanguage;
  /** 是否可用 */
  available: boolean;
  /** 版本信息 */
  version?: string;
  /** 可执行文件路径 */
  path?: string;
}
