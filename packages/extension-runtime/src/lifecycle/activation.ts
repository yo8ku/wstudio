/**
 * 插件激活匹配的基础辅助函数。
 */

import type { ResolvedExtensionManifest } from '@note-studio/extension-api';
import type { ExtensionActivationEvent } from '@note-studio/shared';

export function hasActivationEvent(
  manifest: ResolvedExtensionManifest,
  activationEvent: ExtensionActivationEvent,
): boolean {
  return manifest.activationEvents.some((candidate) => candidate === activationEvent);
}

export function shouldActivateOnStartup(manifest: ResolvedExtensionManifest): boolean {
  return hasActivationEvent(manifest, 'onStartupFinished');
}
