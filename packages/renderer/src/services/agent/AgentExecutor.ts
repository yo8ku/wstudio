/**
 * Agent 任务执行器
 * 功能：执行 Agent 的任务计划
 * 描述：实现 plan → execute → observe → verify 的工作流循环
 */

import {
  AgentTask,
  AgentPlan,
  AgentStep,
  AgentState,
  AgentExecutionConfig,
  ToolResult,
  ConfirmationRequest,
  DiffChange,
  LineChange,
  FileChange
} from './types';
import { AgentStateManager } from './AgentStateManager';
import { AgentMemory } from './AgentMemory';
import { AgentPlanner } from './AgentPlanner';
import { ToolRegistry } from './tools/ToolRegistry';
import { aiService } from '../ai/AIService';
import type { ChatMessage, StreamCallback } from '../../types/aiProvider';

/**
 * 执行器配置
 */
export interface AgentExecutorConfig {
  /** 执行配置 */
  executionConfig: AgentExecutionConfig;
  /** 状态管理器 */
  stateManager: AgentStateManager;
  /** 记忆管理器 */
  memory: AgentMemory;
  /** 任务规划器 */
  planner: AgentPlanner;
  /** 工具注册表 */
  toolRegistry: ToolRegistry;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  /** 是否成功 */
  success: boolean;
  /** 任务 ID */
  taskId: string;
  /** 最终输出 */
  output?: string;
  /** 文件变更 */
  changes?: FileChange[];
  /** 差异变更（用于 UI 显示） */
  diffChanges?: DiffChange[];
  /** 错误信息 */
  error?: string;
  /** 执行统计 */
  stats?: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    totalDuration: number;
  };
}

/**
 * 默认系统提示词
 */
const DEFAULT_EXECUTOR_PROMPT = `你是一个智能写作助手，正在执行用户的任务。

## 执行原则
1. 严格按照计划执行每个步骤
2. 每个步骤完成后，评估结果并决定下一步
3. 如果遇到问题，尝试调整方案
4. 保持输出简洁、准确

## 输出格式
对于每个步骤，请输出：
1. 当前步骤的执行结果
2. 下一步的计划（如果有）
3. 如果需要调用工具，请明确指出工具名称和参数`;

/**
 * Agent 任务执行器类
 */
export class AgentExecutor {
  /** 配置 */
  private config: AgentExecutorConfig;

  /** 是否已中断 */
  private interrupted: boolean = false;

  /** 当前 AbortController */
  private abortController: AbortController | null = null;

  /** 文件变更记录 */
  private fileChanges: FileChange[] = [];

  constructor(config: AgentExecutorConfig) {
    this.config = {
      ...config,
      systemPrompt: config.systemPrompt || DEFAULT_EXECUTOR_PROMPT,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  /**
   * 执行任务
   */
  async execute(task: AgentTask): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.interrupted = false;
    this.fileChanges = [];
    this.abortController = new AbortController();

    const { stateManager, memory, planner } = this.config;

    try {
      // 设置当前任务
      stateManager.setCurrentTask(task);
      stateManager.transitionTo(AgentState.PLANNING, '开始规划任务');

      // 添加用户消息到记忆
      memory.addUserMessage(task.description, task.id);

      // 创建执行计划
      console.log(`[AgentExecutor] 开始为任务 ${task.id} 创建计划`);
      const plan = await planner.createPlan(task);

      // 验证计划
      const validation = planner.validatePlan(plan);
      if (!validation.valid) {
        throw new Error(`计划验证失败: ${validation.errors.join('; ')}`);
      }

      stateManager.setCurrentPlan(plan);
      stateManager.transitionTo(AgentState.EXECUTING, '开始执行计划');

      // 执行计划
      const result = await this.executePlan(task, plan);

      // 完成任务
      stateManager.transitionTo(AgentState.COMPLETED, '任务完成');

      const duration = Date.now() - startTime;
      const stats = this.calculateStats(plan, duration);

      return {
        success: true,
        taskId: task.id,
        output: result.output,
        changes: this.fileChanges,
        diffChanges: result.diffChanges,
        stats
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AgentExecutor] 任务执行失败:`, error);

      stateManager.transitionTo(AgentState.ERROR, errorMessage);

      return {
        success: false,
        taskId: task.id,
        error: errorMessage,
        changes: this.fileChanges,
        stats: {
          totalSteps: stateManager.getCurrentPlan()?.steps.length || 0,
          completedSteps: stateManager.getCurrentPlan()?.steps.filter(s => s.status === 'completed').length || 0,
          failedSteps: stateManager.getCurrentPlan()?.steps.filter(s => s.status === 'failed').length || 0,
          totalDuration: Date.now() - startTime
        }
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 执行计划
   */
  private async executePlan(
    task: AgentTask,
    plan: AgentPlan
  ): Promise<{ output: string; diffChanges?: DiffChange[] }> {
    const { stateManager, memory } = this.config;
    let output = '';
    const diffChanges: DiffChange[] = [];

    while (true) {
      // 检查是否已中断
      if (this.interrupted) {
        throw new Error('任务已被中断');
      }

      // 获取当前步骤
      const currentStep = stateManager.getCurrentStep();
      if (!currentStep) {
        // 所有步骤已完成
        break;
      }

      console.log(`[AgentExecutor] 执行步骤: ${currentStep.id} - ${currentStep.description}`);

      // 更新步骤状态为运行中
      stateManager.updateStepStatus(currentStep.id, 'running');

      try {
        // 执行步骤
        const stepResult = await this.executeStep(task, currentStep);

        // 更新步骤状态
        stateManager.updateStepStatus(
          currentStep.id,
          'completed',
          stepResult.result
        );

        // 收集输出
        if (stepResult.output) {
          output += stepResult.output + '\n';

          // 检查输出是否包含新的计划，并动态添加步骤
          const newSteps = this.extractNewStepsFromOutput(stepResult.output);
          if (newSteps.length > 0) {
            console.log(`[AgentExecutor] 检测到 ${newSteps.length} 个新步骤，动态添加到执行队列`);
            this.insertStepsAfterCurrent(newSteps);
          }
        }

        // 收集差异变更
        if (stepResult.diffChanges) {
          diffChanges.push(...stepResult.diffChanges);
        }

        // 添加到记忆
        memory.addAssistantMessage(
          `步骤 "${currentStep.description}" 完成: ${JSON.stringify(stepResult.result)}`,
          task.id,
          currentStep.id
        );

        // 移动到下一步
        const nextStep = stateManager.moveToNextStep();
        if (!nextStep) {
          // 所有步骤已完成
          break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // 尝试重试
        const retried = await this.retryStep(task, currentStep, errorMessage);
        if (!retried) {
          stateManager.updateStepStatus(currentStep.id, 'failed', undefined, errorMessage);
          throw error;
        }
      }
    }

    return { output: output.trim(), diffChanges };
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{
    result: unknown;
    output?: string;
    diffChanges?: DiffChange[];
  }> {
    const { stateManager, memory, toolRegistry } = this.config;

    switch (step.type) {
      case 'think':
        return this.executeThinkStep(task, step);

      case 'tool_call':
        return this.executeToolCallStep(task, step);

      case 'write':
        return this.executeWriteStep(task, step);

      case 'verify':
        return this.executeVerifyStep(task, step);

      case 'wait_confirmation':
        return this.executeWaitConfirmationStep(task, step);

      default:
        throw new Error(`未知的步骤类型: ${step.type}`);
    }
  }

  /**
   * 执行思考步骤
   */
  private async executeThinkStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string }> {
    const { memory } = this.config;

    // 构建消息
    const messages = memory.toChatMessages({ taskId: task.id });
    messages.push({
      role: 'user',
      content: `请执行以下步骤: ${step.description}\n\n请分析并给出你的思考过程和结论。`
    });

    // 调用 LLM
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        { role: 'system', content: this.config.systemPrompt || DEFAULT_EXECUTOR_PROMPT },
        ...messages
      ],
      temperature: this.config.executionConfig.temperature || 0.7,
      maxTokens: this.config.executionConfig.maxTokens || 2000,
      signal: this.abortController?.signal
    });

    return {
      result: { thinking: response.content },
      output: response.content
    };
  }

  /**
   * 执行工具调用步骤
   */
  private async executeToolCallStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string; diffChanges?: DiffChange[] }> {
    const { toolRegistry, stateManager, memory } = this.config;

    if (!step.toolCall) {
      throw new Error('工具调用步骤缺少工具信息');
    }

    const { toolName, parameters } = step.toolCall;

    // 检查工具是否存在
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`工具 "${toolName}" 不存在`);
    }

    // 检查是否需要用户确认
    if (tool.requiresConfirmation) {
      const confirmationRequest: ConfirmationRequest = {
        id: `confirm_${Date.now()}`,
        type: 'custom',
        description: `工具 "${toolName}" 需要确认执行`,
        createdAt: Date.now()
      };

      stateManager.setConfirmationRequest(confirmationRequest);

      // 等待用户确认
      // 这里需要外部机制来处理确认响应
      // 暂时跳过确认，直接执行
      console.log(`[AgentExecutor] 工具 ${toolName} 需要确认，暂时跳过确认直接执行`);
    }

    // 执行工具
    const toolResult = await toolRegistry.execute(toolName, parameters);

    // 记录工具调用结果
    memory.addToolResult(toolName, toolResult, task.id, step.id);

    // 收集文件变更
    if (toolResult.changes) {
      this.fileChanges.push(...toolResult.changes);
    }

    // 生成差异变更（如果有文件变更）
    let diffChanges: DiffChange[] | undefined;
    if (toolResult.changes && toolResult.changes.length > 0) {
      diffChanges = this.generateDiffChanges(toolResult.changes);
    }

    return {
      result: toolResult,
      output: toolResult.success
        ? `工具 ${toolName} 执行成功`
        : `工具 ${toolName} 执行失败: ${toolResult.error}`,
      diffChanges
    };
  }

  /**
   * 执行写入步骤
   */
  private async executeWriteStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string; diffChanges?: DiffChange[] }> {
    const { memory } = this.config;

    // 构建消息
    const messages = memory.toChatMessages({ taskId: task.id });
    messages.push({
      role: 'user',
      content: `请执行以下写入任务: ${step.description}\n\n请生成需要写入的内容。`
    });

    // 调用 LLM 生成内容
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        { role: 'system', content: this.config.systemPrompt || DEFAULT_EXECUTOR_PROMPT },
        ...messages
      ],
      temperature: this.config.executionConfig.temperature || 0.7,
      maxTokens: this.config.executionConfig.maxTokens || 4000,
      signal: this.abortController?.signal
    });

    return {
      result: { content: response.content },
      output: response.content
    };
  }

  /**
   * 执行验证步骤
   */
  private async executeVerifyStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string }> {
    const { memory, stateManager } = this.config;

    // 获取已完成的步骤结果
    const plan = stateManager.getCurrentPlan();
    const completedSteps = plan?.steps.filter(s => s.status === 'completed') || [];

    // 构建验证消息
    const messages = memory.toChatMessages({ taskId: task.id });
    messages.push({
      role: 'user',
      content: `请验证以下任务的执行结果:

任务描述: ${task.description}

已完成的步骤:
${completedSteps.map(s => `- ${s.description}: ${JSON.stringify(s.result)}`).join('\n')}

请检查:
1. 任务是否已正确完成
2. 输出是否符合预期
3. 是否有任何问题需要修复

请给出验证结论。`
    });

    // 调用 LLM 进行验证
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        { role: 'system', content: this.config.systemPrompt || DEFAULT_EXECUTOR_PROMPT },
        ...messages
      ],
      temperature: 0.3,
      maxTokens: 1000,
      signal: this.abortController?.signal
    });

    return {
      result: { verification: response.content },
      output: response.content
    };
  }

  /**
   * 执行等待确认步骤
   */
  private async executeWaitConfirmationStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string }> {
    const { stateManager } = this.config;

    // 创建确认请求
    const confirmationRequest: ConfirmationRequest = {
      id: `confirm_${Date.now()}`,
      type: 'custom',
      description: step.description,
      createdAt: Date.now()
    };

    stateManager.setConfirmationRequest(confirmationRequest);

    // 等待确认（这里需要外部机制来处理）
    // 暂时返回成功
    return {
      result: { confirmed: true },
      output: '等待用户确认...'
    };
  }

  /**
   * 重试步骤
   */
  private async retryStep(
    task: AgentTask,
    step: AgentStep,
    error: string
  ): Promise<boolean> {
    const maxRetries = this.config.maxRetries || 3;
    const retryDelay = this.config.retryDelay || 1000;

    // 简单的重试逻辑
    // 实际实现中可能需要更复杂的重试策略
    console.log(`[AgentExecutor] 步骤 ${step.id} 执行失败，尝试重试...`);

    // 等待一段时间后重试
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    // 这里可以实现更复杂的重试逻辑
    // 例如：调整参数、使用备用方案等

    return false; // 暂时不支持自动重试
  }

  /**
   * 生成差异变更
   */
  private generateDiffChanges(fileChanges: FileChange[]): DiffChange[] {
    return fileChanges.map(change => {
      const lineChanges = this.computeLineChanges(
        change.originalContent || '',
        change.newContent || ''
      );

      return {
        type: change.type === 'create' ? 'add' : change.type === 'delete' ? 'delete' : 'modify',
        filePath: change.filePath,
        originalContent: change.originalContent || '',
        newContent: change.newContent || '',
        lineChanges
      };
    });
  }

  /**
   * 计算行级别变更
   */
  private computeLineChanges(original: string, modified: string): LineChange[] {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const changes: LineChange[] = [];

    // 简单的行对比算法
    // 实际实现中可以使用更复杂的 diff 算法（如 Myers diff）
    const maxLines = Math.max(originalLines.length, modifiedLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i];
      const modifiedLine = modifiedLines[i];

      if (originalLine === undefined && modifiedLine !== undefined) {
        // 新增行
        changes.push({
          lineNumber: i + 1,
          type: 'add',
          content: modifiedLine
        });
      } else if (originalLine !== undefined && modifiedLine === undefined) {
        // 删除行
        changes.push({
          lineNumber: i + 1,
          type: 'delete',
          content: originalLine,
          originalLineNumber: i + 1
        });
      } else if (originalLine !== modifiedLine) {
        // 修改行（先删除后添加）
        changes.push({
          lineNumber: i + 1,
          type: 'delete',
          content: originalLine,
          originalLineNumber: i + 1
        });
        changes.push({
          lineNumber: i + 1,
          type: 'add',
          content: modifiedLine
        });
      } else {
        // 未变更行
        changes.push({
          lineNumber: i + 1,
          type: 'unchanged',
          content: originalLine
        });
      }
    }

    return changes;
  }

  /**
   * 计算执行统计
   */
  private calculateStats(
    plan: AgentPlan,
    duration: number
  ): ExecutionResult['stats'] {
    return {
      totalSteps: plan.steps.length,
      completedSteps: plan.steps.filter(s => s.status === 'completed').length,
      failedSteps: plan.steps.filter(s => s.status === 'failed').length,
      totalDuration: duration
    };
  }

  /**
   * 从输出中提取新的步骤
   * 检测 LLM 输出中的 "下一步"、"接下来" 等关键词，并提取对应的计划
   */
  private extractNewStepsFromOutput(output: string): AgentStep[] {
    const steps: AgentStep[] = [];

    // 匹配 "下一步：xxx" 或 "下一步计划：xxx" 等模式
    const patterns = [
      /下一步[计划]?[：:]\s*(.+?)(?=\n\n|\n下一步|\n接下来|$)/gs,
      /接下来[：:]\s*(.+?)(?=\n\n|\n下一步|\n接下来|$)/gs,
      /然后[需要]?[：:]\s*(.+?)(?=\n\n|\n下一步|\n接下来|$)/gs,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const description = match[1].trim();
        // 过滤掉太短或太长的描述
        if (description.length > 5 && description.length < 200) {
          // 检查是否已经存在相同描述的步骤
          const exists = steps.some(s => s.description === description);
          if (!exists) {
            steps.push({
              id: `step_dynamic_${Date.now()}_${steps.length}`,
              type: 'write', // 默认为 write 类型
              description,
              status: 'pending'
            });
          }
        }
      }
    }

    return steps;
  }

  /**
   * 在当前步骤之后插入新的步骤
   */
  private insertStepsAfterCurrent(newSteps: AgentStep[]): void {
    const { stateManager } = this.config;
    const currentPlan = stateManager.getCurrentPlan();

    if (!currentPlan || newSteps.length === 0) {
      return;
    }

    // 获取当前步骤索引
    const currentIndex = currentPlan.currentStepIndex;

    // 在当前步骤之后插入新步骤
    currentPlan.steps.splice(currentIndex + 1, 0, ...newSteps);

    // 更新计划
    stateManager.updateCurrentPlan({
      steps: currentPlan.steps,
      estimatedSteps: currentPlan.steps.length
    });

    console.log(`[AgentExecutor] 已在步骤 ${currentIndex} 之后插入 ${newSteps.length} 个新步骤`);
  }

  /**
   * 中断执行
   */
  interrupt(): void {
    this.interrupted = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    console.log('[AgentExecutor] 执行已中断');
  }

  /**
   * 检查是否已中断
   */
  isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * 流式执行任务（支持实时输出）
   */
  async executeStream(
    task: AgentTask,
    callbacks: {
      onStepStart?: (step: AgentStep) => void;
      onStepComplete?: (step: AgentStep, result: unknown) => void;
      onContent?: (content: string) => void;
      onThinking?: (thinking: string) => void;
      onToolCall?: (toolName: string, params: Record<string, unknown>) => void;
      onToolResult?: (toolName: string, result: ToolResult) => void;
      onDiffGenerated?: (diff: DiffChange) => void;
      onComplete?: (result: ExecutionResult) => void;
      onError?: (error: Error) => void;
    }
  ): Promise<ExecutionResult> {
    // 注册事件监听器
    const { stateManager } = this.config;

    const unsubscribers: Array<() => void> = [];

    if (callbacks.onStepStart) {
      unsubscribers.push(
        stateManager.on('step_start', event => {
          callbacks.onStepStart?.(event.data as AgentStep);
        })
      );
    }

    if (callbacks.onStepComplete) {
      unsubscribers.push(
        stateManager.on('step_complete', event => {
          const step = event.data as AgentStep;
          callbacks.onStepComplete?.(step, step.result);
        })
      );
    }

    if (callbacks.onToolCall) {
      unsubscribers.push(
        stateManager.on('tool_call', event => {
          const { toolName, params } = event.data as { toolName: string; params: Record<string, unknown> };
          callbacks.onToolCall?.(toolName, params);
        })
      );
    }

    if (callbacks.onToolResult) {
      unsubscribers.push(
        stateManager.on('tool_result', event => {
          const { toolName, result } = event.data as { toolName: string; result: ToolResult };
          callbacks.onToolResult?.(toolName, result);
        })
      );
    }

    if (callbacks.onDiffGenerated) {
      unsubscribers.push(
        stateManager.on('diff_generated', event => {
          callbacks.onDiffGenerated?.(event.data as DiffChange);
        })
      );
    }

    try {
      const result = await this.execute(task);

      if (callbacks.onComplete) {
        callbacks.onComplete(result);
      }

      return result;
    } catch (error) {
      if (callbacks.onError) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    } finally {
      // 清理事件监听器
      unsubscribers.forEach(unsub => unsub());
    }
  }
}
