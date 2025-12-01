"use strict";
/**
 * 共享模块统一导出
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
exports.EventEmitter = void 0;
__exportStar(require("./protocols/ExtensionProtocol"), exports);
__exportStar(require("./protocols/MessageTypes"), exports);
__exportStar(require("./protocols/RPCProtocol"), exports);
__exportStar(require("./types/vscode-types"), exports);
__exportStar(require("./types/extension-manifest"), exports);
__exportStar(require("./types/snippet"), exports);
__exportStar(require("./types/theme"), exports);
// 工具类
var EventEmitter_1 = require("./utils/EventEmitter");
Object.defineProperty(exports, "EventEmitter", { enumerable: true, get: function () { return EventEmitter_1.EventEmitter; } });
//# sourceMappingURL=index.js.map