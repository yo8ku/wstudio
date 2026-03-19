/**
 * 插件系统共享的能力、权限和生命周期类型定义。
 */
export declare const EXTENSION_PERMISSIONS: readonly ["storage", "workspace.read", "workspace.write", "workspace.search", "notes.read", "notes.write", "editor.read", "editor.write", "network", "ai.invoke", "webview", "shell.openExternal"];
export type ExtensionPermission = (typeof EXTENSION_PERMISSIONS)[number];
export declare const EXTENSION_CAPABILITIES: readonly ["commands.register", "commands.execute", "window.notifications", "workspace.read", "workspace.write", "workspace.search", "notes.read", "notes.write", "editor.read", "editor.write", "storage", "webview", "network", "ai.invoke", "ai.tool.execute", "shell.openExternal"];
export type ExtensionCapability = (typeof EXTENSION_CAPABILITIES)[number];
export declare const EXTENSION_LIFECYCLE_STATES: readonly ["discovered", "registered", "resolved", "activating", "active", "deactivating", "inactive", "failed"];
export type ExtensionLifecycleState = (typeof EXTENSION_LIFECYCLE_STATES)[number];
export declare const EXTENSION_PLATFORM_VERSION = "2.0.0";
export type ExtensionActivationEvent = 'onStartupFinished' | `onCommand:${string}` | `onAiPanelCommand:${string}` | `onAiPanelSkill:${string}` | `onView:${string}` | `onLanguage:${string}` | `onSetting:${string}` | `workspaceContains:${string}` | `onUri:${string}`;
export declare const EXTENSION_RUNTIME_KINDS: readonly ["isolated-host"];
export type ExtensionRuntimeKind = (typeof EXTENSION_RUNTIME_KINDS)[number];
//# sourceMappingURL=extension.d.ts.map