/**
 * 插件开发调试相关 IPC 契约。
 */

import type { WorkbenchContributionError } from './workbench-contribution';

export interface ExtensionDevelopmentReloadFailure {
  readonly rootDirectory: string;
  readonly manifestPath: string;
  readonly code: string;
  readonly message: string;
}

export interface ExtensionDevelopmentReloadResult {
  readonly roots: readonly string[];
  readonly registeredCount: number;
  readonly failureCount: number;
  readonly failures: readonly ExtensionDevelopmentReloadFailure[];
}

export interface ExtensionDevelopmentReloadResponse {
  readonly success: boolean;
  readonly data?: ExtensionDevelopmentReloadResult;
  readonly error?: WorkbenchContributionError;
}
