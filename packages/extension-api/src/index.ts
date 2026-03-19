/**
 * Note Studio 插件系统对外 SDK 统一导出。
 */

export * from './activation';
export * from './contributes';
export * from './context';
export * from './manifest';
export * from './permissions';
export * from './plugin';

export type {
  ExtensionActivationEvent,
  ExtensionCapability,
  ExtensionLifecycleState,
  ExtensionPermission,
  ExtensionRuntimeKind,
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  WorkbenchEditorMenuContext,
  WorkbenchMenuContext,
  WorkbenchNoteMenuContext,
  WorkbenchSidebarTitleMenuContext,
  WorkbenchTextRange,
} from '@note-studio/shared';

export {
  EXTENSION_CAPABILITIES,
  EXTENSION_LIFECYCLE_STATES,
  EXTENSION_PERMISSIONS,
  EXTENSION_PLATFORM_VERSION,
  EXTENSION_RUNTIME_KINDS,
} from '@note-studio/shared';
