"use strict";
/**
 * 扩展通信协议
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionProtocol = exports.ExtensionMessageType = void 0;
var ExtensionMessageType;
(function (ExtensionMessageType) {
    ExtensionMessageType["Activate"] = "activate";
    ExtensionMessageType["Deactivate"] = "deactivate";
    ExtensionMessageType["ExecuteCommand"] = "executeCommand";
    ExtensionMessageType["RegisterCommand"] = "registerCommand";
    ExtensionMessageType["VSCodeAPICall"] = "vscode-api-call";
    ExtensionMessageType["VSCodeAPIResponse"] = "vscode-api-response";
    ExtensionMessageType["Event"] = "event";
    ExtensionMessageType["Response"] = "response";
    ExtensionMessageType["Error"] = "error";
})(ExtensionMessageType || (exports.ExtensionMessageType = ExtensionMessageType = {}));
class ExtensionProtocol {
    static createMessage(type, payload, extensionId) {
        return {
            id: this.generateId(),
            type,
            extensionId,
            payload,
            timestamp: Date.now()
        };
    }
    static createAPICallMessage(namespace, method, args = []) {
        const requestId = this.generateId();
        return {
            type: ExtensionMessageType.VSCodeAPICall,
            payload: {
                namespace,
                method,
                args,
                requestId
            }
        };
    }
    static generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.ExtensionProtocol = ExtensionProtocol;
//# sourceMappingURL=ExtensionProtocol.js.map