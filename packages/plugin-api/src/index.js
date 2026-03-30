"use strict";
/**
 * 插件 API 模块统一导出。
 * 仅包含公共契约与轻量辅助工具，不包含宿主实现。
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./app/PluginApp"), exports);
__exportStar(require("./helpers/definePlugin"), exports);
__exportStar(require("./types/app"), exports);
__exportStar(require("./types/json"), exports);
__exportStar(require("./types/plugin"), exports);
__exportStar(require("./utils/PluginCleanupStore"), exports);
