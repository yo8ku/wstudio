/**
 * 扩展通信协议
 */
export declare enum ExtensionMessageType {
    Activate = "activate",
    Deactivate = "deactivate",
    ExecuteCommand = "executeCommand",
    RegisterCommand = "registerCommand",
    VSCodeAPICall = "vscode-api-call",
    VSCodeAPIResponse = "vscode-api-response",
    Event = "event",
    Response = "response",
    Error = "error"
}
export interface ExtensionMessage {
    id: string;
    type: ExtensionMessageType;
    extensionId?: string;
    payload: any;
    timestamp: number;
}
/**
 * VSCode API 调用消息接口
 */
export interface IVSCodeAPICall {
    namespace: string;
    method: string;
    args: any[];
    requestId: string;
}
/**
 * 扩展宿主消息接口
 */
export interface IExtensionHostMessage {
    type: ExtensionMessageType | string;
    payload?: any;
    extensionId?: string;
    requestId?: string;
}
export declare class ExtensionProtocol {
    static createMessage(type: ExtensionMessageType, payload: any, extensionId?: string): ExtensionMessage;
    static createAPICallMessage(namespace: string, method: string, args?: any[]): IExtensionHostMessage;
    static generateId(): string;
}
//# sourceMappingURL=ExtensionProtocol.d.ts.map