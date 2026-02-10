/**
 * Agent 类型定义
 * 功能：定义 Agent 系统的所有类型接口
 * 描述：包含任务、计划、工具、状态等核心类型定义
 */

import type { ChatMessage } from '../../types/aiProvider';

/**
 * Agent 状态枚举
 */
export enum AgentState {
  /** 空闲状态 */
  IDLE = 'idle',
  /** 规划中 */
  PLANNING = 'planning',
  /** 执行中 */
  EXECUTING = 'executing',
  /** 等待用户确认 */
  WAITING = 'waiting',
  /** 已完成 */
  COMPLETED = 'completed',
  /** 错误状态 */
  ERROR = 'error',
  /** 已中断 */
  INTERRUPTED = 'interrupted'
}

/**
 * Agent 任务类型
 */
export type AgentTaskType = 'write' | 'edit' | 'query' | 'execute' | 'analyze';

/**
 * Agent 任务定义
 */
export interface AgentTask {
  /** 任务唯一标识 */
  id: string;
  /** 任务类型 */
  type: AgentTaskType;
  /** 任务描述 */
  description: string;
  /** 任务上下文 */
  context: AgentTaskContext;
  /** 任务约束 */
  constraints?: AgentTaskConstraints;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/**
 * 任务上下文
 */
export interface AgentTaskContext {
  /** 当前文件路径 */
  currentFile?: string;
  /** 选中的文本 */
  selectedText?: string;
  /** 光标位置 */
  cursorPosition?: {
    lineNumber: number;
    column: number;
  };
  /** 工作区路径 */
  workspacePath?: string;
  /** 额外上下文信息 */
  additionalContext?: Record<string, unknown>;
}

/**
 * 任务约束
 */
export interface AgentTaskConstraints {
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 允许使用的工具列表 */
  allowedTools?: string[];
  /** 禁止使用的工具列表 */
  disallowedTools?: string[];
  /** 最大执行步骤数 */
  maxSteps?: number;
  /** 是否允许文件写入 */
  allowFileWrite?: boolean;
  /** 是否允许执行命令 */
  allowCommandExecution?: boolean;
}

/**
 * Agent 步骤类型
 */
export type AgentStepType = 'think' | 'tool_call' | 'write' | 'verify' | 'wait_confirmation';

/**
 * Agent 步骤状态
 */
export type AgentStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/**
 * Agent 执行步骤
 */
export interface AgentStep {
  /** 步骤唯一标识 */
  id: string;
  /** 步骤类型 */
  type: AgentStepType;
  /** 步骤描述 */
  description: string;
  /** 步骤状态 */
  status: AgentStepStatus;
  /** 执行结果 */
  result?: unknown;
  /** 错误信息 */
  error?: string;
  /** 工具调用信息（如果是 tool_call 类型） */
  toolCall?: {
    toolName: string;
    parameters: Record<string, unknown>;
  };
  /** 开始时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
}

/**
 * Agent 执行计划
 */
export interface AgentPlan {
  /** 关联的任务 ID */
  taskId: string;
  /** 执行步骤列表 */
  steps: AgentStep[];
  /** 预估步骤数 */
  estimatedSteps: number;
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 计划创建时间 */
  createdAt: number;
  /** 计划更新时间 */
  updatedAt: number;
}

/**
 * 工具参数 JSON Schema
 */
export interface ToolParameterSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, ToolParameterSchema>;
  items?: ToolParameterSchema;
  required?: string[];
  description?: string;
  enum?: string[];
  default?: unknown;
}

/**
 * 文件变更记录
 */
export interface FileChange {
  /** 文件路径 */
  filePath: string;
  /** 变更类型 */
  type: 'create' | 'modify' | 'delete';
  /** 原始内容 */
  originalContent?: string;
  /** 新内容 */
  newContent?: string;
  /** 变更时间 */
  timestamp: number;
}

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: unknown;
  /** 错误信息 */
  error?: string;
  /** 文件变更记录 */
  changes?: FileChange[];
  /** 执行耗时（毫秒） */
  duration?: number;
}

/**
 * Agent 工具接口
 */
export interface AgentTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 参数 Schema */
  parameters: ToolParameterSchema;
  /** 是否需要用户确认 */
  requiresConfirmation?: boolean;
  /** 执行工具 */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
  /** 验证参数 */
  validateParams?: (params: Record<string, unknown>) => boolean;
}

/**
 * 差异变更类型
 */
export type DiffChangeType = 'add' | 'delete' | 'modify';

/**
 * 行变更类型
 */
export type LineChangeType = 'add' | 'delete' | 'unchanged';

/**
 * 行变更记录
 */
export interface LineChange {
  /** 行号 */
  lineNumber: number;
  /** 变更类型 */
  type: LineChangeType;
  /** 行内容 */
  content: string;
  /** 原始行号（用于删除和修改） */
  originalLineNumber?: number;
}

/**
 * 差异变更记录
 */
export interface DiffChange {
  /** 变更类型 */
  type: DiffChangeType;
  /** 文件路径 */
  filePath: string;
  /** 原始内容 */
  originalContent: string;
  /** 新内容 */
  newContent: string;
  /** 行级别变更 */
  lineChanges: LineChange[];
}

/**
 * Agent 记忆条目
 */
export interface AgentMemoryEntry {
  /** 条目 ID */
  id: string;
  /** 角色 */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 内容 */
  content: string;
  /** 时间戳 */
  timestamp: number;
  /** 关联的任务 ID */
  taskId?: string;
  /** 关联的步骤 ID */
  stepId?: string;
  /** 工具调用信息 */
  toolCall?: {
    name: string;
    result: ToolResult;
  };
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Agent 记忆配置
 */
export interface AgentMemoryConfig {
  /** 最大记忆条目数 */
  maxEntries?: number;
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 是否启用持久化 */
  enablePersistence?: boolean;
  /** 持久化存储键 */
  storageKey?: string;
}

/**
 * Agent 执行配置
 */
export interface AgentExecutionConfig {
  /** 使用的模型 ID */
  modelId: string;
  /** 温度参数 */
  temperature?: number;
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 是否启用流式输出 */
  streaming?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

/**
 * Agent 事件类型
 */
export type AgentEventType =
  | 'state_change'
  | 'step_start'
  | 'step_complete'
  | 'step_error'
  | 'tool_call'
  | 'tool_result'
  | 'content_stream'
  | 'thinking_stream'
  | 'plan_created'
  | 'plan_updated'
  | 'task_complete'
  | 'task_error'
  | 'confirmation_required'
  | 'diff_generated';

/**
 * Agent 事件
 */
export interface AgentEvent {
  /** 事件类型 */
  type: AgentEventType;
  /** 事件数据 */
  data: unknown;
  /** 时间戳 */
  timestamp: number;
  /** 关联的任务 ID */
  taskId?: string;
  /** 关联的步骤 ID */
  stepId?: string;
}

/**
 * Agent 事件监听器
 */
export type AgentEventListener = (event: AgentEvent) => void;

/**
 * Agent 快照（用于回滚）
 */
export interface AgentSnapshot {
  /** 快照 ID */
  id: string;
  /** 关联的任务 ID */
  taskId: string;
  /** 文件快照 */
  fileSnapshots: Array<{
    filePath: string;
    content: string;
  }>;
  /** 创建时间 */
  createdAt: number;
  /** 描述 */
  description?: string;
}

/**
 * Agent 服务配置
 */
export interface AgentServiceConfig {
  /** 执行配置 */
  execution: AgentExecutionConfig;
  /** 记忆配置 */
  memory?: AgentMemoryConfig;
  /** 默认任务约束 */
  defaultConstraints?: AgentTaskConstraints;
  /** 是否启用快照 */
  enableSnapshots?: boolean;
  /** 最大快照数 */
  maxSnapshots?: number;
}

/**
 * 确认请求
 */
export interface ConfirmationRequest {
  /** 请求 ID */
  id: string;
  /** 请求类型 */
  type: 'file_write' | 'command_execute' | 'diff_apply' | 'custom';
  /** 请求描述 */
  description: string;
  /** 差异变更（如果是 diff_apply 类型） */
  diffChanges?: DiffChange[];
  /** 文件变更（如果是 file_write 类型） */
  fileChanges?: FileChange[];
  /** 命令（如果是 command_execute 类型） */
  command?: string;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 确认响应
 */
export interface ConfirmationResponse {
  /** 请求 ID */
  requestId: string;
  /** 是否确认 */
  confirmed: boolean;
  /** 用户反馈 */
  feedback?: string;
  /** 响应时间 */
  respondedAt: number;
}
