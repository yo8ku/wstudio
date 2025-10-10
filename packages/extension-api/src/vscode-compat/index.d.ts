/**
 * VSCode API 类型定义
 * 基于官方 @types/vscode 的简化版本
 */

export namespace vscode {
  export interface Disposable {
    dispose(): void;
  }

  export interface Event<T> {
    (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]): Disposable;
  }

  export interface ExtensionContext {
    subscriptions: Disposable[];
    workspaceState: Memento;
    globalState: Memento;
    extensionPath: string;
    storagePath: string | undefined;
    globalStoragePath: string;
    logPath: string;
  }

  export interface Memento {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: any): Thenable<void>;
  }

  export interface Command {
    title: string;
    command: string;
    tooltip?: string;
    arguments?: any[];
  }
}



