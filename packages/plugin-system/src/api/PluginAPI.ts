/**
 * 插件系统 - 插件API
 * 提供给插件使用的API接口
 */

import { PluginContext } from '../types/plugin';
import { EventEmitter } from '../types/event';
import { CommandRegistry } from '../types/command';
import { UIRegistry } from '../types/ui';
import { StorageManager } from '../types/storage';

/**
 * 插件API接口
 * 插件通过此接口与系统交互
 */
export interface PluginAPI {
  /** 插件上下文 */
  readonly context: PluginContext;

  /** 事件系统 */
  readonly events: EventEmitter;

  /** 命令系统 */
  readonly commands: CommandRegistry;

  /** UI系统 */
  readonly ui: UIRegistry;

  /** 存储系统 */
  readonly storage: StorageManager;

  /** 工作区相关API */
  readonly workspace: WorkspaceAPI;

  /** 窗口相关API */
  readonly window: WindowAPI;

  /** 文件系统API */
  readonly fs: FileSystemAPI;

  /** 网络API */
  readonly http: HttpAPI;
}

/**
 * 工作区API
 */
export interface WorkspaceAPI {
  /** 获取工作区根路径 */
  getRootPath(): string | undefined;

  /** 获取工作区配置 */
  getConfiguration<T = any>(section?: string): T;

  /** 更新工作区配置 */
  updateConfiguration(section: string, value: any): Promise<void>;
}

/**
 * 窗口API
 */
export interface WindowAPI {
  /** 显示信息消息 */
  showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;

  /** 显示警告消息 */
  showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;

  /** 显示错误消息 */
  showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;

  /** 显示输入框 */
  showInputBox(options?: InputBoxOptions): Promise<string | undefined>;

  /** 显示快速选择 */
  showQuickPick(items: string[], options?: QuickPickOptions): Promise<string | undefined>;
}

/**
 * 输入框选项
 */
export interface InputBoxOptions {
  /** 占位符 */
  placeHolder?: string;
  /** 提示 */
  prompt?: string;
  /** 默认值 */
  value?: string;
  /** 验证函数 */
  validateInput?(value: string): string | undefined;
}

/**
 * 快速选择选项
 */
export interface QuickPickOptions {
  /** 占位符 */
  placeHolder?: string;
  /** 是否可以选择多个 */
  canPickMany?: boolean;
}

/**
 * 打开文件对话框选项
 */
export interface OpenDialogOptions {
  /** 文件过滤器 */
  filters?: Array<{ name: string; extensions: string[] }>;
  /** 对话框属性 */
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  /** 默认路径 */
  defaultPath?: string;
}

/**
 * 文件系统API
 */
export interface FileSystemAPI {
  /** 读取文件 */
  readFile(path: string): Promise<Buffer>;

  /** 写入文件 */
  writeFile(path: string, content: Buffer | string): Promise<void>;

  /** 删除文件 */
  deleteFile(path: string): Promise<void>;

  /** 创建目录 */
  createDirectory(path: string): Promise<void>;

  /** 读取目录 */
  readDirectory(path: string): Promise<string[]>;

  /** 检查文件是否存在 */
  exists(path: string): Promise<boolean>;

  /** 显示打开文件对话框 */
  showOpenDialog(options?: OpenDialogOptions): Promise<string[] | undefined>;
}

/**
 * HTTP API
 */
export interface HttpAPI {
  /** GET请求 */
  get<T = any>(url: string, options?: RequestOptions): Promise<T>;

  /** POST请求 */
  post<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;

  /** PUT请求 */
  put<T = any>(url: string, data?: any, options?: RequestOptions): Promise<T>;

  /** DELETE请求 */
  delete<T = any>(url: string, options?: RequestOptions): Promise<T>;
}

/**
 * 请求选项
 */
export interface RequestOptions {
  /** 请求头 */
  headers?: Record<string, string>;
  /** 超时时间(ms) */
  timeout?: number;
}

