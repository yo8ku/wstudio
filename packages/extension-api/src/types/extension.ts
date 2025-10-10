/**
 * 扩展类型定义
 */

export interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string;
  enabled: boolean;
  activationEvents?: string[];
  extensionPath?: string;
}

export interface ExtensionContext {
  subscriptions: { dispose(): void }[];
  workspaceState: any;
  globalState: any;
  extensionPath: string;
}

export type ActivationFunction = (context: ExtensionContext) => void | Promise<void>;

// 重新导出 manifest 类型
export * from './manifest';
