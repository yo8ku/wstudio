/**
 * 插件入口契约与定义辅助函数。
 */

import type { ExtensionContext } from './context';

export interface ExtensionPlugin {
  activate(context: ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export function definePlugin(plugin: ExtensionPlugin): ExtensionPlugin {
  return plugin;
}
