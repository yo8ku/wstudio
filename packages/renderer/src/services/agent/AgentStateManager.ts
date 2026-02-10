/**
 * Agent 状态管理器
 * 功能：管理 Agent 的状态转换和事件通知
 * 描述：提供状态机管理、事件发布订阅、状态持久化等功能
 */

import {
  AgentState,
  AgentEvent,
  AgentEventType,
  AgentEventListener,
  AgentTask,
  AgentPlan,
  AgentStep,
  ConfirmationRequest,
  ConfirmationResponse
} from './types';

/**
 * 状态转换规则
 * 定义从一个状态可以转换到哪些状态
 */
const STATE_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.IDLE]: [AgentState.PLANNING, AgentState.ERROR],
  [AgentState.PLANNING]: [AgentState.EXECUTING, AgentState.ERROR, AgentState.INTERRUPTED, AgentState.IDLE],
  [AgentState.EXECUTING]: [AgentState.WAITING, AgentState.COMPLETED, AgentState.ERROR, AgentState.INTERRUPTED, AgentState.PLANNING],
  [AgentState.WAITING]: [AgentState.EXECUTING, AgentState.COMPLETED, AgentState.ERROR, AgentState.INTERRUPTED],
  [AgentState.COMPLETED]: [AgentState.IDLE],
  [AgentState.ERROR]: [AgentState.IDLE, AgentState.PLANNING],
  [AgentState.INTERRUPTED]: [AgentState.IDLE, AgentState.PLANNING, AgentState.EXECUTING]
};

/**
 * Agent 状态管理器类
 */
export class AgentStateManager {
  /** 当前状态 */
  private currentState: AgentState = AgentState.IDLE;

  /** 当前任务 */
  private currentTask: AgentTask | null = null;

  /** 当前执行计划 */
  private currentPlan: AgentPlan | null = null;

  /** 待处理的确认请求 */
  private pendingConfirmation: ConfirmationRequest | null = null;

  /** 事件监听器映射 */
  private listeners: Map<AgentEventType | '*', Set<AgentEventListener>> = new Map();

  /** 状态历史记录 */
  private stateHistory: Array<{ state: AgentState; timestamp: number }> = [];

  /** 最大历史记录数 */
  private maxHistorySize: number = 100;

  constructor() {
    this.stateHistory.push({
      state: this.currentState,
      timestamp: Date.now()
    });
  }

  /**
   * 获取当前状态
   */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * 获取当前任务
   */
  getCurrentTask(): AgentTask | null {
    return this.currentTask;
  }

  /**
   * 获取当前执行计划
   */
  getCurrentPlan(): AgentPlan | null {
    return this.currentPlan;
  }

  /**
   * 获取待处理的确认请求
   */
  getPendingConfirmation(): ConfirmationRequest | null {
    return this.pendingConfirmation;
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransitionTo(targetState: AgentState): boolean {
    const allowedTransitions = STATE_TRANSITIONS[this.currentState];
    return allowedTransitions.includes(targetState);
  }

  /**
   * 转换到新状态
   */
  transitionTo(newState: AgentState, reason?: string): boolean {
    if (!this.canTransitionTo(newState)) {
      console.warn(
        `[AgentStateManager] 无效的状态转换: ${this.currentState} -> ${newState}`
      );
      return false;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // 记录状态历史
    this.stateHistory.push({
      state: newState,
      timestamp: Date.now()
    });

    // 限制历史记录大小
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }

    // 发布状态变更事件
    this.emit({
      type: 'state_change',
      data: {
        previousState,
        currentState: newState,
        reason
      },
      timestamp: Date.now(),
      taskId: this.currentTask?.id
    });

    console.log(
      `[AgentStateManager] 状态转换: ${previousState} -> ${newState}${reason ? ` (${reason})` : ''}`
    );

    return true;
  }

  /**
   * 设置当前任务
   */
  setCurrentTask(task: AgentTask | null): void {
    this.currentTask = task;

    if (task) {
      console.log(`[AgentStateManager] 设置当前任务: ${task.id} - ${task.description}`);
    } else {
      console.log('[AgentStateManager] 清除当前任务');
    }
  }

  /**
   * 设置当前执行计划
   */
  setCurrentPlan(plan: AgentPlan | null): void {
    this.currentPlan = plan;

    if (plan) {
      this.emit({
        type: 'plan_created',
        data: plan,
        timestamp: Date.now(),
        taskId: this.currentTask?.id
      });
    }
  }

  /**
   * 更新当前计划
   */
  updateCurrentPlan(updates: Partial<AgentPlan>): void {
    if (!this.currentPlan) {
      console.warn('[AgentStateManager] 没有当前计划可更新');
      return;
    }

    this.currentPlan = {
      ...this.currentPlan,
      ...updates,
      updatedAt: Date.now()
    };

    this.emit({
      type: 'plan_updated',
      data: this.currentPlan,
      timestamp: Date.now(),
      taskId: this.currentTask?.id
    });
  }

  /**
   * 更新步骤状态
   */
  updateStepStatus(
    stepId: string,
    status: AgentStep['status'],
    result?: unknown,
    error?: string
  ): void {
    if (!this.currentPlan) {
      console.warn('[AgentStateManager] 没有当前计划');
      return;
    }

    const stepIndex = this.currentPlan.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      console.warn(`[AgentStateManager] 未找到步骤: ${stepId}`);
      return;
    }

    const step = this.currentPlan.steps[stepIndex];
    const updatedStep: AgentStep = {
      ...step,
      status,
      result,
      error,
      ...(status === 'running' ? { startedAt: Date.now() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedAt: Date.now() } : {})
    };

    this.currentPlan.steps[stepIndex] = updatedStep;
    this.currentPlan.updatedAt = Date.now();

    // 发布步骤事件
    if (status === 'running') {
      this.emit({
        type: 'step_start',
        data: updatedStep,
        timestamp: Date.now(),
        taskId: this.currentTask?.id,
        stepId
      });
    } else if (status === 'completed') {
      this.emit({
        type: 'step_complete',
        data: updatedStep,
        timestamp: Date.now(),
        taskId: this.currentTask?.id,
        stepId
      });
    } else if (status === 'failed') {
      this.emit({
        type: 'step_error',
        data: { step: updatedStep, error },
        timestamp: Date.now(),
        taskId: this.currentTask?.id,
        stepId
      });
    }
  }

  /**
   * 设置待处理的确认请求
   */
  setConfirmationRequest(request: ConfirmationRequest | null): void {
    this.pendingConfirmation = request;

    if (request) {
      this.transitionTo(AgentState.WAITING, '等待用户确认');
      this.emit({
        type: 'confirmation_required',
        data: request,
        timestamp: Date.now(),
        taskId: this.currentTask?.id
      });
    }
  }

  /**
   * 处理确认响应
   */
  handleConfirmationResponse(response: ConfirmationResponse): void {
    if (!this.pendingConfirmation) {
      console.warn('[AgentStateManager] 没有待处理的确认请求');
      return;
    }

    if (response.requestId !== this.pendingConfirmation.id) {
      console.warn('[AgentStateManager] 确认响应 ID 不匹配');
      return;
    }

    this.pendingConfirmation = null;

    // 根据响应决定下一步状态
    if (response.confirmed) {
      this.transitionTo(AgentState.EXECUTING, '用户已确认');
    } else {
      this.transitionTo(AgentState.INTERRUPTED, '用户拒绝');
    }
  }

  /**
   * 中断当前执行
   */
  interrupt(reason?: string): void {
    if (this.canTransitionTo(AgentState.INTERRUPTED)) {
      this.transitionTo(AgentState.INTERRUPTED, reason || '用户中断');
    }
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.currentState = AgentState.IDLE;
    this.currentTask = null;
    this.currentPlan = null;
    this.pendingConfirmation = null;

    this.stateHistory.push({
      state: AgentState.IDLE,
      timestamp: Date.now()
    });

    console.log('[AgentStateManager] 状态已重置');
  }

  /**
   * 添加事件监听器
   */
  on(eventType: AgentEventType | '*', listener: AgentEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // 返回取消订阅函数
    return () => {
      this.off(eventType, listener);
    };
  }

  /**
   * 移除事件监听器
   */
  off(eventType: AgentEventType | '*', listener: AgentEventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 发布事件
   */
  emit(event: AgentEvent): void {
    // 通知特定类型的监听器
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[AgentStateManager] 事件监听器错误:`, error);
        }
      });
    }

    // 通知通配符监听器
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`[AgentStateManager] 通配符监听器错误:`, error);
        }
      });
    }
  }

  /**
   * 获取状态历史
   */
  getStateHistory(): Array<{ state: AgentState; timestamp: number }> {
    return [...this.stateHistory];
  }

  /**
   * 检查是否处于活动状态（非空闲、非完成、非错误）
   */
  isActive(): boolean {
    return ![AgentState.IDLE, AgentState.COMPLETED, AgentState.ERROR].includes(
      this.currentState
    );
  }

  /**
   * 检查是否可以开始新任务
   */
  canStartNewTask(): boolean {
    return this.currentState === AgentState.IDLE;
  }

  /**
   * 获取当前步骤
   */
  getCurrentStep(): AgentStep | null {
    if (!this.currentPlan) {
      return null;
    }
    return this.currentPlan.steps[this.currentPlan.currentStepIndex] || null;
  }

  /**
   * 移动到下一步
   */
  moveToNextStep(): AgentStep | null {
    if (!this.currentPlan) {
      return null;
    }

    const nextIndex = this.currentPlan.currentStepIndex + 1;
    if (nextIndex >= this.currentPlan.steps.length) {
      return null;
    }

    this.currentPlan.currentStepIndex = nextIndex;
    this.currentPlan.updatedAt = Date.now();

    return this.currentPlan.steps[nextIndex];
  }

  /**
   * 获取执行进度
   */
  getProgress(): { current: number; total: number; percentage: number } {
    if (!this.currentPlan) {
      return { current: 0, total: 0, percentage: 0 };
    }

    const completedSteps = this.currentPlan.steps.filter(
      s => s.status === 'completed'
    ).length;
    const total = this.currentPlan.steps.length;
    const percentage = total > 0 ? Math.round((completedSteps / total) * 100) : 0;

    return {
      current: completedSteps,
      total,
      percentage
    };
  }
}

/** 导出单例实例 */
export const agentStateManager = new AgentStateManager();
