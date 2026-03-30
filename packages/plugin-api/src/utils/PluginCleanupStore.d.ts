/**
 * 插件清理工具。
 * 用于统一管理命令注册、事件订阅、定时器等可释放资源。
 */
import type { PluginCleanupHandler, PluginCleanupRegistry, PluginDisposable } from '../types/plugin';
export declare function createPluginDisposable(dispose: () => void | Promise<void>): PluginDisposable;
export declare class PluginCleanupStore implements PluginCleanupRegistry {
    private readonly disposables;
    get size(): number;
    add<T extends PluginDisposable>(disposable: T): T;
    addCallback(handler: PluginCleanupHandler): PluginDisposable;
    clear(): void;
    dispose(): Promise<void>;
}
