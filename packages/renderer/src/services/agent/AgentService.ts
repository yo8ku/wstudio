/**
 * Agent 服务
 * 功能：Agent 系统的统一入口
 * 描述：整合所有 Agent 组件，提供简洁的 API 接口
 */

import {
  AgentTask,
  AgentTaskType,
  AgentTaskContext,
  AgentTaskConstraints,
  AgentState,
  AgentServiceConfig,
  AgentExecutionConfig,
  AgentMemoryConfig,
  AgentSnapshot,
  ConfirmationResponse,
  DiffChange,
  AgentEventType,
  AgentEventListener
} from './types';
import { AgentStateManager } from './AgentStateManager';
import { AgentMemory } from './AgentMemory';
import { AgentPlanner } from './AgentPlanner';
import { AgentExecutor, ExecutionResult } from './AgentExecutor';
import { ToolRegistry } from './tools/ToolRegistry';
import { ReadFileTool } from './tools/filesystem/ReadFileTool';
import { WriteFileTool } from './tools/filesystem/WriteFileTool';
import { EditFileTool } from './tools/filesystem/EditFileTool';
import { MultiEditFileTool } from './tools/filesystem/MultiEditFileTool';
import { ListFilesTool } from './tools/filesystem/ListFilesTool';
import { SearchFilesTool } from './tools/filesystem/SearchFilesTool';
import { GlobTool } from './tools/filesystem/GlobTool';
import { KnowledgeQueryTool } from './tools/rag/KnowledgeQueryTool';
import { SemanticSearchTool } from './tools/rag/SemanticSearchTool';
import { FindSimilarTool } from './tools/rag/FindSimilarTool';
import { GetContextTool } from './tools/rag/GetContextTool';
import { BashTool } from './tools/shell/BashTool';
import { AskUserTool } from './tools/interaction/AskUserTool';
import { WebFetchTool } from './tools/network/WebFetchTool';
import { TodoReadTool } from './tools/taskmanager/TodoReadTool';
import { TodoWriteTool } from './tools/taskmanager/TodoWriteTool';
import { QueryFormTool } from './tools/interaction/QueryFormTool';
import type { FileSystemToolConfig, RAGToolConfig, ShellToolConfig, WebFetchToolConfig } from './tools/base/types';

/**
 * 默认执行配置
 */
const DEFAULT_EXECUTION_CONFIG: AgentExecutionConfig = {
  modelId: 'gpt-4',
  temperature: 0.7,
  maxTokens: 4000,
  streaming: true,
  timeout: 60000,
  maxRetries: 3,
  retryDelay: 1000
};

/**
 * Agent 服务类
 */
export class AgentService {
  /** 单例实例 */
  private static instance: AgentService;

  /** 状态管理器 */
  private stateManager: AgentStateManager;

  /** 记忆管理器 */
  private memory: AgentMemory;

  /** 任务规划器 */
  private planner: AgentPlanner;

  /** 任务执行器 */
  private executor: AgentExecutor;

  /** 工具注册表 */
  private toolRegistry: ToolRegistry;

  /** 服务配置 */
  private config: AgentServiceConfig;

  /** 快照列表 */
  private snapshots: AgentSnapshot[] = [];

  /** 是否已初始化 */
  private initialized: boolean = false;

  private constructor() {
    this.stateManager = new AgentStateManager();
    this.memory = new AgentMemory();
    this.toolRegistry = new ToolRegistry();

    // 默认配置
    this.config = {
      execution: DEFAULT_EXECUTION_CONFIG,
      enableSnapshots: true,
      maxSnapshots: 10
    };

    // 初始化规划器
    this.planner = new AgentPlanner({
      executionConfig: this.config.execution,
      availableTools: this.toolRegistry.getAll()
    });

    // 初始化执行器
    this.executor = new AgentExecutor({
      executionConfig: this.config.execution,
      stateManager: this.stateManager,
      memory: this.memory,
      planner: this.planner,
      toolRegistry: this.toolRegistry
    });
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): AgentService {
    if (!AgentService.instance) {
      AgentService.instance = new AgentService();
    }
    return AgentService.instance;
  }

  /**
   * 初始化服务
   */
  async initialize(config?: Partial<AgentServiceConfig>): Promise<void> {
    if (this.initialized) {
      console.log('[AgentService] 服务已初始化');
      return;
    }

    // 合并配置
    if (config) {
      this.config = {
        ...this.config,
        ...config,
        execution: { ...this.config.execution, ...config.execution }
      };
    }

    // 更新组件配置
    this.planner.updateConfig({
      executionConfig: this.config.execution,
      availableTools: this.toolRegistry.getAll()
    });

    this.initialized = true;
    console.log('[AgentService] 服务初始化完成');
  }

  /**
   * 注册默认工具
   */
  registerDefaultTools(options: {
    workspacePath: string;
    fileSystemConfig?: Partial<FileSystemToolConfig>;
    ragConfig?: RAGToolConfig;
    shellConfig?: Partial<ShellToolConfig>;
    webFetchConfig?: Partial<WebFetchToolConfig>;
  }): void {
    const { workspacePath, fileSystemConfig, ragConfig, shellConfig, webFetchConfig } = options;

    // 文件系统工具配置
    const fsConfig: FileSystemToolConfig = { workspacePath, ...fileSystemConfig };
    // RAG 工具配置
    const ragCfg: RAGToolConfig = { workspacePath, ...ragConfig };

    // 使用新的类式工具注册
    this.toolRegistry.registerTools([
      // 文件系统工具
      new ReadFileTool(fsConfig),
      new WriteFileTool(fsConfig),
      new EditFileTool(fsConfig),
      new MultiEditFileTool(fsConfig),
      new ListFilesTool(fsConfig),
      new SearchFilesTool(fsConfig),
      new GlobTool(fsConfig),
      // RAG 工具
      new KnowledgeQueryTool(ragCfg),
      new SemanticSearchTool(ragCfg),
      new FindSimilarTool(ragCfg),
      new GetContextTool(ragCfg),
      // Shell 工具
      new BashTool({ workspacePath, ...shellConfig }),
      // 交互工具
      new AskUserTool({ workspacePath }),
      // 网络工具
      new WebFetchTool({ workspacePath, ...webFetchConfig }),
      // 任务管理工具
      new TodoReadTool({ workspacePath }),
      new TodoWriteTool({ workspacePath }),
      // 表单查询工具
      new QueryFormTool({ workspacePath }),
    ]);

    // 更新规划器的工具列表
    this.planner.updateConfig({
      availableTools: this.toolRegistry.getAll()
    });

    const stats = this.toolRegistry.getStats();
    console.log(`[AgentService] 已注册 ${stats.totalTools} 个默认工具`);
  }

  /**
   * 创建任务
   */
  createTask(
    type: AgentTaskType,
    description: string,
    context?: Partial<AgentTaskContext>,
    constraints?: AgentTaskConstraints
  ): AgentTask {
    const task: AgentTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      description,
      context: {
        ...context
      },
      constraints: {
        ...this.config.defaultConstraints,
        ...constraints
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    console.log(`[AgentService] 创建任务: ${task.id} - ${description}`);
    return task;
  }

  /**
   * 执行任务
   */
  async executeTask(task: AgentTask): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 检查是否可以开始新任务
    if (!this.stateManager.canStartNewTask()) {
      throw new Error('当前有任务正在执行，无法开始新任务');
    }

    // 创建快照（如果启用）
    if (this.config.enableSnapshots) {
      await this.createSnapshot(task.id, '任务开始前');
    }

    console.log(`[AgentService] 开始执行任务: ${task.id}`);

    try {
      const result = await this.executor.execute(task);

      console.log(`[AgentService] 任务执行完成: ${task.id}, 成功: ${result.success}`);

      return result;
    } catch (error) {
      console.error(`[AgentService] 任务执行失败: ${task.id}`, error);
      throw error;
    }
  }

  /**
   * 流式执行任务
   */
  async executeTaskStream(
    task: AgentTask,
    callbacks: {
      onStepStart?: (step: any) => void;
      onStepComplete?: (step: any, result: unknown) => void;
      onContent?: (content: string) => void;
      onThinking?: (thinking: string) => void;
      onToolCall?: (toolName: string, params: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: any) => void;
      onDiffGenerated?: (diff: DiffChange) => void;
      onComplete?: (result: ExecutionResult) => void;
      onError?: (error: Error) => void;
      onConfirmRequired?: (toolName: string, params: Record<string, unknown>) => Promise<boolean>;
    }
  ): Promise<ExecutionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    // 检查是否可以开始新任务
    if (!this.stateManager.canStartNewTask()) {
      throw new Error('当前有任务正在执行，无法开始新任务');
    }

    // 创建快照（如果启用）
    if (this.config.enableSnapshots) {
      await this.createSnapshot(task.id, '任务开始前');
    }

    console.log(`[AgentService] 开始流式执行任务: ${task.id}`);

    return this.executor.executeStream(task, callbacks);
  }

  /**
   * 快速执行写作任务
   */
  async write(
    description: string,
    context?: Partial<AgentTaskContext>
  ): Promise<ExecutionResult> {
    const task = this.createTask('write', description, context);
    return this.executeTask(task);
  }

  /**
   * 快速执行编辑任务
   */
  async edit(
    description: string,
    context: Partial<AgentTaskContext> & { selectedText: string }
  ): Promise<ExecutionResult> {
    const task = this.createTask('edit', description, context);
    return this.executeTask(task);
  }

  /**
   * 快速执行查询任务
   */
  async query(
    description: string,
    context?: Partial<AgentTaskContext>
  ): Promise<ExecutionResult> {
    const task = this.createTask('query', description, context);
    return this.executeTask(task);
  }

  /**
   * 中断当前任务
   */
  interrupt(): void {
    this.executor.interrupt();
    this.stateManager.interrupt('用户中断');
    console.log('[AgentService] 任务已中断');
  }

  /**
   * 重置服务状态
   */
  reset(): void {
    this.stateManager.reset();
    this.memory.clear();
    console.log('[AgentService] 服务状态已重置');
  }

  /**
   * 处理确认响应
   */
  handleConfirmation(response: ConfirmationResponse): void {
    this.stateManager.handleConfirmationResponse(response);
  }

  /**
   * 创建快照
   */
  async createSnapshot(taskId: string, description?: string): Promise<AgentSnapshot> {
    const snapshot: AgentSnapshot = {
      id: `snapshot_${Date.now()}`,
      taskId,
      fileSnapshots: [], // 实际实现中需要收集文件快照
      createdAt: Date.now(),
      description
    };

    this.snapshots.push(snapshot);

    // 限制快照数量
    if (this.snapshots.length > (this.config.maxSnapshots || 10)) {
      this.snapshots.shift();
    }

    console.log(`[AgentService] 创建快照: ${snapshot.id}`);
    return snapshot;
  }

  /**
   * 回滚到快照
   */
  async rollbackToSnapshot(snapshotId: string): Promise<boolean> {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      console.warn(`[AgentService] 快照不存在: ${snapshotId}`);
      return false;
    }

    // 实际实现中需要恢复文件内容
    console.log(`[AgentService] 回滚到快照: ${snapshotId}`);

    // 重置状态
    this.stateManager.reset();

    return true;
  }

  /**
   * 获取快照列表
   */
  getSnapshots(): AgentSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * 添加事件监听器
   */
  on(eventType: AgentEventType | '*', listener: AgentEventListener): () => void {
    return this.stateManager.on(eventType, listener);
  }

  /**
   * 移除事件监听器
   */
  off(eventType: AgentEventType | '*', listener: AgentEventListener): void {
    this.stateManager.off(eventType, listener);
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return this.stateManager.getState();
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): AgentTask | null {
    return this.stateManager.getCurrentTask();
  }

  /**
   * 获取执行进度
   */
  getProgress(): { current: number; total: number; percentage: number } {
    return this.stateManager.getProgress();
  }

  /**
   * 获取记忆统计
   */
  getMemoryStats(): ReturnType<AgentMemory['getStats']> {
    return this.memory.getStats();
  }

  /**
   * 获取工具统计
   */
  getToolStats(): ReturnType<ToolRegistry['getStats']> {
    return this.toolRegistry.getStats();
  }

  /**
   * 获取工具注册表
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * 获取记忆管理器
   */
  getMemory(): AgentMemory {
    return this.memory;
  }

  /**
   * 获取状态管理器
   */
  getStateManager(): AgentStateManager {
    return this.stateManager;
  }

  /**
   * 更新执行配置
   */
  updateExecutionConfig(config: Partial<AgentExecutionConfig>): void {
    this.config.execution = { ...this.config.execution, ...config };

    this.planner.updateConfig({
      executionConfig: this.config.execution
    });

    console.log('[AgentService] 执行配置已更新');
  }

  /**
   * 检查服务是否就绪
   */
  isReady(): boolean {
    return this.initialized && this.stateManager.canStartNewTask();
  }

  /**
   * 检查是否有任务正在执行
   */
  isExecuting(): boolean {
    return this.stateManager.isActive();
  }

  /**
   * 获取服务信息
   */
  getServiceInfo(): {
    initialized: boolean;
    state: AgentState;
    toolCount: number;
    memoryUsage: number;
    snapshotCount: number;
  } {
    const memoryStats = this.memory.getStats();
    const toolStats = this.toolRegistry.getStats();

    return {
      initialized: this.initialized,
      state: this.stateManager.getState(),
      toolCount: toolStats.totalTools,
      memoryUsage: memoryStats.usagePercentage,
      snapshotCount: this.snapshots.length
    };
  }
}

/** 导出单例实例 */
export const agentService = AgentService.getInstance();
