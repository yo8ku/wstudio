"use strict";
/**
 * 插件系统 - 存储类型定义
 * 定义存储系统的接口、存储类型等
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageScope = void 0;
/**
 * 存储范围
 */
var StorageScope;
(function (StorageScope) {
    /** 全局存储 */
    StorageScope["Global"] = "global";
    /** 工作区存储 */
    StorageScope["Workspace"] = "workspace";
    /** 插件存储 */
    StorageScope["Plugin"] = "plugin";
})(StorageScope || (exports.StorageScope = StorageScope = {}));
//# sourceMappingURL=storage.js.map