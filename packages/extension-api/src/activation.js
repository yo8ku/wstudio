"use strict";
/**
 * 插件激活事件的公共导出与辅助方法。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCommandActivationEvent = createCommandActivationEvent;
exports.createViewActivationEvent = createViewActivationEvent;
exports.createSettingActivationEvent = createSettingActivationEvent;
function createCommandActivationEvent(commandId) {
    return `onCommand:${commandId}`;
}
function createViewActivationEvent(viewId) {
    return `onView:${viewId}`;
}
function createSettingActivationEvent(settingKey) {
    return `onSetting:${settingKey}`;
}
//# sourceMappingURL=activation.js.map