/**
 * RPC 通信协议
 */
export interface RPCRequest {
    id: string;
    method: string;
    params: any[];
}
export interface RPCResponse {
    id: string;
    result?: any;
    error?: {
        code: number;
        message: string;
    };
}
export declare class RPCProtocol {
    private pendingRequests;
    private requestId;
    call(method: string, ...params: any[]): Promise<any>;
    handleResponse(response: RPCResponse): void;
    protected send(request: RPCRequest): void;
}
//# sourceMappingURL=RPCProtocol.d.ts.map