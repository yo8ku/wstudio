/**
 * 插件 manifest 契约定义。
 */

import type { ExtensionActivationEvent, ExtensionPermission } from '@note-studio/shared';
import type { ExtensionContributes } from './contributes';

export interface ExtensionManifestEngines {
  readonly wstudio: string;
}

export interface ExtensionManifest {
  readonly id: string;
  readonly name: string;
  readonly publisher?: string;
  readonly version: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly main: string;
  readonly engines: ExtensionManifestEngines;
  readonly activationEvents?: readonly ExtensionActivationEvent[];
  readonly permissions?: readonly ExtensionPermission[];
  readonly contributes?: ExtensionContributes;
  readonly keywords?: readonly string[];
  readonly categories?: readonly string[];
}

export interface ResolvedExtensionManifest
  extends Omit<ExtensionManifest, 'displayName' | 'description' | 'activationEvents' | 'permissions' | 'contributes'> {
  readonly displayName: string;
  readonly description: string;
  readonly activationEvents: readonly ExtensionActivationEvent[];
  readonly permissions: readonly ExtensionPermission[];
  readonly contributes: ExtensionContributes;
}
