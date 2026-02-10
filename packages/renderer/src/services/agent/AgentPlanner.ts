/**
 * Agent 任务规划器
 * 功能：根据用户任务创建执行计划
 * 描述：使用 LLM 分析任务并生成步骤化的执行计划
 */

import {
  AgentTask,
  AgentPlan,
  AgentStep,
  AgentStepType,
  AgentTool,
  AgentExecutionConfig
} from './types';
import { aiService } from '../ai/AIService';
import type { ChatMessage, Tool } from '../../types/aiProvider';

/**
 * 规划器配置
 */
export interface AgentPlannerConfig {
  /** 执行配置 */
  executionConfig: AgentExecutionConfig;
  /** 可用工具列表 */
  availableTools: AgentTool[];
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大规划步骤数 */
  maxPlanSteps?: number;
}

/**
 * 默认系统提示词
 */
const DEFAULT_SYSTEM_PROMPT = `你是一个智能任务规划助手，专门用于笔记写作场景。你的任务是分析用户的需求，并创建一个详细的执行计划。

## 你的能力
1. 分析用户的写作需求和意图
2. 将复杂任务分解为可执行的步骤
3. 决定每个步骤需要使用的工具
4. 评估任务的可行性

## 规划原则
1. 步骤应该清晰、具体、可执行
2. 每个步骤应该有明确的目标
3. 步骤之间应该有合理的顺序
4. 考虑可能的错误情况和回退方案
5. 优先使用简单直接的方法

## 输出格式
请以 JSON 格式输出执行计划，包含以下字段：
{
  "analysis": "对任务的分析和理解",
  "steps": [
    {
      "type": "think|tool_call|write|verify",
      "description": "步骤描述",
      "toolName": "工具名称（如果是 tool_call 类型）",
      "toolParams": {} // 工具参数（如果是 tool_call 类型）
    }
  ],
  "estimatedSteps": 预估总步骤数,
  "risks": ["可能的风险或注意事项"]
}`;

/**
 * Agent 任务规划器类
 */
export class AgentPlanner {
  /** 配置 */
  private config: AgentPlannerConfig;

  constructor(config: AgentPlannerConfig) {
    this.config = {
      ...config,
      systemPrompt: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      maxPlanSteps: config.maxPlanSteps || 20
    };
  }

  /**
   * 为任务创建执行计划
   */
  async createPlan(task: AgentTask): Promise<AgentPlan> {
    console.log(`[AgentPlanner] 开始为任务创建计划: ${task.id}`);

    // 构建提示词
    const messages = this.buildPlanningMessages(task);

    // 构建工具描述
    const toolsDescription = this.buildToolsDescription();

    // 调用 LLM 生成计划
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        {
          role: 'system',
          content: `${this.config.systemPrompt}\n\n## 可用工具\n${toolsDescription}`
        },
        ...messages
      ],
      temperature: this.config.executionConfig.temperature || 0.3,
      maxTokens: this.config.executionConfig.maxTokens || 2000
    });

    // 解析 LLM 响应
    const plan = this.parsePlanResponse(response.content, task);

    console.log(`[AgentPlanner] 计划创建完成，共 ${plan.steps.length} 个步骤`);

    return plan;
  }

  /**
   * 根据执行结果更新计划
   */
  async updatePlan(
    currentPlan: AgentPlan,
    stepResult: { stepId: string; success: boolean; result?: unknown; error?: string }
  ): Promise<AgentPlan> {
    console.log(`[AgentPlanner] 根据步骤 ${stepResult.stepId} 的结果更新计划`);

    // 如果步骤成功，检查是否需要调整后续步骤
    if (stepResult.success) {
      // 简单情况：直接返回当前计划
      return {
        ...currentPlan,
        updatedAt: Date.now()
      };
    }

    // 如果步骤失败，可能需要重新规划
    const failedStep = currentPlan.steps.find(s => s.id === stepResult.stepId);
    if (!failedStep) {
      return currentPlan;
    }

    // 构建重新规划的消息
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `执行步骤失败，需要重新规划。

失败的步骤：${failedStep.description}
错误信息：${stepResult.error}

请分析失败原因，并提供替代方案或修改后的计划。`
      }
    ];

    try {
      const response = await aiService.generateText({
        model: this.config.executionConfig.modelId,
        messages: [
          {
            role: 'system',
            content: this.config.systemPrompt || DEFAULT_SYSTEM_PROMPT
          },
          ...messages
        ],
        temperature: 0.3,
        maxTokens: 1000
      });

      // 解析新的步骤
      const newSteps = this.parseStepsFromResponse(response.content);

      if (newSteps.length > 0) {
        // 替换失败步骤及其后续步骤
        const failedIndex = currentPlan.steps.findIndex(s => s.id === stepResult.stepId);
        const updatedSteps = [
          ...currentPlan.steps.slice(0, failedIndex),
          ...newSteps
        ];

        return {
          ...currentPlan,
          steps: updatedSteps,
          estimatedSteps: updatedSteps.length,
          updatedAt: Date.now()
        };
      }
    } catch (error) {
      console.error('[AgentPlanner] 重新规划失败:', error);
    }

    return currentPlan;
  }

  /**
   * 验证计划是否可执行
   */
  validatePlan(plan: AgentPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查步骤数量
    if (plan.steps.length === 0) {
      errors.push('计划没有任何步骤');
    }

    if (plan.steps.length > (this.config.maxPlanSteps || 20)) {
      errors.push(`步骤数量超过限制 (${plan.steps.length} > ${this.config.maxPlanSteps})`);
    }

    // 检查每个步骤
    for (const step of plan.steps) {
      // 检查工具调用步骤
      if (step.type === 'tool_call' && step.toolCall) {
        const tool = this.config.availableTools.find(t => t.name === step.toolCall?.toolName);
        if (!tool) {
          errors.push(`步骤 "${step.description}" 使用了未知工具: ${step.toolCall.toolName}`);
        }
      }

      // 检查步骤描述
      if (!step.description || step.description.trim().length === 0) {
        errors.push(`步骤 ${step.id} 缺少描述`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 构建规划消息
   */
  private buildPlanningMessages(task: AgentTask): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 构建任务描述
    let taskDescription = `## 任务信息
- 任务类型: ${task.type}
- 任务描述: ${task.description}
`;

    // 添加上下文信息
    if (task.context.currentFile) {
      taskDescription += `- 当前文件: ${task.context.currentFile}\n`;
    }

    if (task.context.selectedText) {
      taskDescription += `- 选中文本:\n\`\`\`\n${task.context.selectedText}\n\`\`\`\n`;
    }

    if (task.context.workspacePath) {
      taskDescription += `- 工作区路径: ${task.context.workspacePath}\n`;
    }

    // 添加约束信息
    if (task.constraints) {
      taskDescription += `\n## 约束条件\n`;
      if (task.constraints.allowedTools) {
        taskDescription += `- 允许使用的工具: ${task.constraints.allowedTools.join(', ')}\n`;
      }
      if (task.constraints.maxSteps) {
        taskDescription += `- 最大步骤数: ${task.constraints.maxSteps}\n`;
      }
      if (task.constraints.allowFileWrite === false) {
        taskDescription += `- 不允许写入文件\n`;
      }
      if (task.constraints.allowCommandExecution === false) {
        taskDescription += `- 不允许执行命令\n`;
      }
    }

    messages.push({
      role: 'user',
      content: `请为以下任务创建执行计划：\n\n${taskDescription}`
    });

    return messages;
  }

  /**
   * 构建工具描述
   */
  private buildToolsDescription(): string {
    if (this.config.availableTools.length === 0) {
      return '当前没有可用的工具。';
    }

    const toolDescriptions = this.config.availableTools.map(tool => {
      let desc = `### ${tool.name}\n${tool.description}\n`;

      if (tool.parameters.properties) {
        desc += '参数:\n';
        for (const [key, schema] of Object.entries(tool.parameters.properties)) {
          const paramSchema = schema as { type: string; description?: string };
          desc += `- ${key} (${paramSchema.type}): ${paramSchema.description || ''}\n`;
        }
      }

      if (tool.requiresConfirmation) {
        desc += '⚠️ 此工具需要用户确认后才能执行\n';
      }

      return desc;
    });

    return toolDescriptions.join('\n');
  }

  /**
   * 解析 LLM 响应为执行计划
   */
  private parsePlanResponse(response: string, task: AgentTask): AgentPlan {
    try {
      // 尝试从响应中提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        const steps: AgentStep[] = (parsed.steps || []).map((step: any, index: number) => ({
          id: `step_${Date.now()}_${index}`,
          type: this.normalizeStepType(step.type),
          description: step.description || `步骤 ${index + 1}`,
          status: 'pending' as const,
          toolCall: step.toolName ? {
            toolName: step.toolName,
            parameters: step.toolParams || {}
          } : undefined
        }));

        return {
          taskId: task.id,
          steps,
          estimatedSteps: parsed.estimatedSteps || steps.length,
          currentStepIndex: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    } catch (error) {
      console.warn('[AgentPlanner] 解析 JSON 响应失败，尝试文本解析:', error);
    }

    // 如果 JSON 解析失败，尝试从文本中提取步骤
    const steps = this.parseStepsFromText(response);

    return {
      taskId: task.id,
      steps,
      estimatedSteps: steps.length,
      currentStepIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 从响应中解析步骤
   */
  private parseStepsFromResponse(response: string): AgentStep[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.steps && Array.isArray(parsed.steps)) {
          return parsed.steps.map((step: any, index: number) => ({
            id: `step_${Date.now()}_${index}`,
            type: this.normalizeStepType(step.type),
            description: step.description || `步骤 ${index + 1}`,
            status: 'pending' as const,
            toolCall: step.toolName ? {
              toolName: step.toolName,
              parameters: step.toolParams || {}
            } : undefined
          }));
        }
      }
    } catch (error) {
      console.warn('[AgentPlanner] 解析步骤失败:', error);
    }

    return this.parseStepsFromText(response);
  }

  /**
   * 从文本中解析步骤（备用方案）
   */
  private parseStepsFromText(text: string): AgentStep[] {
    const steps: AgentStep[] = [];

    // 尝试匹配编号列表格式
    const listPattern = /(?:^|\n)\s*(?:\d+[\.\)]\s*|[-*]\s*)(.+)/g;
    let match;
    let index = 0;

    while ((match = listPattern.exec(text)) !== null) {
      const description = match[1].trim();
      if (description.length > 0) {
        steps.push({
          id: `step_${Date.now()}_${index}`,
          type: this.inferStepType(description),
          description,
          status: 'pending'
        });
        index++;
      }
    }

    // 如果没有找到列表格式，创建一个默认步骤
    if (steps.length === 0) {
      steps.push({
        id: `step_${Date.now()}_0`,
        type: 'think',
        description: '分析任务并执行',
        status: 'pending'
      });
    }

    return steps;
  }

  /**
   * 标准化步骤类型
   */
  private normalizeStepType(type: string): AgentStepType {
    const typeMap: Record<string, AgentStepType> = {
      'think': 'think',
      'thinking': 'think',
      'analyze': 'think',
      'tool_call': 'tool_call',
      'tool': 'tool_call',
      'call': 'tool_call',
      'write': 'write',
      'output': 'write',
      'verify': 'verify',
      'check': 'verify',
      'validate': 'verify',
      'wait_confirmation': 'wait_confirmation',
      'confirm': 'wait_confirmation'
    };

    return typeMap[type?.toLowerCase()] || 'think';
  }

  /**
   * 从描述推断步骤类型
   */
  private inferStepType(description: string): AgentStepType {
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('验证') || lowerDesc.includes('检查') || lowerDesc.includes('确认')) {
      return 'verify';
    }

    if (lowerDesc.includes('写入') || lowerDesc.includes('输出') || lowerDesc.includes('生成')) {
      return 'write';
    }

    if (lowerDesc.includes('调用') || lowerDesc.includes('使用') || lowerDesc.includes('执行')) {
      return 'tool_call';
    }

    return 'think';
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AgentPlannerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): AgentTool[] {
    return [...this.config.availableTools];
  }

  /**
   * 添加工具
   */
  addTool(tool: AgentTool): void {
    const existingIndex = this.config.availableTools.findIndex(t => t.name === tool.name);
    if (existingIndex >= 0) {
      this.config.availableTools[existingIndex] = tool;
    } else {
      this.config.availableTools.push(tool);
    }
  }

  /**
   * 移除工具
   */
  removeTool(toolName: string): void {
    this.config.availableTools = this.config.availableTools.filter(t => t.name !== toolName);
  }
}
