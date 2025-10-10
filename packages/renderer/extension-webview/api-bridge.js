"use strict";
/**
 * Webview API 桥接
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiBridge = void 0;
exports.apiBridge = {
    postMessage(message) {
        window.parent.postMessage(message, '*');
    },
    onMessage(handler) {
        window.addEventListener('message', (event) => {
            handler(event.data);
        });
    },
    getState() {
        return window.__vscodeState || {};
    },
    setState(state) {
        window.__vscodeState = state;
    }
};
//# sourceMappingURL=api-bridge.js.map