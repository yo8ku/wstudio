/**
 * 简单的浏览器兼容的事件发射器
 * 用于替代 Node.js 的 events 模块
 * 文件功能：提供与 Node.js EventEmitter 兼容的 API，可在浏览器环境中使用
 */

type EventHandler = (...args: any[]) => void;

/**
 * 浏览器兼容的 EventEmitter 类
 * 提供 on, off, emit, once 等方法
 */
export class BrowserEventEmitter {
  private events: Map<string, EventHandler[]> = new Map();

  /**
   * 监听事件
   */
  public on(event: string, handler: EventHandler): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(handler);
    return this;
  }

  /**
   * 监听一次事件
   */
  public once(event: string, handler: EventHandler): this {
    const onceHandler = (...args: any[]) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    return this.on(event, onceHandler);
  }

  /**
   * 移除事件监听器
   */
  public off(event: string, handler: EventHandler): this {
    const handlers = this.events.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.events.delete(event);
      }
    }
    return this;
  }

  /**
   * 发射事件
   */
  public emit(event: string, ...args: any[]): boolean {
    const handlers = this.events.get(event);
    if (handlers && handlers.length > 0) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for "${event}":`, error);
        }
      });
      return true;
    }
    return false;
  }

  /**
   * 移除所有监听器
   */
  public removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  /**
   * 获取事件的监听器数量
   */
  public listenerCount(event: string): number {
    const handlers = this.events.get(event);
    return handlers ? handlers.length : 0;
  }

  /**
   * 获取所有事件名称
   */
  public eventNames(): string[] {
    return Array.from(this.events.keys());
  }
}











