/**
 * VSCode Extensions API
 */

import { EventEmitter } from './event-emitter';
import { Disposable, Event, Extension, ExtensionContext } from './types';

export namespace extensions {
  const allExtensions: Extension<any>[] = [];
  const eventEmitter = new EventEmitter();

  /**
   * 所有扩展
   */
  export function getAll(): Extension<any>[] {
    return allExtensions;
  }

  /**
   * 扩展变化事件
   */
  export const onDidChange: Event<void> = (listener) => {
    eventEmitter.on('extensionsChanged', listener);
    return {
      dispose: () => {
        eventEmitter.off('extensionsChanged', listener);
      }
    };
  }

  /**
   * 获取扩展
   */
  export function getExtension<T>(extensionId: string): Extension<T> | undefined {
    console.log(`[Extensions] 获取扩展: ${extensionId}`);
    return allExtensions.find(ext => ext.id === extensionId) as Extension<T> | undefined;
  }

  /**
   * 注册扩展（内部使用）
   */
  export function _registerExtension(extension: Extension<any>): void {
    console.log(`[Extensions] 注册扩展: ${extension.id}`);
    allExtensions.push(extension);
    eventEmitter.emit('extensionsChanged');
  }

  /**
   * 注销扩展（内部使用）
   */
  export function _unregisterExtension(extensionId: string): void {
    console.log(`[Extensions] 注销扩展: ${extensionId}`);
    const index = allExtensions.findIndex(ext => ext.id === extensionId);
    if (index >= 0) {
      allExtensions.splice(index, 1);
      eventEmitter.emit('extensionsChanged');
    }
  }
}