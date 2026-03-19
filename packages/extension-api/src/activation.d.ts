/**
 * 插件激活事件的公共导出与辅助方法。
 */
import type { ExtensionActivationEvent } from '@note-studio/shared';
export type { ExtensionActivationEvent } from '@note-studio/shared';
export declare function createCommandActivationEvent(commandId: string): ExtensionActivationEvent;
export declare function createViewActivationEvent(viewId: string): ExtensionActivationEvent;
export declare function createSettingActivationEvent(settingKey: string): ExtensionActivationEvent;
//# sourceMappingURL=activation.d.ts.map