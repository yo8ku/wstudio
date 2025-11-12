/**
 * 插件系统 - 存储类型定义
 * 定义存储系统的接口、存储类型等
 */

/**
 * 存储范围
 */
export enum StorageScope {
  /** 全局存储 */
  Global = 'global',
  /** 工作区存储 */
  Workspace = 'workspace',
  /** 插件存储 */
  Plugin = 'plugin',
}

/**
 * 存储接口
 */
export interface Storage {
  /** 获取值 */
  get<T = any>(key: string, defaultValue?: T): T | undefined;
  /** 设置值 */
  set<T = any>(key: string, value: T): Promise<void>;
  /** 删除值 */
  delete(key: string): Promise<void>;
  /** 清空存储 */
  clear(): Promise<void>;
  /** 获取所有键 */
  keys(): string[];
  /** 检查键是否存在 */
  has(key: string): boolean;
}

/**
 * 存储选项
 */
export interface StorageOptions {
  /** 存储范围 */
  scope?: StorageScope;
  /** 是否加密 */
  encrypted?: boolean;
  /** 存储路径 */
  path?: string;
}

/**
 * 存储事件
 */
export interface StorageEvent {
  /** 存储键 */
  key: string;
  /** 旧值 */
  oldValue?: any;
  /** 新值 */
  newValue?: any;
  /** 存储范围 */
  scope: StorageScope;
}

/**
 * 存储管理器接口
 */
export interface StorageManager {
  /** 获取存储实例 */
  getStorage(scope: StorageScope, options?: StorageOptions): Storage;
  /** 监听存储变化 */
  onDidChangeStorage(listener: (event: StorageEvent) => void): void;
  /** 获取值（快捷方法） */
  get<T = any>(key: string, defaultValue?: T): Promise<T | undefined>;
  /** 设置值（快捷方法） */
  set<T = any>(key: string, value: T): Promise<void>;
  /** 删除值（快捷方法） */
  delete(key: string): Promise<void>;
}

