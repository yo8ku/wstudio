/**
 * 渲染层 workbench contribution 快照与 IPC 契约。
 */

import type { JsonValue } from './json';

export const WORKBENCH_MENU_LOCATIONS = [
  'commandPalette',
  'editor/context',
  'note/context',
  'statusBar',
  'sidebar/title',
] as const;

export type WorkbenchMenuLocation = (typeof WORKBENCH_MENU_LOCATIONS)[number];

export const WORKBENCH_SETTING_VALUE_TYPES = [
  'string',
  'number',
  'boolean',
  'select',
] as const;

export type WorkbenchSettingValueType = (typeof WORKBENCH_SETTING_VALUE_TYPES)[number];

export const DEFAULT_WORKBENCH_FILE_ICON_THEME_ID = 'wstudio-builtin-MaterialIcon';

export interface WorkbenchContributionError {
  readonly code: string;
  readonly message: string;
}

export interface WorkbenchCommandContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly commandId: string;
  readonly title: string;
  readonly category: string | null;
  readonly icon: string | null;
}

export interface WorkbenchMenuContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly menuItemId: string;
  readonly location: WorkbenchMenuLocation;
  readonly commandId: string;
  readonly title: string;
  readonly category: string | null;
  readonly icon: string | null;
  readonly group: string | null;
  readonly when: string | null;
}

export interface WorkbenchSettingOptionEntry {
  readonly label: string;
  readonly value: JsonValue;
}

export interface WorkbenchSettingContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly key: string;
  readonly relativeKey: string;
  readonly title: string;
  readonly description: string;
  readonly type: WorkbenchSettingValueType;
  readonly defaultValue: JsonValue;
  readonly options: readonly WorkbenchSettingOptionEntry[];
}

export interface WorkbenchFileIconThemeMappingEntry {
  readonly icon: string;
  readonly extensions: readonly string[];
  readonly fileNames: readonly string[];
}

export interface WorkbenchFileIconThemeEntry {
  readonly id: string;
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly label: string;
  readonly file: string;
  readonly directory: string;
  readonly directoryExpanded: string | null;
  readonly mappings: readonly WorkbenchFileIconThemeMappingEntry[];
}

export interface WorkbenchViewContainerContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly containerKey: string;
  readonly containerId: string;
  readonly title: string;
  readonly icon: string | null;
}

export interface WorkbenchViewContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly viewKey: string;
  readonly viewId: string;
  readonly containerKey: string;
  readonly containerId: string;
  readonly title: string;
  readonly when: string | null;
  readonly webviewId: string | null;
  readonly webviewEntryUrl: string | null;
  readonly webviewHtml: string | null;
  readonly retainContextWhenHidden: boolean;
}

export interface WorkbenchResourceExplorerItemContributionEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly itemKey: string;
  readonly itemId: string;
  readonly title: string;
  readonly icon: string | null;
  readonly viewType: string;
  readonly directoryPath: string;
  readonly webviewEntryUrl: string | null;
  readonly webviewHtml: string | null;
  readonly retainContextWhenHidden: boolean;
}

export interface WorkbenchRuntimeWebviewPanelEntry {
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly panelInstanceKey: string;
  readonly panelId: string;
  readonly title: string;
  readonly webviewEntryUrl: string;
  readonly webviewHtml: string | null;
  readonly retainContextWhenHidden: boolean;
  readonly revealToken: number;
}

export interface WorkbenchContributionSnapshot {
  readonly commands: readonly WorkbenchCommandContributionEntry[];
  readonly menus: readonly WorkbenchMenuContributionEntry[];
  readonly settings: readonly WorkbenchSettingContributionEntry[];
  readonly fileIconThemes: readonly WorkbenchFileIconThemeEntry[];
  readonly viewContainers: readonly WorkbenchViewContainerContributionEntry[];
  readonly views: readonly WorkbenchViewContributionEntry[];
  readonly resourceExplorerItems: readonly WorkbenchResourceExplorerItemContributionEntry[];
  readonly runtimeWebviewPanels: readonly WorkbenchRuntimeWebviewPanelEntry[];
}

export const EMPTY_WORKBENCH_CONTRIBUTION_SNAPSHOT: WorkbenchContributionSnapshot = {
  commands: [],
  menus: [],
  settings: [],
  fileIconThemes: [],
  viewContainers: [],
  views: [],
  resourceExplorerItems: [],
  runtimeWebviewPanels: [],
};

export interface WorkbenchContributionListResponse {
  readonly success: boolean;
  readonly data?: WorkbenchContributionSnapshot;
  readonly error?: WorkbenchContributionError;
}

export interface ExecuteWorkbenchCommandRequest {
  readonly commandId: string;
  readonly args?: readonly JsonValue[];
}

export interface WorkbenchCommandExecutionResponse {
  readonly success: boolean;
  readonly data?: JsonValue | null;
  readonly error?: WorkbenchContributionError;
}

export interface WorkbenchWebviewMessageEnvelope {
  readonly panelInstanceKey: string;
  readonly message: JsonValue;
}

export interface DeliverWorkbenchWebviewMessageRequest {
  readonly panelInstanceKey: string;
  readonly message: JsonValue;
}

export interface DisposeWorkbenchWebviewPanelRequest {
  readonly panelInstanceKey: string;
}

export interface WorkbenchWebviewMutationResponse {
  readonly success: boolean;
  readonly error?: WorkbenchContributionError;
}
