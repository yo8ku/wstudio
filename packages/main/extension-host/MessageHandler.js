"use strict";
/**
 * 消息处理器
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageHandler = void 0;
class MessageHandler {
    constructor(api) {
        this.api = api;
    }
    handle(message) {
        const { type, payload } = message;
        switch (type) {
            case 'activateExtension':
                this.handleActivateExtension(payload);
                break;
            case 'executeCommand':
                this.handleExecuteCommand(payload);
                break;
            default:
                console.warn(`[MessageHandler] 未知消息类型: ${type}`);
        }
    }
    async handleActivateExtension(payload) {
        console.log('[MessageHandler] 激活扩展:', payload);
    }
    async handleExecuteCommand(payload) {
        const { command, args } = payload;
        await this.api.executeCommand(command, ...args);
    }
}
exports.MessageHandler = MessageHandler;
//# sourceMappingURL=MessageHandler.js.map