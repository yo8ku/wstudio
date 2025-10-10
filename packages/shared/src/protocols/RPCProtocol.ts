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

export class RPCProtocol {
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = new Map();

  private requestId = 0;

  async call(method: string, ...params: any[]): Promise<any> {
    const id = (++this.requestId).toString();
    const request: RPCRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.send(request);
    });
  }

  handleResponse(response: RPCResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  protected send(request: RPCRequest): void {
    // 子类实现具体的发送逻辑
    console.log('[RPCProtocol] 发送请求:', request);
  }
}



