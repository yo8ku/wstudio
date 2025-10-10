/**
 * Webview API 桥接
 */
export declare const apiBridge: {
    postMessage(message: any): void;
    onMessage(handler: (message: any) => void): void;
    getState(): any;
    setState(state: any): void;
};
//# sourceMappingURL=api-bridge.d.ts.map