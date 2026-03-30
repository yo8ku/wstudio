/**
 * 插件定义辅助函数。
 * 用于在插件入口处保留完整类型推断。
 */
import type { PluginManifest, PluginModule } from '../types/plugin';
export declare function definePlugin(plugin: PluginModule): PluginModule;
export declare function definePluginManifest(manifest: PluginManifest): PluginManifest;
