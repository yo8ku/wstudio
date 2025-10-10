/**
 * VSCode Tasks API
 */

import { Disposable, Event, Thenable } from './types';

export namespace tasks {
  /**
   * 注册任务提供程序
   */
  export function registerTaskProvider(type: string, provider: any): Disposable {
    console.log(`[Tasks] 注册任务提供程序: ${type}`);
    return {
      dispose: () => {
        console.log(`[Tasks] 注销任务提供程序: ${type}`);
      }
    };
  }

  /**
   * 注册任务过滤器
   */
  export function registerTaskFilter(filter: any): Disposable {
    console.log(`[Tasks] 注册任务过滤器`);
    return {
      dispose: () => {
        console.log(`[Tasks] 注销任务过滤器`);
      }
    };
  }

  /**
   * 执行任务
   */
  export function executeTask(task: any): Thenable<any> {
    console.log(`[Tasks] 执行任务: ${task.name}`);
    return Promise.resolve(undefined);
  }

  /**
   * 获取任务
   */
  export function fetchTasks(filter?: any): Thenable<any[]> {
    console.log(`[Tasks] 获取任务`);
    return Promise.resolve([]);
  }

  /**
   * 任务执行事件
   */
  export const onDidStartTask: Event<any> = () => ({
    dispose: () => {}
  });

  /**
   * 任务结束事件
   */
  export const onDidEndTask: Event<any> = () => ({
    dispose: () => {}
  });

  /**
   * 任务开始事件
   */
  export const onDidStartTaskExecution: Event<any> = () => ({
    dispose: () => {}
  });

  /**
   * 任务结束事件
   */
  export const onDidEndTaskExecution: Event<any> = () => ({
    dispose: () => {}
  });
}