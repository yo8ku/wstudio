/**
 * 终端服务模块导出
 * 功能：统一导出终端相关的类和类型
 */

export { TerminalService } from './TerminalService';
export { ShellDetector, getShellDetector } from './ShellDetector';
export type {
  TerminalOptions,
  TerminalInstance,
  TerminalPtyInfo,
  TerminalExitEvent,
  ShellType,
  ShellConfig,
} from './types';
