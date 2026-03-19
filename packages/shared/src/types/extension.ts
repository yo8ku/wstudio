/**
 * 插件系统共享的能力、权限和生命周期类型定义。
 */

export const EXTENSION_PERMISSIONS = [
  'storage',
  'workspace.read',
  'workspace.write',
  'workspace.search',
  'notes.read',
  'notes.write',
  'editor.read',
  'editor.write',
  'network',
  'ai.invoke',
  'webview',
  'shell.openExternal',
] as const;

export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];

export const EXTENSION_CAPABILITIES = [
  'commands.register',
  'commands.execute',
  'window.notifications',
  'workspace.read',
  'workspace.write',
  'workspace.search',
  'notes.read',
  'notes.write',
  'editor.read',
  'editor.write',
  'storage',
  'settings',
  'webview',
  'network',
  'ai.invoke',
  'ai.tool.execute',
  'shell.openExternal',
] as const;

export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];

export const EXTENSION_LIFECYCLE_STATES = [
  'discovered',
  'registered',
  'resolved',
  'activating',
  'active',
  'deactivating',
  'inactive',
  'failed',
] as const;

export type ExtensionLifecycleState = (typeof EXTENSION_LIFECYCLE_STATES)[number];

export const EXTENSION_PLATFORM_VERSION = '2.0.0';

export type ExtensionActivationEvent =
  | 'onStartupFinished'
  | `onCommand:${string}`
  | `onAiPanelCommand:${string}`
  | `onAiPanelSkill:${string}`
  | `onView:${string}`
  | `onLanguage:${string}`
  | `onSetting:${string}`
  | `workspaceContains:${string}`
  | `onUri:${string}`;

export const EXTENSION_RUNTIME_KINDS = ['isolated-host'] as const;

export type ExtensionRuntimeKind = (typeof EXTENSION_RUNTIME_KINDS)[number];
