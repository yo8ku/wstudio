"use strict";
/**
 * RPC 通信协议
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RPCProtocol = void 0;
class RPCProtocol {
    constructor() {
        this.pendingRequests = new Map();
        this.requestId = 0;
    }
    async call(method, ...params) {
        const id = (++this.requestId).toString();
        const request = { id, method, params };
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.send(request);
        });
    }
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.id);
        if (!pending)
            return;
        this.pendingRequests.delete(response.id);
        if (response.error) {
            pending.reject(new Error(response.error.message));
        }
        else {
            pending.resolve(response.result);
        }
    }
    send(request) {
        // 子类实现具体的发送逻辑
        console.log('[RPCProtocol] 发送请求:', request);
    }
}
exports.RPCProtocol = RPCProtocol;
//# sourceMappingURL=RPCProtocol.js.map