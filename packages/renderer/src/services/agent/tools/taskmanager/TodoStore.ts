/**
 * 待办列表存储
 * 功能：管理 Agent 待办项的内存存储
 * 描述：单例模式，支持与 AgentPlan 步骤状态双向同步。
 *       Agent 可自行创建待办项，也可从 Plan 步骤自动生成。
 */

/** 待办项状态 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed';

/** 待办项来源 */
export type TodoSource = 'agent' | 'plan';

/** 待办项 */
export interface TodoItem {
  /** 唯一标识 */
  id: string;
  /** 待办内容 */
  content: string;
  /** 状态 */
  status: TodoStatus;
  /** 来源：agent（Agent 自行创建）或 plan（从 AgentPlan 步骤同步） */
  source: TodoSource;
  /** 关联的 AgentStep ID（plan 来源时） */
  stepId?: string;
  /** 创建时间 */
  createdAt: number;
  /** 更新时间 */
  updatedAt: number;
}

/** 待办项更新参数 */
export interface TodoUpdateParams {
  content?: string;
  status?: TodoStatus;
}

/** ID 计数器 */
let idCounter = 0;

/**
 * 待办列表存储（单例）
 */
export class TodoStore {
  private static instance: TodoStore | null = null;
  private items: Map<string, TodoItem> = new Map();

  private constructor() {}

  static getInstance(): TodoStore {
    if (!TodoStore.instance) {
      TodoStore.instance = new TodoStore();
    }
    return TodoStore.instance;
  }

  /** 添加待办项 */
  add(content: string, source: TodoSource = 'agent', stepId?: string): TodoItem {
    const id = `todo_${Date.now()}_${++idCounter}`;
    const item: TodoItem = {
      id,
      content,
      status: 'pending',
      source,
      stepId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.set(id, item);
    this.emitChange();
    return item;
  }

  /** 更新待办项 */
  update(id: string, params: TodoUpdateParams): TodoItem | null {
    const item = this.items.get(id);
    if (!item) return null;

    if (params.content !== undefined) item.content = params.content;
    if (params.status !== undefined) item.status = params.status;
    item.updatedAt = Date.now();

    this.emitChange();
    return item;
  }

  /** 删除待办项 */
  delete(id: string): boolean {
    const existed = this.items.delete(id);
    if (existed) this.emitChange();
    return existed;
  }

  /** 获取所有待办项 */
  getAll(): TodoItem[] {
    return Array.from(this.items.values());
  }

  /** 按状态过滤 */
  getByStatus(status: TodoStatus): TodoItem[] {
    return this.getAll().filter(item => item.status === status);
  }

  /** 按 stepId 查找 */
  getByStepId(stepId: string): TodoItem | undefined {
    return this.getAll().find(item => item.stepId === stepId);
  }

  /** 清空所有待办项 */
  clear(): void {
    this.items.clear();
    this.emitChange();
  }

  /**
   * 从 AgentPlan 步骤同步待办列表
   * 将 Plan 中的每个步骤映射为一个待办项
   */
  syncFromPlanSteps(steps: Array<{
    id: string;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  }>): void {
    for (const step of steps) {
      const existing = this.getByStepId(step.id);
      const todoStatus = this.mapStepStatus(step.status);

      if (existing) {
        this.update(existing.id, {
          content: step.description,
          status: todoStatus,
        });
      } else {
        this.add(step.description, 'plan', step.id);
        // 新添加的项需要设置正确的状态
        const added = this.getByStepId(step.id);
        if (added && todoStatus !== 'pending') {
          this.update(added.id, { status: todoStatus });
        }
      }
    }
  }

  /** 将 AgentStep 状态映射为 Todo 状态 */
  private mapStepStatus(stepStatus: string): TodoStatus {
    switch (stepStatus) {
      case 'running':
        return 'in_progress';
      case 'completed':
      case 'failed':
      case 'skipped':
        return 'completed';
      default:
        return 'pending';
    }
  }

  /** 触发变更事件，通知 UI 更新 */
  private emitChange(): void {
    window.dispatchEvent(new CustomEvent('agent:todo-changed', {
      detail: { todos: this.getAll() },
    }));
  }

  /** 重置单例（用于测试） */
  static resetInstance(): void {
    TodoStore.instance = null;
  }
}
