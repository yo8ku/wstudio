/**
 * VSCode Authentication API
 */

import { Disposable, Event, Thenable } from './types';

export namespace authentication {
  /**
   * 注册认证提供程序
   */
  export function registerAuthenticationProvider(id: string, label: string, provider: any): Disposable {
    console.log(`[Authentication] 注册认证提供程序: ${id} - ${label}`);
    return {
      dispose: () => {
        console.log(`[Authentication] 注销认证提供程序: ${id}`);
      }
    };
  }

  /**
   * 获取会话
   */
  export function getSession(providerId: string, scopes: string[], options?: any): Thenable<any> {
    console.log(`[Authentication] 获取会话: ${providerId}`);
    return Promise.resolve(undefined);
  }

  /**
   * 登录
   */
  export function login(providerId: string, scopes: string[], options?: any): Thenable<any> {
    console.log(`[Authentication] 登录: ${providerId}`);
    return Promise.resolve(undefined);
  }

  /**
   * 登出
   */
  export function logout(providerId: string, accountId: string): Thenable<void> {
    console.log(`[Authentication] 登出: ${providerId} - ${accountId}`);
    return Promise.resolve();
  }

  /**
   * 会话变化事件
   */
  export const onDidChangeSessions: Event<any> = () => ({
    dispose: () => {}
  });
}