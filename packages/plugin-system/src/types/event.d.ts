/**
 * 插件系统 - 事件类型定义
 * 定义事件系统的接口、事件类型等
 */
/**
 * 事件监听器
 */
export type EventListener<T = any> = (data: T) => void | Promise<void>;
/**
 * 事件订阅
 */
export interface EventSubscription {
    /** 取消订阅 */
    dispose(): void;
}
/**
 * 事件发射器接口
 */
export interface EventEmitter {
    /** 订阅事件 */
    on<T = any>(event: string, listener: EventListener<T>): EventSubscription;
    /** 单次订阅事件 */
    once<T = any>(event: string, listener: EventListener<T>): EventSubscription;
    /** 发射事件 */
    emit<T = any>(event: string, data?: T): Promise<void>;
    /** 移除事件监听器 */
    off(event: string, listener?: EventListener): void;
    /** 移除所有监听器 */
    removeAllListeners(event?: string): void;
}
/**
 * 事件优先级
 */
export declare enum EventPriority {
    /** 最高优先级 */
    Highest = 1000,
    /** 高优先级 */
    High = 750,
    /** 普通优先级 */
    Normal = 500,
    /** 低优先级 */
    Low = 250,
    /** 最低优先级 */
    Lowest = 0
}
/**
 * 事件配置
 */
export interface EventConfig {
    /** 事件优先级 */
    priority?: EventPriority;
    /** 是否只执行一次 */
    once?: boolean;
}
/**
 * 系统事件类型
 */
export declare enum SystemEvent {
    /** 插件加载 */
    PluginLoaded = "plugin:loaded",
    /** 插件激活 */
    PluginActivated = "plugin:activated",
    /** 插件停用 */
    PluginDeactivated = "plugin:deactivated",
    /** 插件错误 */
    PluginError = "plugin:error",
    /** 应用启动 */
    AppReady = "app:ready",
    /** 应用关闭 */
    AppClose = "app:close"
}
//# sourceMappingURL=event.d.ts.map