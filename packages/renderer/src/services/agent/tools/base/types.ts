/**
 * 工具系统类型定义
 * 功能：定义工具分类、元数据、配置等基础类型
 * 描述：所有工具类共享的类型定义，确保类型一致性
 */

/** 工具分类 */
export type ToolCategory =
  | 'filesystem'
  | 'search'
  | 'shell'
  | 'interaction'
  | 'network'
  | 'agent'
  | 'taskmanager';

/** 工具元数据 */
export interface ToolMetadata {
  /** 工具分类 */
  category: ToolCategory;
  /** 是否需要用户确认后才能执行 */
  requiresConfirmation: boolean;
  /** 是否为只读操作（不修改文件系统） */
  readOnly: boolean;
  /** 优先级（数值越大越靠前） */
  priority: number;
  /** 工具版本 */
  version: string;
}

/** 工具配置基础接口 */
export interface BaseToolConfig {
  /** 工作区根路径 */
  workspacePath: string;
}

/** 文件系统工具配置 */
export interface FileSystemToolConfig extends BaseToolConfig {
  /** 允许的文件扩展名（空数组表示允许所有） */
  allowedExtensions?: string[];
  /** 禁止的文件扩展名 */
  disallowedExtensions?: string[];
  /** 最大文件大小（字节） */
  maxFileSize?: number;
  /** 是否允许写入 */
  allowWrite?: boolean;
  /** 是否允许删除 */
  allowDelete?: boolean;
}

/** RAG 工具配置 */
export interface RAGToolConfig extends BaseToolConfig {
  /** 最大返回结果数 */
  maxResults?: number;
  /** 最小相关性分数 */
  minRelevanceScore?: number;
  /** 是否包含元数据 */
  includeMetadata?: boolean;
  /** 知识库 ID */
  knowledgeBaseId?: string;
}

/** Shell 工具配置 */
export interface ShellToolConfig extends BaseToolConfig {
  /** 命令超时（毫秒），默认 30000 */
  timeout?: number;
  /** 禁止的命令模式 */
  forbiddenCommands?: RegExp[];
  /** 是否允许执行 */
  allowExecution?: boolean;
}

/** 网络工具配置 */
export interface WebFetchToolConfig extends BaseToolConfig {
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 最大响应大小（字节） */
  maxResponseSize?: number;
  /** 允许的域名（空数组表示允许所有） */
  allowedDomains?: string[];
}

/** IPC 调用结果的通用结构 */
export interface IPCResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
