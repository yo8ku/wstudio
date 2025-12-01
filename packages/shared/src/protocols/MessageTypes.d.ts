/**
 * 消息类型定义
 */
export interface CommandMessage {
    command: string;
    args: any[];
}
export interface EventMessage {
    event: string;
    data: any;
}
export interface ResponseMessage {
    requestId: string;
    success: boolean;
    data?: any;
    error?: string;
}
export interface ErrorMessage {
    code: string;
    message: string;
    stack?: string;
}
//# sourceMappingURL=MessageTypes.d.ts.map