"use strict";
/**
 * 插件系统 - 插件类型定义
 * 定义插件的基础接口、元数据、生命周期等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginState = void 0;
/**
 * 插件状态
 */
var PluginState;
(function (PluginState) {
    /** 未加载 */
    PluginState["Unloaded"] = "unloaded";
    /** 加载中 */
    PluginState["Loading"] = "loading";
    /** 已加载 */
    PluginState["Loaded"] = "loaded";
    /** 激活中 */
    PluginState["Activating"] = "activating";
    /** 已激活 */
    PluginState["Activated"] = "activated";
    /** 停用中 */
    PluginState["Deactivating"] = "deactivating";
    /** 已停用 */
    PluginState["Deactivated"] = "deactivated";
    /** 错误 */
    PluginState["Error"] = "error";
})(PluginState || (exports.PluginState = PluginState = {}));
//# sourceMappingURL=plugin.js.map