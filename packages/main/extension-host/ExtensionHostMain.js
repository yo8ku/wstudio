"use strict";
/**
 * 扩展宿主进程主类
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionHostMain = void 0;
const MessageHandler_1 = require("./MessageHandler");
const APIImplementation_1 = require("./APIImplementation");
class ExtensionHostMain {
    constructor() {
        this.api = new APIImplementation_1.APIImplementation();
        this.messageHandler = new MessageHandler_1.MessageHandler(this.api);
    }
    async initialize() {
        console.log('[ExtensionHostMain] 初始化扩展宿主进程');
    }
    handleMessage(message) {
        this.messageHandler.handle(message);
    }
    sendMessage(message) {
        if (process.send) {
            process.send(message);
        }
    }
}
exports.ExtensionHostMain = ExtensionHostMain;
//# sourceMappingURL=ExtensionHostMain.js.map