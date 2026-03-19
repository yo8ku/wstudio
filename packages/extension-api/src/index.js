"use strict";
/**
 * Note Studio 插件系统对外 SDK 统一导出。
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
exports.EXTENSION_RUNTIME_KINDS = exports.EXTENSION_PLATFORM_VERSION = exports.EXTENSION_PERMISSIONS = exports.EXTENSION_LIFECYCLE_STATES = exports.EXTENSION_CAPABILITIES = void 0;
__exportStar(require("./activation"), exports);
__exportStar(require("./contributes"), exports);
__exportStar(require("./context"), exports);
__exportStar(require("./manifest"), exports);
__exportStar(require("./permissions"), exports);
__exportStar(require("./plugin"), exports);
var shared_1 = require("@note-studio/shared");
Object.defineProperty(exports, "EXTENSION_CAPABILITIES", { enumerable: true, get: function () { return shared_1.EXTENSION_CAPABILITIES; } });
Object.defineProperty(exports, "EXTENSION_LIFECYCLE_STATES", { enumerable: true, get: function () { return shared_1.EXTENSION_LIFECYCLE_STATES; } });
Object.defineProperty(exports, "EXTENSION_PERMISSIONS", { enumerable: true, get: function () { return shared_1.EXTENSION_PERMISSIONS; } });
Object.defineProperty(exports, "EXTENSION_PLATFORM_VERSION", { enumerable: true, get: function () { return shared_1.EXTENSION_PLATFORM_VERSION; } });
Object.defineProperty(exports, "EXTENSION_RUNTIME_KINDS", { enumerable: true, get: function () { return shared_1.EXTENSION_RUNTIME_KINDS; } });
//# sourceMappingURL=index.js.map