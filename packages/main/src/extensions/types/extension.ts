/**
 * 扩展类型定义
 * 替代 @note-studio/extension-api 的类型定义
 */

/**
 * 扩展接口
 */
export interface Extension {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  publisher?: string;
  main?: string;
  enabled: boolean;
  activationEvents?: string[];
  extensionPath?: string;
}

/**
 * 扩展上下文接口
 */
export interface ExtensionContext {
  subscriptions: Array<{ dispose(): void }>;
  workspaceState: Memento;
  globalState: Memento;
  extensionPath: string;
}

/**
 * Memento 接口（用于存储扩展状态）
 */
export interface Memento {
  get<T>(key: string, defaultValue?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
}

/**
 * 扩展清单接口（VSCode 兼容）
 */
export interface ExtensionManifest {
  name: string;
  displayName?: string;
  version: string;
  publisher?: string;
  description?: string;
  main?: string;
  engines?: {
    vscode?: string;
    noteStudio?: string;
  };
  activationEvents?: string[];
  contributes?: Record<string, unknown>;
}








