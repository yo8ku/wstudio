/**
 * Agent 工具模块统一导出
 * 功能：导出所有工具类、基类、类型和注册表
 */

// 基础架构
export { BaseTool } from './base/BaseTool';
export type {
  ToolCategory,
  ToolMetadata,
  BaseToolConfig,
  FileSystemToolConfig,
  RAGToolConfig,
  ShellToolConfig,
  WebFetchToolConfig,
  IPCResult,
} from './base/types';

// 工具注册表
export { ToolRegistry, toolRegistry } from './ToolRegistry';

// 文件系统工具
export { ReadFileTool } from './filesystem/ReadFileTool';
export { WriteFileTool } from './filesystem/WriteFileTool';
export { EditFileTool } from './filesystem/EditFileTool';
export { MultiEditFileTool } from './filesystem/MultiEditFileTool';
export { ListFilesTool } from './filesystem/ListFilesTool';
export { SearchFilesTool } from './filesystem/SearchFilesTool';
export { GlobTool } from './filesystem/GlobTool';

// RAG 工具
export { KnowledgeQueryTool } from './rag/KnowledgeQueryTool';
export { SemanticSearchTool } from './rag/SemanticSearchTool';
export { FindSimilarTool } from './rag/FindSimilarTool';
export { GetContextTool } from './rag/GetContextTool';

// Shell 工具
export { BashTool } from './shell/BashTool';

// 交互工具
export { AskUserTool } from './interaction/AskUserTool';
export { ListFormsTool } from './interaction/ListFormsTool';
export { GetFormSchemaTool } from './interaction/GetFormSchemaTool';
export { QueryFormTool } from './interaction/QueryFormTool';

// 网络工具
export { WebFetchTool } from './network/WebFetchTool';

// 任务管理工具
export { TodoReadTool } from './taskmanager/TodoReadTool';
export { TodoWriteTool } from './taskmanager/TodoWriteTool';
export { TodoStore } from './taskmanager/TodoStore';
export type { TodoItem, TodoStatus, TodoSource, TodoUpdateParams } from './taskmanager/TodoStore';

// 文件安全工具函数
export {
  resolveSecurePath,
  getFileExtension,
  isExtensionAllowed,
  getMaxFileSize,
} from './filesystem/FileSecurityUtils';

// 兼容旧 API（已废弃，将在下个版本移除）
export {
  createFileSystemTools,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createSearchFilesTool,
  type FileSystemToolConfig as LegacyFileSystemToolConfig,
} from './FileSystemTool';
export {
  createRAGTools,
  createKnowledgeQueryTool,
  createSemanticSearchTool,
  createFindSimilarTool,
  createGetContextTool,
  type RAGToolConfig as LegacyRAGToolConfig,
} from './RAGTool';
