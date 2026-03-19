/**
 * 插件 manifest 解析与校验阶段复用的结果类型。
 */

import type { ExtensionManifest } from '@note-studio/extension-api';

export interface ExtensionManifestIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export interface ExtensionManifestParseResult {
  readonly manifest?: ExtensionManifest;
  readonly issues: readonly ExtensionManifestIssue[];
}

export interface ExtensionManifestValidationOptions {
  readonly hostVersion: string;
  readonly rootDirectory: string;
  readonly existingExtensionIds?: readonly string[];
}

export interface ExtensionManifestValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ExtensionManifestIssue[];
}
