"use strict";
/**
 * Webview 预加载脚本
 */
Object.defineProperty(exports, "__esModule", { value: true });
const api_bridge_1 = require("./api-bridge");
// 将 API 注入到 webview 上下文
window.vscode = api_bridge_1.apiBridge;
//# sourceMappingURL=preload.js.map