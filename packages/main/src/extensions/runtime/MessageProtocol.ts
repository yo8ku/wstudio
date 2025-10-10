/**
 * 消息协议 - 主进程和扩展宿主进程之间的通信
 */

export enum MessageType {
  ActivateExtension = 'activateExtension',
  DeactivateExtension = 'deactivateExtension',
  ExecuteCommand = 'executeCommand',
  Response = 'response',
  Error = 'error'
}

export interface Message {
  id: string;
  type: MessageType;
  payload: any;
}

export class MessageProtocol {
  private messageHandlers: Map<MessageType, (payload: any) => void> = new Map();
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();

  on(type: MessageType, handler: (payload: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  send(type: MessageType, payload: any): string {
    const id = this.generateId();
    const message: Message = { id, type, payload };
    
    // 实际应该通过进程通信发送
    console.log('[MessageProtocol] 发送消息:', message);
    
    return id;
  }

  async request<T>(type: MessageType, payload: any): Promise<T> {
    const id = this.send(type, payload);
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }

  handleMessage(message: Message): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.payload);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}



