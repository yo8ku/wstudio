/**
 * 事件发射器工具类
 * 用于实现 VSCode 的事件系统
 */

import { Event, Disposable } from '../vscode-compat/types';

type Listener<T> = (e: T) => any;

export class EventEmitter<T> {
  private listeners: Set<Listener<T>> = new Set();

  get event(): Event<T> {
    return (listener: Listener<T>, thisArgs?: any, disposables?: Disposable[]): Disposable => {
      const bound = thisArgs ? listener.bind(thisArgs) : listener;
      this.listeners.add(bound);

      const disposable: Disposable = {
        dispose: () => {
          this.listeners.delete(bound);
        },
      };

      if (disposables) {
        disposables.push(disposable);
      }

      return disposable;
    };
  }

  fire(data: T): void {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  dispose(): void {
    this.listeners.clear();
  }
}



