/**
 * 消息处理器
 */

import { APIImplementation } from './APIImplementation';
import { ExtensionHostMain } from './ExtensionHostMain';

export class MessageHandler {
  constructor(
    private api: APIImplementation,
    private extensionHost?: ExtensionHostMain
  ) {}

  handle(message: any): void {
    const { type, payload } = message;

    switch (type) {
      case 'activateExtension':
        this.handleActivateExtension(payload);
        break;
      case 'deactivateExtension':
        this.handleDeactivateExtension(payload);
        break;
      case 'executeCommand':
        this.handleExecuteCommand(payload);
        break;
      case 'getActiveExtensions':
        this.handleGetActiveExtensions();
        break;
      default:
        console.warn(`[MessageHandler] 未知消息类型: ${type}`);
    }
  }

  /**
   * 设置扩展宿主引用
   */
  setExtensionHost(extensionHost: ExtensionHostMain): void {
    this.extensionHost = extensionHost;
  }

  private async handleActivateExtension(payload: any): Promise<void> {
    const { extensionPath } = payload;
    
    if (!extensionPath) {
      console.error('[MessageHandler] 缺少 extensionPath 参数');
      return;
    }

    try {
      if (this.extensionHost) {
        await this.extensionHost.activateExtension(extensionPath);
        
        // 发送激活成功消息
        this.sendResponse({
          type: 'extensionActivated',
          payload: { extensionPath, success: true }
        });
      } else {
        console.error('[MessageHandler] ExtensionHost 未初始化');
      }
    } catch (error) {
      console.error('[MessageHandler] 激活扩展失败:', error);
      
      // 发送激活失败消息
      this.sendResponse({
        type: 'extensionActivated',
        payload: { 
          extensionPath, 
          success: false, 
          error: (error as Error).message 
        }
      });
    }
  }

  private async handleDeactivateExtension(payload: any): Promise<void> {
    const { extensionName } = payload;
    
    if (!extensionName) {
      console.error('[MessageHandler] 缺少 extensionName 参数');
      return;
    }

    try {
      if (this.extensionHost) {
        await this.extensionHost.deactivateExtension(extensionName);
        
        // 发送停用成功消息
        this.sendResponse({
          type: 'extensionDeactivated',
          payload: { extensionName, success: true }
        });
      }
    } catch (error) {
      console.error('[MessageHandler] 停用扩展失败:', error);
      
      // 发送停用失败消息
      this.sendResponse({
        type: 'extensionDeactivated',
        payload: { 
          extensionName, 
          success: false, 
          error: (error as Error).message 
        }
      });
    }
  }

  private async handleExecuteCommand(payload: any): Promise<void> {
    const { command, args } = payload;
    
    try {
      const result = await this.api.executeCommand(command, ...args);
      
      // 发送命令执行结果
      this.sendResponse({
        type: 'commandExecuted',
        payload: { command, success: true, result }
      });
    } catch (error) {
      console.error('[MessageHandler] 执行命令失败:', error);
      
      this.sendResponse({
        type: 'commandExecuted',
        payload: { 
          command, 
          success: false, 
          error: (error as Error).message 
        }
      });
    }
  }

  private handleGetActiveExtensions(): void {
    if (this.extensionHost) {
      const activeExtensions = this.extensionHost.getActiveExtensions();
      
      this.sendResponse({
        type: 'activeExtensions',
        payload: { extensions: activeExtensions }
      });
    }
  }

  /**
   * 发送响应消息到主进程
   */
  private sendResponse(message: any): void {
    if (process.send) {
      process.send(message);
    }
  }
}



