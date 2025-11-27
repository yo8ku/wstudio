/**
 * 扩展宿主进程管理器
 * ⭐ 为 VSCode 扩展创建隔离的运行环境，支持多进程管理和 IPC 通信
 */

import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import { IExtensionHostMessage, ExtensionMessageType } from '@note-studio/shared';
import { EventEmitter } from 'events';

/**
 * 扩展宿主信息
 */
interface ExtensionHostInfo {
  process: ChildProcess;
  extensionId: string;
  pendingRequests: Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>;
  isReady: boolean;
}

/**
 * VSCode API 调用处理器类型
 */
type APICallHandler = (namespace: string, method: string, args: any[]) => Promise<any>;

export class ExtensionHostManager extends EventEmitter {
  private extensionHosts: Map<string, ExtensionHostInfo> = new Map();
  private apiCallHandler?: APICallHandler;
  
  constructor() {
    super();
  }

  /**
   * 设置 API 调用处理器
   */
  setAPICallHandler(handler: APICallHandler): void {
    this.apiCallHandler = handler;
  }

  /**
   * ⭐ 为 VSCode 扩展创建隔离的运行环境
   */
  async startExtensionHost(extensionId: string, extensionPath?: string): Promise<void> {
    console.log(`[ExtensionHostManager] 启动扩展宿主进程: ${extensionId}`);

    // 检查是否已经存在
    if (this.extensionHosts.has(extensionId)) {
      console.warn(`[ExtensionHostManager] 扩展宿主已存在: ${extensionId}`);
      return;
    }

    // 创建子进程
    const hostProcess = fork(
      path.join(__dirname, '../../extension-host/index.js'),
      ['--extension-id', extensionId],
      {
        env: {
          ...process.env,
          // ⭐ 设置 VSCode 兼容环境变量
          VSCODE_NLS_CONFIG: JSON.stringify({ locale: 'zh-cn' }),
          VSCODE_PID: process.pid.toString(),
          EXTENSION_HOST_ID: extensionId,
        },
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      }
    );

    // 存储宿主信息
    const hostInfo: ExtensionHostInfo = {
      process: hostProcess,
      extensionId,
      pendingRequests: new Map(),
      isReady: false,
    };

    this.extensionHosts.set(extensionId, hostInfo);

    // 建立 IPC 通信
    this.setupIPCCommunication(hostInfo);

    // 等待宿主进程就绪
    await this.waitForHostReady(extensionId);

    // 如果提供了扩展路径，激活扩展
    if (extensionPath) {
      await this.activateExtension(extensionId, extensionPath);
    }

    console.log(`[ExtensionHostManager] 扩展宿主启动成功: ${extensionId}`);
  }

  /**
   * 设置主进程与扩展宿主的通信
   */
  private setupIPCCommunication(hostInfo: ExtensionHostInfo): void {
    const { process: hostProcess, extensionId } = hostInfo;

    hostProcess.on('message', async (msg: IExtensionHostMessage) => {
      console.log(`[ExtensionHostManager] 收到消息 [${extensionId}]:`, msg.type);

      switch (msg.type) {
        case 'ready':
          // 宿主进程就绪
          hostInfo.isReady = true;
          this.emit('host-ready', extensionId);
          break;

        case ExtensionMessageType.VSCodeAPICall:
        case 'vscode-api-call':
          // ⭐ 转发 VSCode API 调用
          await this.handleVSCodeAPICall(hostInfo, msg);
          break;

        case ExtensionMessageType.Response:
        case 'response':
          // 处理响应消息
          this.handleResponse(hostInfo, msg);
          break;

        case ExtensionMessageType.Event:
        case 'event':
          // 转发事件
          this.emit('extension-event', {
            extensionId,
            event: msg.payload?.event,
            data: msg.payload?.data,
          });
          break;

        case ExtensionMessageType.Error:
        case 'error':
          // 处理错误
          console.error(`[ExtensionHostManager] 扩展错误 [${extensionId}]:`, msg.payload);
          this.emit('extension-error', {
            extensionId,
            error: msg.payload,
          });
          break;

        default:
          console.warn(`[ExtensionHostManager] 未知消息类型: ${msg.type}`);
      }
    });

    hostProcess.on('exit', (code, signal) => {
      console.log(`[ExtensionHostManager] 扩展宿主进程退出 [${extensionId}], 代码: ${code}, 信号: ${signal}`);
      
      // 清理挂起的请求
      const pending = hostInfo.pendingRequests;
      pending.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error(`扩展宿主进程已退出 (代码: ${code})`));
      });
      pending.clear();

      // 移除宿主信息
      this.extensionHosts.delete(extensionId);
      
      this.emit('host-exit', { extensionId, code, signal });
    });

    hostProcess.on('error', (error) => {
      console.error(`[ExtensionHostManager] 扩展宿主进程错误 [${extensionId}]:`, error);
      this.emit('host-error', { extensionId, error });
    });
  }

  /**
   * ⭐ 处理 VSCode API 调用
   */
  private async handleVSCodeAPICall(
    hostInfo: ExtensionHostInfo,
    msg: IExtensionHostMessage
  ): Promise<void> {
    const { namespace, method, args, requestId } = msg.payload || {};

    try {
      console.log(`[ExtensionHostManager] VSCode API 调用: ${namespace}.${method}`);

      // 调用 API 处理器
      let result: any;
      if (this.apiCallHandler) {
        result = await this.apiCallHandler(namespace, method, args || []);
      } else {
        throw new Error('API 调用处理器未设置');
      }

      // 发送响应
      this.sendMessage(hostInfo.extensionId, {
        type: ExtensionMessageType.VSCodeAPIResponse,
        requestId,
        payload: {
          success: true,
          result,
        },
      });
    } catch (error) {
      console.error(`[ExtensionHostManager] API 调用失败:`, error);

      // 发送错误响应
      this.sendMessage(hostInfo.extensionId, {
        type: ExtensionMessageType.VSCodeAPIResponse,
        requestId,
        payload: {
          success: false,
          error: (error as Error).message,
        },
      });
    }
  }

  /**
   * 处理响应消息
   */
  private handleResponse(hostInfo: ExtensionHostInfo, msg: IExtensionHostMessage): void {
    const { requestId } = msg;
    if (!requestId) return;

    const pending = hostInfo.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      
      if (msg.payload?.success) {
        pending.resolve(msg.payload.result);
      } else {
        pending.reject(new Error(msg.payload?.error || '未知错误'));
      }
      
      hostInfo.pendingRequests.delete(requestId);
    }
  }

  /**
   * 激活扩展
   */
  async activateExtension(extensionId: string, extensionPath: string): Promise<void> {
    const hostInfo = this.extensionHosts.get(extensionId);
    if (!hostInfo) {
      throw new Error(`扩展宿主不存在: ${extensionId}`);
    }

    if (!hostInfo.isReady) {
      await this.waitForHostReady(extensionId);
    }

    return this.sendRequest(extensionId, {
      type: ExtensionMessageType.Activate,
      payload: { extensionPath },
    });
  }

  /**
   * 停用扩展
   */
  async deactivateExtension(extensionId: string): Promise<void> {
    const hostInfo = this.extensionHosts.get(extensionId);
    if (!hostInfo) {
      throw new Error(`扩展宿主不存在: ${extensionId}`);
    }

    return this.sendRequest(extensionId, {
      type: ExtensionMessageType.Deactivate,
      payload: {},
    });
  }

  /**
   * 发送请求并等待响应
   */
  private sendRequest<T = any>(
    extensionId: string,
    message: Omit<IExtensionHostMessage, 'requestId'>,
    timeout: number = 30000
  ): Promise<T> {
    const hostInfo = this.extensionHosts.get(extensionId);
    if (!hostInfo) {
      return Promise.reject(new Error(`扩展宿主不存在: ${extensionId}`));
    }

    const requestId = this.generateRequestId();
    const fullMessage: IExtensionHostMessage = {
      ...message,
      requestId,
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        hostInfo.pendingRequests.delete(requestId);
        reject(new Error(`请求超时: ${message.type}`));
      }, timeout);

      hostInfo.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      hostInfo.process.send(fullMessage);
    });
  }

  /**
   * 发送消息（不等待响应）
   */
  private sendMessage(extensionId: string, message: IExtensionHostMessage): void {
    const hostInfo = this.extensionHosts.get(extensionId);
    if (hostInfo) {
      hostInfo.process.send(message);
    }
  }

  /**
   * 等待宿主进程就绪
   */
  private waitForHostReady(extensionId: string, timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const hostInfo = this.extensionHosts.get(extensionId);
      if (!hostInfo) {
        return reject(new Error(`扩展宿主不存在: ${extensionId}`));
      }

      if (hostInfo.isReady) {
        return resolve();
      }

      const timeoutHandle = setTimeout(() => {
        this.off('host-ready', readyHandler);
        reject(new Error(`等待扩展宿主就绪超时: ${extensionId}`));
      }, timeout);

      const readyHandler = (readyExtensionId: string) => {
        if (readyExtensionId === extensionId) {
          clearTimeout(timeoutHandle);
          this.off('host-ready', readyHandler);
          resolve();
        }
      };

      this.on('host-ready', readyHandler);
    });
  }

  /**
   * 终止扩展宿主进程
   */
  async terminateHost(extensionId: string): Promise<void> {
    const hostInfo = this.extensionHosts.get(extensionId);
    if (!hostInfo) {
      console.warn(`[ExtensionHostManager] 扩展宿主不存在: ${extensionId}`);
      return;
    }

    console.log(`[ExtensionHostManager] 终止扩展宿主进程: ${extensionId}`);

    // 尝试优雅关闭
    try {
      await this.deactivateExtension(extensionId);
    } catch (error) {
      console.error(`[ExtensionHostManager] 停用扩展失败:`, error);
    }

    // 终止进程
    hostInfo.process.kill();
    this.extensionHosts.delete(extensionId);
  }

  /**
   * 终止所有扩展宿主进程
   */
  async terminateAll(): Promise<void> {
    console.log('[ExtensionHostManager] 终止所有扩展宿主进程');

    const terminatePromises = Array.from(this.extensionHosts.keys()).map(
      (extensionId) => this.terminateHost(extensionId)
    );

    await Promise.all(terminatePromises);
  }

  /**
   * 获取所有活动的扩展宿主
   */
  getActiveHosts(): string[] {
    return Array.from(this.extensionHosts.keys());
  }

  /**
   * 检查扩展宿主是否存在
   */
  hasHost(extensionId: string): boolean {
    return this.extensionHosts.has(extensionId);
  }

  /**
   * 生成请求 ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}



