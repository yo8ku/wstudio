"use strict";
/**
 * 插件清理工具。
 * 用于统一管理命令注册、事件订阅、定时器等可释放资源。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginCleanupStore = void 0;
exports.createPluginDisposable = createPluginDisposable;
function createPluginDisposable(dispose) {
    return { dispose };
}
class PluginCleanupStore {
    constructor() {
        this.disposables = [];
    }
    get size() {
        return this.disposables.length;
    }
    add(disposable) {
        this.disposables.push(disposable);
        return disposable;
    }
    addCallback(handler) {
        const disposable = createPluginDisposable(handler);
        this.disposables.push(disposable);
        return disposable;
    }
    clear() {
        this.disposables.length = 0;
    }
    async dispose() {
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            if (!disposable) {
                continue;
            }
            await disposable.dispose();
        }
    }
}
exports.PluginCleanupStore = PluginCleanupStore;
