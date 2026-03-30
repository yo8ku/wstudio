/**
 * 插件定义辅助函数。
 * 用于在插件入口处保留完整类型推断。
 */

import type { PluginManifest, PluginModule } from '../types/plugin'

export function definePlugin(plugin: PluginModule): PluginModule {
  return plugin
}

export function definePluginManifest(manifest: PluginManifest): PluginManifest {
  return manifest
}
