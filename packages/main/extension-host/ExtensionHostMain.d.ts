/**
 * 扩展宿主进程主类
 */
export declare class ExtensionHostMain {
    private messageHandler;
    private api;
    constructor();
    initialize(): Promise<void>;
    handleMessage(message: any): void;
    sendMessage(message: any): void;
}
//# sourceMappingURL=ExtensionHostMain.d.ts.map