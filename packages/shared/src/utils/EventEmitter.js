"use strict";
/**
 * 简单的浏览器兼容的事件发射器
 * 用于替代 Node.js 的 events 模块
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmitter = void 0;
class EventEmitter {
    constructor() {
        this.events = new Map();
    }
    /**
     * 监听事件
     */
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(handler);
        return this;
    }
    /**
     * 监听一次事件
     */
    once(event, handler) {
        const onceHandler = (...args) => {
            handler(...args);
            this.off(event, onceHandler);
        };
        return this.on(event, onceHandler);
    }
    /**
     * 移除事件监听器
     */
    off(event, handler) {
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
    emit(event, ...args) {
        const handlers = this.events.get(event);
        if (handlers && handlers.length > 0) {
            handlers.forEach(handler => {
                try {
                    handler(...args);
                }
                catch (error) {
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
    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        }
        else {
            this.events.clear();
        }
        return this;
    }
    /**
     * 获取事件的监听器数量
     */
    listenerCount(event) {
        const handlers = this.events.get(event);
        return handlers ? handlers.length : 0;
    }
    /**
     * 获取所有事件名称
     */
    eventNames() {
        return Array.from(this.events.keys());
    }
}
exports.EventEmitter = EventEmitter;
//# sourceMappingURL=EventEmitter.js.map