/**
 * Resource explorer contribution contracts exposed to plugins.
 * Registered items are rendered by the host as file-tree section entries.
 */

import type { Disposable } from './disposable';
import type { IconName } from './ui';

export interface ResourceExplorerItemRegistration {
  readonly title: string;
  readonly path: string;
  readonly icon?: IconName;
  readonly viewType?: string;
  readonly retainContextWhenHidden?: boolean;
}

export interface ResourceExplorerItemRegistry {
  registerResourceExplorerItem(
    pluginId: string,
    itemId: string,
    registration: ResourceExplorerItemRegistration,
  ): Disposable;
}
