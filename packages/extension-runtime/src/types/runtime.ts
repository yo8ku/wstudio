/**
 * 插件运行时内部共享类型。
 */

import type { ExtensionPlugin, ResolvedExtensionManifest } from '@note-studio/extension-api';
import type { ExtensionActivationEvent, ExtensionLifecycleState } from '@note-studio/shared';

export interface ExtensionRuntimeDescriptor {
  readonly manifest: ResolvedExtensionManifest;
  readonly manifestPath: string;
  readonly entryFile: string;
  readonly rootDirectory: string;
  readonly state: ExtensionLifecycleState;
}

export interface ExtensionRuntimeModule {
  readonly default: ExtensionPlugin;
}

export interface ExtensionActivationRequest {
  readonly extensionId: string;
  readonly activationEvent: ExtensionActivationEvent;
}

export interface ExtensionStatusSnapshot {
  readonly extensionId: string;
  readonly state: ExtensionLifecycleState;
}
