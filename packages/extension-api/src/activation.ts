/**
 * 插件激活事件的公共导出与辅助方法。
 */

import type { ExtensionActivationEvent } from '@note-studio/shared';

export type { ExtensionActivationEvent } from '@note-studio/shared';

export function createCommandActivationEvent(commandId: string): ExtensionActivationEvent {
  return `onCommand:${commandId}`;
}

export function createViewActivationEvent(viewId: string): ExtensionActivationEvent {
  return `onView:${viewId}`;
}

export function createSettingActivationEvent(settingKey: string): ExtensionActivationEvent {
  return `onSetting:${settingKey}`;
}
