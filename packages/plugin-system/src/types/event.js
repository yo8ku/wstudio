"use strict";
/**
 * 插件系统 - 事件类型定义
 * 定义事件系统的接口、事件类型等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemEvent = exports.EventPriority = void 0;
/**
 * 事件优先级
 */
var EventPriority;
(function (EventPriority) {
    /** 最高优先级 */
    EventPriority[EventPriority["Highest"] = 1000] = "Highest";
    /** 高优先级 */
    EventPriority[EventPriority["High"] = 750] = "High";
    /** 普通优先级 */
    EventPriority[EventPriority["Normal"] = 500] = "Normal";
    /** 低优先级 */
    EventPriority[EventPriority["Low"] = 250] = "Low";
    /** 最低优先级 */
    EventPriority[EventPriority["Lowest"] = 0] = "Lowest";
})(EventPriority || (exports.EventPriority = EventPriority = {}));
/**
 * 系统事件类型
 */
var SystemEvent;
(function (SystemEvent) {
    /** 插件加载 */
    SystemEvent["PluginLoaded"] = "plugin:loaded";
    /** 插件激活 */
    SystemEvent["PluginActivated"] = "plugin:activated";
    /** 插件停用 */
    SystemEvent["PluginDeactivated"] = "plugin:deactivated";
    /** 插件错误 */
    SystemEvent["PluginError"] = "plugin:error";
    /** 应用启动 */
    SystemEvent["AppReady"] = "app:ready";
    /** 应用关闭 */
    SystemEvent["AppClose"] = "app:close";
})(SystemEvent || (exports.SystemEvent = SystemEvent = {}));
//# sourceMappingURL=event.js.map