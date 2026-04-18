/**
 * IPC contracts for host-managed plugin UI entries rendered in the shell.
 */

export const PLUGIN_UI_ENTRY_LOCATIONS = [
  'activityBar',
  'titleBar',
  'statusBar',
  'editorTabBar',
  'canvasToolbar',
  'canvasTitleBar',
  'canvasContextMenu',
] as const;

export type PluginUiEntryLocation = (typeof PLUGIN_UI_ENTRY_LOCATIONS)[number];

export const PLUGIN_UI_ENTRY_KINDS = [
  'iconButton',
  'statusBarItem',
] as const;

export type PluginUiEntryKind = (typeof PLUGIN_UI_ENTRY_KINDS)[number];

export interface PluginUiEntryScope {
  readonly viewType?: string;
  readonly fileExtensions?: readonly string[];
}

export interface PluginUiEntrySnapshot {
  readonly id: string;
  readonly pluginId: string;
  readonly location: PluginUiEntryLocation;
  readonly kind: PluginUiEntryKind;
  readonly title: string;
  readonly tooltip: string | null;
  readonly text: string | null;
  readonly icon: string | null;
  readonly iconSvg: string | null;
  readonly scope: PluginUiEntryScope | null;
}

export interface PluginUiError {
  readonly code: string;
  readonly message: string;
}

export interface PluginUiEntryListResponse {
  readonly success: boolean;
  readonly data?: readonly PluginUiEntrySnapshot[];
  readonly error?: PluginUiError;
}

export interface ExecutePluginUiEntryRequest {
  readonly entryId: string;
}

export interface ExecutePluginUiEntryResponse {
  readonly success: boolean;
  readonly error?: PluginUiError;
}
