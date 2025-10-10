/**
 * VSCode Environment API
 */

import { Thenable } from './types';

export namespace env {
  /**
   * 应用程序名称
   */
  export const appName: string = 'Note Studio';

  /**
   * 应用程序根目录
   */
  export const appRoot: string = '';

  /**
   * 语言
   */
  export const language: string = 'zh-CN';

  /**
   * 剪贴板
   */
  export const clipboard: any = {
    readText: (): Thenable<string> => {
      console.log(`[Env] 读取剪贴板文本`);
      return Promise.resolve('');
    },
    writeText: (value: string): Thenable<void> => {
      console.log(`[Env] 写入剪贴板文本: ${value}`);
      return Promise.resolve();
    }
  };

  /**
   * 机器标识符
   */
  export const machineId: string = 'note-studio-machine';

  /**
   * 会话标识符
   */
  export const sessionId: string = 'note-studio-session';

  /**
   * 外壳
   */
  export const shell: string = typeof process !== 'undefined' && process.platform === 'win32' ? 'powershell.exe' : 'bash';

  /**
   * 远程名称
   */
  export const remoteName: string | undefined = undefined;

  /**
   * 远程环境
   */
  export const remoteAuthority: string | undefined = undefined;

  /**
   * UI 类型
   */
  export const uiKind: any = {
    Desktop: 1,
    Web: 2
  };

  /**
   * 打开外部链接
   */
  export function openExternal(target: any): Thenable<boolean> {
    console.log(`[Env] 打开外部链接: ${target}`);
    return Promise.resolve(true);
  }

  /**
   * 异步打开外部链接
   */
  export function asExternalUri(target: any): Thenable<any> {
    console.log(`[Env] 异步打开外部链接: ${target}`);
    return Promise.resolve(target);
  }
}