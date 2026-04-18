import type { JsonValue } from '@note-studio/shared';

export interface PluginSurfaceThemeSnapshot {
  readonly info: {
    readonly id: string;
    readonly label: string;
    readonly appearance: 'light' | 'dark';
  };
  readonly tokens: Readonly<Record<string, string>>;
}

export interface PluginSurfaceRuntimeContextSnapshot {
  readonly surfaceInstanceId: string;
  readonly state: JsonValue;
  readonly theme: PluginSurfaceThemeSnapshot;
}

export const PLUGIN_SURFACE_CONTEXT_UPDATED_CHANNEL = 'plugin-surface:context-updated';
export const PLUGIN_SURFACE_REPORT_RUNTIME_STATUS_CHANNEL = 'plugin-surface:report-runtime-status';
