/**
 * 插件清理工具。
 * 用于统一管理命令注册、事件订阅、定时器等可释放资源。
 */

import type {
  PluginCleanupHandler,
  PluginCleanupRegistry,
  PluginDisposable,
} from '../types/plugin'

export function createPluginDisposable(dispose: () => void | Promise<void>): PluginDisposable {
  return { dispose }
}

export class PluginCleanupStore implements PluginCleanupRegistry {
  private readonly disposables: PluginDisposable[] = []

  public get size(): number {
    return this.disposables.length
  }

  public add<T extends PluginDisposable>(disposable: T): T {
    this.disposables.push(disposable)
    return disposable
  }

  public addCallback(handler: PluginCleanupHandler): PluginDisposable {
    const disposable = createPluginDisposable(handler)
    this.disposables.push(disposable)
    return disposable
  }

  public clear(): void {
    this.disposables.length = 0
  }

  public async dispose(): Promise<void> {
    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop()
      if (!disposable) {
        continue
      }
      await disposable.dispose()
    }
  }
}
