/**
 * Internal runtime symbols used by the host to drive plugin and component lifecycle without widening the public SDK surface.
 */

import type { PluginFailureContext, PluginLifecycleSnapshot } from '../types/lifecycle';

export const COMPONENT_INTERNAL_LOAD = Symbol.for('wstudio.component.internal.load');
export const COMPONENT_INTERNAL_UNLOAD = Symbol.for('wstudio.component.internal.unload');
export const COMPONENT_INTERNAL_ADD_CHILD = Symbol.for('wstudio.component.internal.addChild');
export const COMPONENT_INTERNAL_REMOVE_CHILD = Symbol.for('wstudio.component.internal.removeChild');
export const PLUGIN_INTERNAL_LOAD = Symbol.for('wstudio.plugin.internal.load');
export const PLUGIN_INTERNAL_ENABLE = Symbol.for('wstudio.plugin.internal.enable');
export const PLUGIN_INTERNAL_DISABLE = Symbol.for('wstudio.plugin.internal.disable');
export const PLUGIN_INTERNAL_UNLOAD = Symbol.for('wstudio.plugin.internal.unload');
export const PLUGIN_INTERNAL_FAIL = Symbol.for('wstudio.plugin.internal.fail');
export const PLUGIN_INTERNAL_GET_SNAPSHOT = Symbol.for('wstudio.plugin.internal.getSnapshot');
export const SETTING_TAB_INTERNAL_ATTACH = Symbol.for('wstudio.settingTab.internal.attach');

export interface InternalComponentRuntime {
  [COMPONENT_INTERNAL_LOAD](): Promise<void>;
  [COMPONENT_INTERNAL_UNLOAD](): Promise<void>;
  [COMPONENT_INTERNAL_ADD_CHILD]<TComponent>(component: TComponent): Promise<TComponent>;
  [COMPONENT_INTERNAL_REMOVE_CHILD]<TComponent>(component: TComponent): Promise<TComponent>;
}

export interface InternalPluginRuntime {
  [PLUGIN_INTERNAL_LOAD](): Promise<void>;
  [PLUGIN_INTERNAL_ENABLE](): Promise<void>;
  [PLUGIN_INTERNAL_DISABLE](): Promise<void>;
  [PLUGIN_INTERNAL_UNLOAD](): Promise<void>;
  [PLUGIN_INTERNAL_FAIL](error: Error): Promise<PluginFailureContext>;
  [PLUGIN_INTERNAL_GET_SNAPSHOT](): PluginLifecycleSnapshot;
}

export interface InternalSettingTabRuntime {
  [SETTING_TAB_INTERNAL_ATTACH](containerEl: HTMLElement): void;
}
