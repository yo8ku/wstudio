/**
 * 扩展通信协议
 */

export enum ExtensionMessageType {
  Activate = 'activate',
  Deactivate = 'deactivate',
  ExecuteCommand = 'executeCommand',
  RegisterCommand = 'registerCommand',
  VSCodeAPICall = 'vscode-api-call',
  VSCodeAPIResponse = 'vscode-api-response',
  Event = 'event',
  Response = 'response',
  Error = 'error'
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
  namespace: string;  // 例如: 'window', 'workspace'
  method: string;      // 例如: 'showInformationMessage'
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

export class ExtensionProtocol {
  static createMessage(
    type: ExtensionMessageType,
    payload: any,
    extensionId?: string
  ): ExtensionMessage {
    return {
      id: this.generateId(),
      type,
      extensionId,
      payload,
      timestamp: Date.now()
    };
  }

  static createAPICallMessage(
    namespace: string,
    method: string,
    args: any[] = []
  ): IExtensionHostMessage {
    const requestId = this.generateId();
    return {
      type: ExtensionMessageType.VSCodeAPICall,
      payload: {
        namespace,
        method,
        args,
        requestId
      } as IVSCodeAPICall
    };
  }

  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}



