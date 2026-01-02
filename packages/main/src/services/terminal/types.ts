/**
 * 终端服务类型定义
 * 功能：定义终端相关的接口和类型
 */

import type { ChildProcess } from 'child_process';

/** 终端创建选项 */
export interface TerminalOptions {
  /** Shell 类型或路径 */
  shell?: string;
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: Record<string, string>;
  /** 列数 */
  cols?: number;
  /** 行数 */
  rows?: number;
}

/** 终端实例 */
export interface TerminalInstance {
  /** 终端 ID */
  id: string;
  /** 子进程 */
  process: ChildProcess;
  /** Shell 类型 */
  shell: string;
  /** 创建时间 */
  createdAt: number;
}

/** 终端退出事件 */
export interface TerminalExitEvent {
  /** 退出码 */
  exitCode: number;
  /** 信号 */
  signal?: string;
}

/** Shell 类型 */
export type ShellType = 'powershell' | 'cmd' | 'bash' | 'git-bash' | 'zsh';

/** Shell 配置 */
export interface ShellConfig {
  /** Shell 名称 */
  name: string;
  /** Shell 路径 */
  path: string;
  /** Shell 参数 */
  args?: string[];
}
