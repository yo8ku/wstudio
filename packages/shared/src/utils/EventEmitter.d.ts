/**
 * 简单的浏览器兼容的事件发射器
 * 用于替代 Node.js 的 events 模块
 */
export declare class EventEmitter<EventMap extends Record<string, (...args: any[]) => void> = Record<string, (...args: any[]) => void>> {
    private events;
    /**
     * 监听事件
     */
    on<K extends keyof EventMap>(event: K & string, handler: EventMap[K]): this;
    /**
     * 监听一次事件
     */
    once<K extends keyof EventMap>(event: K & string, handler: EventMap[K]): this;
    /**
     * 移除事件监听器
     */
    off<K extends keyof EventMap>(event: K & string, handler: EventMap[K]): this;
    /**
     * 发射事件
     */
    emit<K extends keyof EventMap>(event: K & string, ...args: Parameters<EventMap[K]>): boolean;
    /**
     * 移除所有监听器
     */
    removeAllListeners(event?: string): this;
    /**
     * 获取事件的监听器数量
     */
    listenerCount(event: string): number;
    /**
     * 获取所有事件名称
     */
    eventNames(): string[];
}
//# sourceMappingURL=EventEmitter.d.ts.map