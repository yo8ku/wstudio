/**
 * VSCode Commands API
 */

import { EventEmitter } from './event-emitter';
import { Disposable, Event } from './types';

export namespace commands {
  const commandRegistry = new Map<string, (...args: any[]) => any>();
  const commandEventEmitter = new EventEmitter();

  /**
   * 注册命令
   */
  export function registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    console.log(`[Commands] 注册命令: ${command}`);
    
    const wrappedCallback = thisArg ? callback.bind(thisArg) : callback;
    commandRegistry.set(command, wrappedCallback);
    
    return {
      dispose: () => {
        commandRegistry.delete(command);
        console.log(`[Commands] 注销命令: ${command}`);
      }
    };
  }

  /**
   * 注册文本编辑器命令
   */
  export function registerTextEditorCommand(
    command: string, 
    callback: (textEditor: any, edit: any, ...args: any[]) => void, 
    thisArg?: any
  ): Disposable {
    console.log(`[Commands] 注册文本编辑器命令: ${command}`);
    
    const wrappedCallback = (textEditor: any, edit: any, ...args: any[]) => {
      if (thisArg) {
        callback.call(thisArg, textEditor, edit, ...args);
      } else {
        callback(textEditor, edit, ...args);
      }
    };
    
    commandRegistry.set(command, wrappedCallback);
    
    return {
      dispose: () => {
        commandRegistry.delete(command);
        console.log(`[Commands] 注销文本编辑器命令: ${command}`);
      }
    };
  }

  /**
   * 执行命令
   */
  export async function executeCommand<T = any>(command: string, ...args: any[]): Promise<T | undefined> {
    console.log(`[Commands] 执行命令: ${command}`, args);
    
    const handler = commandRegistry.get(command);
    if (handler) {
      try {
        const result = await handler(...args);
        console.log(`[Commands] 命令执行成功: ${command}`);
        return result;
      } catch (error) {
        console.error(`[Commands] 命令执行失败: ${command}`, error);
        throw error;
      }
    } else {
      console.warn(`[Commands] 命令未找到: ${command}`);
      return undefined;
    }
  }

  /**
   * 获取所有命令
   */
  export function getCommands(filterInternal?: boolean): Promise<string[]> {
    const allCommands = Array.from(commandRegistry.keys());
    console.log(`[Commands] 获取所有命令: ${allCommands.length} 个`);
    return Promise.resolve(allCommands);
  }

  /**
   * 命令执行事件
   */
  export const onDidExecuteCommand: Event<{ command: string; arguments: any[] }> = (listener) => {
    commandEventEmitter.on('executeCommand', listener);
    return {
      dispose: () => {
        commandEventEmitter.off('executeCommand', listener);
      }
    };
  };

  /**
   * 触发命令执行事件
   */
  export function _triggerCommandExecution(command: string, args: any[]): void {
    commandEventEmitter.emit('executeCommand', { command, arguments: args });
  }
}