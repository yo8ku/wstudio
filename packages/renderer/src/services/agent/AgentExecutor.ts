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
import { AgentPlanner, RANDOM_REFERENCE_ARTICLE_COMMAND } from './AgentPlanner';
import { ToolRegistry } from './tools/ToolRegistry';
import { TodoStore } from './tools/taskmanager/TodoStore';
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
  /** 最后一次写作步骤的正文输出 */
  finalWriteContent?: string;
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
 * 缓存的执行器提示词
 */
let cachedExecutorPrompt: string | null = null;
const LARGE_WORKSPACE_FILE_THRESHOLD = 1200;
const LARGE_WORKSPACE_SCAN_COMMAND = 'rg --files || dir /s /b /a-d';
const VERIFY_GATE_DEFAULT_MIN_SCORE = 85;
const VERIFY_GATE_DEFAULT_MAX_REPAIR_ROUNDS = 1;
const VERIFY_PROMPT_MAX_STEP_SUMMARY_CHARS = 260;
const VERIFY_PROMPT_MAX_DRAFT_CHARS = 9000;
const VERIFY_PROMPT_MAX_COMPLETED_STEPS = 12;
const WRITE_CONTENT_MARKER_REGEX = /(?:^|\n)\s*(?:[#>*-]+\s*)?(?:\*\*)?(?:生成内容如下|最终内容|正文如下|输出如下)(?:\*\*)?\s*(?:[：:]|\n)\s*/i;
const WRITE_PROCEDURE_LINE_REGEX = /^\s*(?:[-*]\s*)?(?:工具|参数|tool|params?)\s*[：:]/i;
const WRITE_PROCEDURE_TOKEN_REGEX = /\b(?:read_file|write_file|edit_file|multi_edit_file|list_files|search_files|run_shell|bash)\b/i;
const WRITE_PROCEDURE_HINT_REGEX = /(我需要先读取|我将先读取|先读取当前文件|先查询工作区|为了.*上下文.*先读取)/i;
const REQUIREMENT_DECOMPOSITION_STEP_REGEX = /(decompose user requirements|structured writing brief|需求拆解|用户需求|写作需求|writing brief)/i;
const REQUIREMENT_TODO_MAX_ITEMS = 18;
const BASH_ARRAY_LENGTH_SYNTAX_REGEX = /\$\{#\w+\[@\]\}/;
const RANDOM_REFERENCE_STEP_REGEX = /(reference article|参考文章|读取参考|抽取参考|随机参考|随机抽取|随机提取|风格参考|style reference|\.md\/\.txt|md\/txt)/i;
const RANDOM_REFERENCE_UNIX_COMMAND_REGEX = /(?:\$\{#\w+\[@\]\}|shuf\s+-n|find\s+\.\s+-type\s+f|ls\s+-la\s+\*\.md\s+\*\.txt|^\s*files=\s*\()/i;

interface VerifyGateSummary {
  passed: boolean;
  score: number;
  issues: string[];
  improvements: string[];
  raw: string;
}

interface RequirementBrief {
  topic?: string;
  objective?: string;
  targetAudience?: string;
  persona?: string;
  styleTone?: string;
  desiredLength?: string;
  sectionHeadings: string[];
  mustInclude: string[];
  mustAvoid: string[];
  acceptanceChecklist: string[];
  raw: string;
}


/**
 * 从 agent-executor.md 加载执行器提示词
 */
async function loadExecutorPrompt(): Promise<string> {
  if (cachedExecutorPrompt !== null) {
    return cachedExecutorPrompt;
  }
  try {
    const response = await fetch(new URL('../../../../prompts/agent/executor.md', import.meta.url));
    if (response.ok) {
      cachedExecutorPrompt = await response.text();
      return cachedExecutorPrompt;
    }
  } catch (error) {
    console.warn('[AgentExecutor] 从文件加载执行器提示词失败:', error);
  }
  cachedExecutorPrompt = '';
  return cachedExecutorPrompt;
}

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

  /** 写入类工具确认回调（ask-before-edit 模式使用） */
  private confirmCallback: ((toolName: string, params: Record<string, unknown>) => Promise<boolean>) | null = null;

  /** 步骤重试计数 */
  private stepRetryCounts: Map<string, number> = new Map();

  /** 流式回调（用于步骤级别内容推送） */
  private streamCallbacks: {
    onContent?: (content: string) => void;
    onThinking?: (thinking: string) => void;
  } | null = null;

  /** 本轮执行中是否已尝试过写作步骤即时落盘 */
  private attemptedInlinePersist: boolean = false;
  /** 本轮执行中是否已触发过大工作区命令扫描 */
  private attemptedLargeWorkspaceScan: boolean = false;
  private verifyRepairRounds: number = 0;
  private verifyLastScore: number | null = null;
  private verifyLastIssueSignature: string = '';
  /** 用户需求拆解（写作约束） */
  private requirementBrief: RequirementBrief | null = null;
  /** 由需求拆解派生的 todo 项 */
  private requirementTodoItems: string[] = [];

  constructor(config: AgentExecutorConfig) {
    this.config = {
      ...config,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000
    };
    // 触发异步加载提示词
    if (!config.systemPrompt) {
      loadExecutorPrompt().then(prompt => {
        if (!this.config.systemPrompt) {
          this.config.systemPrompt = prompt;
        }
      }).catch(console.error);
    }
  }

  /**
   * 更新执行配置
   */
  updateExecutionConfig(config: Partial<AgentExecutionConfig>): void {
    this.config.executionConfig = {
      ...this.config.executionConfig,
      ...config
    };
  }

  /**
   * 执行任务
   */
  async execute(task: AgentTask): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.interrupted = false;
    this.fileChanges = [];
    this.stepRetryCounts.clear();
    this.attemptedInlinePersist = false;
    this.attemptedLargeWorkspaceScan = false;
    this.verifyRepairRounds = 0;
    this.verifyLastScore = null;
    this.verifyLastIssueSignature = '';
    this.requirementBrief = null;
    this.requirementTodoItems = [];
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
      this.rebuildTodoStore();
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
        finalWriteContent: result.finalWriteContent,
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

  private rebuildTodoStore(): void {
    const store = TodoStore.getInstance();
    store.clear();

    const currentPlan = this.config.stateManager.getCurrentPlan();
    if (currentPlan) {
      store.syncFromPlanSteps(currentPlan.steps.map(step => ({
        id: step.id,
        description: step.description,
        status: step.status,
      })));
    }

    for (const todo of this.requirementTodoItems.slice(0, REQUIREMENT_TODO_MAX_ITEMS)) {
      store.add(todo, 'agent');
    }
  }

  private isRequirementDecompositionStep(step: AgentStep): boolean {
    if (step.type !== 'think') return false;
    return REQUIREMENT_DECOMPOSITION_STEP_REGEX.test(step.description || '');
  }

  private normalizeBriefString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
  }

  private pickBriefString(record: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.normalizeBriefString(record[key]);
      if (value) return value;
    }
    return undefined;
  }

  private pickBriefArray(record: Record<string, unknown>, keys: string[]): string[] {
    for (const key of keys) {
      const values = this.parseStringArray(record[key]);
      if (values.length > 0) return values;
    }
    return [];
  }

  private parseRequirementBrief(rawText: string, task: AgentTask): RequirementBrief | null {
    const raw = (rawText || '').trim();
    const parsed = this.tryParseJsonObject(raw);
    const fallbackTopic = task.description.trim().slice(0, 160) || undefined;

    if (!parsed) {
      if (!fallbackTopic) return null;
      return {
        topic: fallbackTopic,
        sectionHeadings: [],
        mustInclude: [],
        mustAvoid: [],
        acceptanceChecklist: ['满足用户输入中的显式要求'],
        raw,
      };
    }

    const topic = this.pickBriefString(parsed, ['topic', 'theme', 'subject', 'title', '主题']);
    const objective = this.pickBriefString(parsed, ['objective', 'goal', 'intent', '核心目标', '目标']);
    const targetAudience = this.pickBriefString(parsed, ['targetAudience', 'audience', 'reader', '受众', '读者']);
    const persona = this.pickBriefString(parsed, ['persona', 'userProfile', '画像', '人群画像']);
    const styleTone = this.pickBriefString(parsed, ['styleTone', 'style', 'tone', '文风', '语气', '风格']);

    let desiredLength = this.pickBriefString(parsed, ['desiredLength', 'length', 'wordCount', '字数']);
    if (!desiredLength && typeof parsed.wordCount === 'number' && Number.isFinite(parsed.wordCount)) {
      desiredLength = `${Math.max(1, Math.floor(parsed.wordCount))} 字`;
    }

    const sectionHeadings = this.pickBriefArray(parsed, ['sectionHeadings', 'subHeadings', 'headings', 'outline', '小标题']);
    const mustInclude = this.pickBriefArray(parsed, ['mustInclude', 'keyPoints', 'requiredPoints', '必须包含']);
    const mustAvoid = this.pickBriefArray(parsed, ['mustAvoid', 'forbidden', 'avoidPoints', '避免项']);
    const acceptanceChecklist = this.pickBriefArray(parsed, ['acceptanceChecklist', 'checklist', '验收清单']);

    return {
      topic: topic || fallbackTopic,
      objective,
      targetAudience,
      persona,
      styleTone,
      desiredLength,
      sectionHeadings,
      mustInclude,
      mustAvoid,
      acceptanceChecklist,
      raw,
    };
  }

  private buildRequirementTodos(brief: RequirementBrief): string[] {
    const todos: string[] = [];

    if (brief.topic) todos.push(`锁定主题：${brief.topic}`);
    if (brief.objective) todos.push(`锁定核心目标：${brief.objective}`);
    if (brief.targetAudience || brief.persona) {
      todos.push(`对齐受众画像：${brief.targetAudience || ''}${brief.persona ? ` / ${brief.persona}` : ''}`.trim());
    }
    if (brief.styleTone) todos.push(`对齐文风语气：${brief.styleTone}`);
    if (brief.desiredLength) todos.push(`控制字数：${brief.desiredLength}`);

    for (const heading of brief.sectionHeadings.slice(0, 8)) {
      todos.push(`完成小标题段落：${heading}`);
    }
    for (const point of brief.mustInclude.slice(0, 8)) {
      todos.push(`必须覆盖：${point}`);
    }
    for (const avoid of brief.mustAvoid.slice(0, 6)) {
      todos.push(`避免偏离：${avoid}`);
    }
    for (const check of brief.acceptanceChecklist.slice(0, 8)) {
      todos.push(`验收项：${check}`);
    }

    todos.push('按需求拆解完成正文，并通过逐句评分验证后再交付');

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of todos) {
      const text = item.trim();
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      deduped.push(text);
      if (deduped.length >= REQUIREMENT_TODO_MAX_ITEMS) break;
    }
    return deduped;
  }

  private applyRequirementBrief(rawText: string, task: AgentTask): RequirementBrief | null {
    const brief = this.parseRequirementBrief(rawText, task);
    if (!brief) return null;
    this.requirementBrief = brief;
    this.requirementTodoItems = this.buildRequirementTodos(brief);
    this.rebuildTodoStore();
    return brief;
  }

  /**
   * 执行计划
   */
  private async executePlan(
    task: AgentTask,
    plan: AgentPlan
  ): Promise<{ output: string; diffChanges?: DiffChange[]; finalWriteContent?: string }> {
    const { stateManager, memory } = this.config;
    let output = '';
    let lastWriteContent = '';
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
      this.rebuildTodoStore();

      try {
        // 执行步骤
        const stepResult = await this.executeStep(task, currentStep);

        if (currentStep.type === 'write') {
          const generatedContent = (stepResult.result as { content?: unknown } | undefined)?.content;
          if (typeof generatedContent === 'string' && generatedContent.trim()) {
            lastWriteContent = generatedContent;
          }
        }

        // 更新步骤状态
        stateManager.updateStepStatus(
          currentStep.id,
          'completed',
          stepResult.result
        );
        this.rebuildTodoStore();
        this.stepRetryCounts.delete(currentStep.id);

        // 收集输出
        if (stepResult.output) {
          output += `${stepResult.output}\n`;
          const chunk = stepResult.output.endsWith('\n')
            ? stepResult.output
            : `${stepResult.output}\n`;
          if (currentStep.type !== 'write') {
            this.streamCallbacks?.onContent?.(chunk);
          }
          if (currentStep.type === 'think') {
            this.streamCallbacks?.onThinking?.(stepResult.output);
          } else if (currentStep.type !== 'write' && currentStep.type !== 'verify') {
            // 检查输出是否包含新的计划，并动态添加步骤
            const newSteps = this.extractNewStepsFromOutput(stepResult.output);
            if (newSteps.length > 0) {
              console.log(`[AgentExecutor] 检测到 ${newSteps.length} 个新步骤，动态添加到执行队列`);
              this.insertStepsAfterCurrent(newSteps);
              this.rebuildTodoStore();
            }
          }
        }

        // 收集差异变更
        if (stepResult.diffChanges) {
          diffChanges.push(...stepResult.diffChanges);
        }

        // 添加到记忆
        memory.addAssistantMessage(
          `步骤 "${currentStep.description}" 完成: ${this.summarizeVerifyResultPayload(stepResult.result)}`,
          task.id,
          currentStep.id
        );

        if (this.shouldEnforceVerifyGate(task, currentStep)) {
          const threshold = this.getVerifyGateScoreThreshold(task);
          const maxRounds = this.getVerifyGateMaxRepairRounds(task);
          const resultPayload = (stepResult.result && typeof stepResult.result === 'object')
            ? (stepResult.result as Record<string, unknown>)
            : null;
          const existingGate = resultPayload?.gate;
          const gate = (existingGate && typeof existingGate === 'object' && !Array.isArray(existingGate))
            ? (existingGate as VerifyGateSummary)
            : this.parseVerifyGateSummary(stepResult.output || '', threshold);

          if (!gate.passed || gate.score < threshold) {
            const issueSignature = gate.issues
              .slice(0, 4)
              .map(item => item.trim().toLowerCase())
              .filter(Boolean)
              .join('|');
            const hasNoProgress = this.verifyLastScore !== null
              && gate.score <= this.verifyLastScore
              && (!issueSignature || issueSignature === this.verifyLastIssueSignature);

            if (this.verifyRepairRounds >= maxRounds || hasNoProgress) {
              const issueHint = gate.issues
                .slice(0, 3)
                .map(item => item.trim())
                .filter(Boolean)
                .join(' | ');
              const failReason = hasNoProgress
                ? `no score improvement after ${this.verifyRepairRounds} repair round(s)`
                : `reached max repair rounds (${maxRounds})`;
              const failMessage = issueHint
                ? `[Verify Gate] score=${gate.score}/${threshold}, ${failReason}. issues: ${issueHint}`
                : `[Verify Gate] score=${gate.score}/${threshold}, ${failReason}.`;
              this.streamCallbacks?.onContent?.(`${failMessage}\n`);
              throw new Error(failMessage);
            }

            this.verifyLastScore = gate.score;
            this.verifyLastIssueSignature = issueSignature;
            this.verifyRepairRounds += 1;
            const loopSteps = this.createVerifyRepairLoopSteps(gate, this.verifyRepairRounds, threshold);
            this.insertStepsAfterCurrent(loopSteps);
            this.rebuildTodoStore();
            const gateMessage = `[Verify Gate] score=${gate.score}/${threshold}, start repair round ${this.verifyRepairRounds}/${maxRounds}.`;
            output += `${gateMessage}\n`;
            this.streamCallbacks?.onContent?.(`${gateMessage}\n`);
          } else {
            this.verifyRepairRounds = 0;
            this.verifyLastScore = null;
            this.verifyLastIssueSignature = '';
          }
        }


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
          this.rebuildTodoStore();
          throw error;
        }
      }
    }

    const currentFile = task.context.currentFile?.trim() || '';
    const currentFileNormalized = currentFile.replace(/\\/g, '/').toLowerCase();
    const hasCurrentFileChanged = currentFileNormalized
      ? this.fileChanges.some(change => change.filePath.replace(/\\/g, '/').toLowerCase() === currentFileNormalized)
      : false;

    if (
      this.shouldAutoPersistWriteOutput(task, lastWriteContent)
      && !this.attemptedInlinePersist
      && !hasCurrentFileChanged
    ) {
      const persistResult = await this.persistWriteOutputToCurrentFile(task, lastWriteContent);
      if (persistResult.diffChanges && persistResult.diffChanges.length > 0) {
        diffChanges.push(...persistResult.diffChanges);
      }
      if (persistResult.message) {
        output += `${output ? '\n' : ''}${persistResult.message}`;
        this.streamCallbacks?.onContent?.(`${persistResult.message}\n`);
      }
    }

    return {
      output: output.trim(),
      diffChanges,
      finalWriteContent: lastWriteContent.trim() || undefined,
    };
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
    const isRequirementStep = this.isRequirementDecompositionStep(step);

    // 构建消息
    const messages = memory.toChatMessages({ taskId: task.id });
    messages.push({
      role: 'user',
      content: isRequirementStep
        ? `请执行以下步骤: ${step.description}

请仅输出 JSON（不要输出额外解释），结构如下：
{
  "topic": string,
  "objective": string,
  "targetAudience": string,
  "persona": string,
  "styleTone": string,
  "desiredLength": string,
  "sectionHeadings": string[],
  "mustInclude": string[],
  "mustAvoid": string[],
  "acceptanceChecklist": string[]
}

要求：
- 没有的信息使用空字符串或空数组，不要编造事实。
- 仅从用户需求和上下文中提取。`
        : `请执行以下步骤: ${step.description}\n\n请分析并给出你的思考过程和结论。`
    });

    // 调用 LLM
    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        { role: 'system', content: this.config.systemPrompt || cachedExecutorPrompt || '' },
        ...messages
      ],
      temperature: this.config.executionConfig.temperature || 0.7,
      maxTokens: this.config.executionConfig.maxTokens || 2000,
      signal: this.abortController?.signal
    });

    const resultPayload: Record<string, unknown> = { thinking: response.content };
    if (isRequirementStep) {
      const brief = this.applyRequirementBrief(response.content, task);
      if (brief) {
        resultPayload.requirementBrief = brief;
        resultPayload.requirementTodos = this.requirementTodoItems;
      }
    }

    return {
      result: resultPayload,
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
      // toolCall 缺失时降级为 think 步骤，避免整个任务失败
      console.warn(`[AgentExecutor] 步骤 "${step.description}" 缺少工具信息，降级为 think 步骤`);
      return this.executeThinkStep(task, step);
    }

    const { toolName } = step.toolCall;
    const rawParameters = (
      step.toolCall.parameters
      && typeof step.toolCall.parameters === 'object'
      && !Array.isArray(step.toolCall.parameters)
    )
      ? step.toolCall.parameters
      : {};
    const {
      parameters: normalizedParameters,
      message: normalizationMessage,
    } = this.normalizeBashCommandForCurrentShell(step, toolName, rawParameters);

    // 检查工具是否存在
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`工具 "${toolName}" 不存在`);
    }

    // 发射工具调用事件，供 UI 时间线展示
    stateManager.emit({
      type: 'tool_call',
      data: { toolName, params: normalizedParameters },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    // 命令执行约束
    if (task.constraints?.allowCommandExecution === false && this.isCommandTool(toolName)) {
      return {
        result: { blocked: true },
        output: `当前模式不允许执行命令（工具: ${toolName}）`
      };
    }

    // 文件写入约束
    if (task.constraints?.allowFileWrite === false && this.isFileWriteTool(toolName)) {
      return {
        result: { blocked: true },
        output: `当前模式不允许写入文件（工具: ${toolName}）`
      };
    }

    // 检查是否需要用户确认
    if (tool.requiresConfirmation && this.confirmCallback) {
      const allowed = await this.confirmCallback(toolName, normalizedParameters);
      if (!allowed) {
        return {
          result: { skipped: true },
          output: `用户拒绝了工具 "${toolName}" 的执行`
        };
      }
    }

    // 执行工具
    const toolResult = await toolRegistry.execute(toolName, normalizedParameters);

    stateManager.emit({
      type: 'tool_result',
      data: { toolName, result: toolResult },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    // 记录工具调用结果
    memory.addToolResult(toolName, toolResult, task.id, step.id);

    let effectiveResult = toolResult;
    let fallbackMessage: string | undefined;
    if (this.isReadFileDirectoryError(toolName, toolResult)) {
      const fallback = await this.tryFallbackListFilesForReadDirectory(task, step, normalizedParameters);
      if (fallback) {
        effectiveResult = fallback.result;
        fallbackMessage = fallback.message;
      }
    }

    const supplementalMessage = await this.runLargeWorkspaceScanIfNeeded(
      task,
      step,
      toolName,
      toolResult
    );

    // 收集文件变更
    if (effectiveResult.changes) {
      this.fileChanges.push(...effectiveResult.changes);
    }

    // 生成差异变更（如果有文件变更）
    let diffChanges: DiffChange[] | undefined;
    if (effectiveResult.changes && effectiveResult.changes.length > 0) {
      diffChanges = this.generateDiffChanges(effectiveResult.changes);
      for (const diff of diffChanges) {
        stateManager.emit({
          type: 'diff_generated',
          data: diff,
          timestamp: Date.now(),
          taskId: task.id,
          stepId: step.id
        });
      }
    }

    return {
      result: effectiveResult,
      // tool_call 步骤不产生用户可见的输出，结果已存入记忆供后续步骤使用
      output: effectiveResult.success
        ? [normalizationMessage, fallbackMessage, supplementalMessage].filter((text): text is string => !!text).join('\n') || undefined
        : [normalizationMessage, `工具 ${toolName} 执行失败: ${effectiveResult.error || toolResult.error}`]
          .filter((text): text is string => !!text)
          .join('\n'),
      diffChanges
    };
  }

  /**
   * 执行写入步骤
   */
  private normalizeWriteContent(raw: string): string {
    const source = raw || '';
    if (!source) return '';

    const markerMatch = source.match(WRITE_CONTENT_MARKER_REGEX);
    let content = source;
    if (markerMatch && typeof markerMatch.index === 'number') {
      content = source.slice(markerMatch.index + markerMatch[0].length);
    }

    content = content
      .replace(/^\s*```[a-zA-Z0-9_-]*\s*\n/, '')
      .replace(/\n?```\s*$/, '')
      .trimStart();

    const trimmed = content.trim();
    if (!trimmed) return '';
    if (this.isProcedureLikeWriteOutput(trimmed)) {
      return '';
    }
    return trimmed;
  }

  private isProcedureLikeWriteOutput(value: string): boolean {
    const lines = value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return true;

    let matched = 0;
    for (const line of lines) {
      if (
        WRITE_PROCEDURE_LINE_REGEX.test(line)
        || WRITE_PROCEDURE_TOKEN_REGEX.test(line)
        || WRITE_PROCEDURE_HINT_REGEX.test(line)
      ) {
        matched += 1;
      }
    }

    if (lines.length <= 4) {
      return matched >= 1;
    }

    return matched >= Math.max(2, Math.ceil(lines.length / 3));
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
    if ((task.type === 'write' || task.type === 'edit') && this.requirementBrief) {
      messages.push({
        role: 'user',
        content: `以下是用户需求拆解结果（硬约束），写作时必须严格满足：\n\`\`\`json\n${JSON.stringify(this.requirementBrief, null, 2)}\n\`\`\``
      });
    }
    messages.push({
      role: 'user',
      content: `请执行以下写入任务: ${step.description}

请严格按以下格式输出，不要添加任何额外说明，也不要使用代码块包裹：
生成内容如下：
<从下一行开始写正文>

严禁输出“工具/参数/read_file/write_file/edit_file”等过程性内容。`
    });

    const streamGenerate = async (requestMessages: ChatMessage[]): Promise<string> => {
      let generatedContent = '';
      let streamError: Error | null = null;

      await aiService.generateTextStream(
        {
          model: this.config.executionConfig.modelId,
          messages: [
            { role: 'system', content: this.config.systemPrompt || cachedExecutorPrompt || '' },
            ...requestMessages
          ],
          temperature: this.config.executionConfig.temperature || 0.7,
          maxTokens: this.config.executionConfig.maxTokens || 4000,
          signal: this.abortController?.signal
        },
        {
          onContent: (chunk) => {
            generatedContent += chunk;
            this.streamCallbacks?.onContent?.(chunk);
          },
          onError: (error) => {
            streamError = error;
          }
        }
      );

      if (streamError) {
        throw streamError;
      }

      return generatedContent;
    };

    let generatedContent = await streamGenerate(messages);
    let normalizedContent = this.normalizeWriteContent(generatedContent);

    if (!normalizedContent) {
      const retryMessages: ChatMessage[] = [
        ...messages,
        {
          role: 'assistant',
          content: generatedContent
        },
        {
          role: 'user',
          content: `你上一次输出了过程说明，不是正文。请重新输出并严格遵守：
生成内容如下：
<正文>

不要出现工具名、参数、read_file、write_file、edit_file、步骤说明。`
        }
      ];
      generatedContent = await streamGenerate(retryMessages);
      normalizedContent = this.normalizeWriteContent(generatedContent);
    }

    if (!normalizedContent) {
      throw new Error('写作步骤未生成有效正文（检测到过程/工具调用文本）');
    }

    let persistedMessage: string | undefined;
    let diffChanges: DiffChange[] | undefined;

    // Persist each write-step output immediately when current tab file is available.
    if (this.shouldAutoPersistWriteOutput(task, normalizedContent)) {
      this.attemptedInlinePersist = true;
      const persistResult = await this.persistWriteOutputToCurrentFile(task, normalizedContent);
      persistedMessage = persistResult.message;
      diffChanges = persistResult.diffChanges;
    }

    const output = persistedMessage
      ? `${normalizedContent}\n\n${persistedMessage}`
      : normalizedContent;

    return {
      result: {
        content: normalizedContent,
        persistedMessage
      },
      output,
      diffChanges
    };
  }

  /**
   * 执行验证步骤
   */
  private getVerifyGateScoreThreshold(task: AgentTask): number {
    const rawConfig = task.context.additionalContext?.verifyGate;
    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      const minScore = (rawConfig as Record<string, unknown>).minScore;
      if (typeof minScore === 'number' && Number.isFinite(minScore)) {
        return Math.min(100, Math.max(0, Math.floor(minScore)));
      }
    }
    return VERIFY_GATE_DEFAULT_MIN_SCORE;
  }

  private getVerifyGateMaxRepairRounds(task: AgentTask): number {
    const rawConfig = task.context.additionalContext?.verifyGate;
    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
      const maxRounds = (rawConfig as Record<string, unknown>).maxRepairRounds;
      if (typeof maxRounds === 'number' && Number.isFinite(maxRounds)) {
        return Math.max(0, Math.floor(maxRounds));
      }
    }
    return VERIFY_GATE_DEFAULT_MAX_REPAIR_ROUNDS;
  }

  private shouldEnforceVerifyGate(task: AgentTask, step: AgentStep): boolean {
    if (step.type !== 'verify') return false;
    return task.type === 'write' || task.type === 'edit';
  }

  private clampScore(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.floor(value)));
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private tryParseJsonObject(raw: string): Record<string, unknown> | null {
    const candidates: string[] = [];
    const jsonCodeBlock = raw.match(/```json\s*([\s\S]*?)```/i);
    if (jsonCodeBlock?.[1]) {
      candidates.push(jsonCodeBlock[1].trim());
    }
    const objectMatch = raw.match(/\{[\s\S]*\}/);
    if (objectMatch?.[0]) {
      candidates.push(objectMatch[0].trim());
    }
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Ignore parse failures and fallback to heuristic extraction.
      }
    }
    return null;
  }

  private parseVerifyGateSummary(rawText: string, threshold: number): VerifyGateSummary {
    const text = (rawText || '').trim();
    const jsonObject = this.tryParseJsonObject(text);
    const scorePattern = /(?:\bscore\b|\u8BC4\u5206)\s*[:：=]?\s*(\d{1,3})/i;

    let passed: boolean | null = null;
    let score: number | null = null;
    let issues: string[] = [];
    let improvements: string[] = [];

    if (jsonObject) {
      if (typeof jsonObject.passed === 'boolean') {
        passed = jsonObject.passed;
      }
      if (typeof jsonObject.score === 'number' && Number.isFinite(jsonObject.score)) {
        score = this.clampScore(jsonObject.score);
      }
      issues = this.parseStringArray(jsonObject.issues);
      improvements = this.parseStringArray(jsonObject.improvements);
    }

    if (score === null) {
      const scoreMatch = text.match(scorePattern);
      if (scoreMatch?.[1]) {
        score = this.clampScore(Number(scoreMatch[1]));
      }
    }

    if (passed === null) {
      const lower = text.toLowerCase();
      if (/(?:\u672A\u901A\u8FC7|\u4E0D\u901A\u8FC7|\u4F4E\u4E8E\u9608\u503C|\u4F4E\u4E8E\u57FA\u51C6|\b(?:fail|failed|not\s*pass(?:ed)?|reject(?:ed)?|below\s+threshold)\b)/.test(lower)) {
        passed = false;
      } else if (/(?:\u901A\u8FC7|\u8FBE\u6807|\b(?:pass|passed|success|successful|qualified|meets?\s+threshold)\b)/.test(lower)) {
        passed = true;
      }
    }

    const normalizedScore = score ?? (passed ? 100 : threshold - 1);
    const normalizedPassed = typeof passed === 'boolean'
      ? passed && normalizedScore >= threshold
      : normalizedScore >= threshold;

    if (issues.length === 0 && !normalizedPassed) {
      issues = ['Verification gate did not pass with current output.'];
    }

    if (improvements.length === 0 && !normalizedPassed) {
      improvements = ['Improve low-score paragraphs and weak sentence-level alignment, then verify again.'];
    }

    return {
      passed: normalizedPassed,
      score: this.clampScore(normalizedScore),
      issues,
      improvements,
      raw: text,
    };
  }

  private compactTextForVerify(value: string, maxChars: number): string {
    const normalized = (value || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';
    if (normalized.length <= maxChars) return normalized;
    const head = Math.max(800, Math.floor(maxChars * 0.72));
    const tail = Math.max(220, maxChars - head - 64);
    const omitted = Math.max(0, normalized.length - head - tail);
    return `${normalized.slice(0, head)}\n...[truncated ${omitted} chars]...\n${normalized.slice(-tail)}`;
  }

  private summarizeVerifyResultPayload(result: unknown): string {
    if (result == null) return '-';
    if (typeof result === 'string') {
      return this.compactTextForVerify(result, VERIFY_PROMPT_MAX_STEP_SUMMARY_CHARS);
    }
    if (typeof result !== 'object' || Array.isArray(result)) {
      return String(result);
    }
    const record = result as Record<string, unknown>;
    const gate = record.gate;
    if (gate && typeof gate === 'object' && !Array.isArray(gate)) {
      const gateRecord = gate as Record<string, unknown>;
      const score = typeof gateRecord.score === 'number' && Number.isFinite(gateRecord.score)
        ? Math.floor(gateRecord.score)
        : null;
      const passed = typeof gateRecord.passed === 'boolean' ? gateRecord.passed : null;
      const threshold = typeof gateRecord.threshold === 'number' && Number.isFinite(gateRecord.threshold)
        ? Math.floor(gateRecord.threshold)
        : null;
      const scoreText = threshold != null && score != null
        ? `${score}/${threshold}`
        : (score != null ? `${score}` : '--');
      return `verify gate: passed=${passed === true ? 'true' : 'false'}, score=${scoreText}`;
    }
    if (typeof record.content === 'string') {
      const content = record.content;
      return `content(${content.length} chars): ${this.compactTextForVerify(content, 180)}`;
    }
    try {
      const compact = JSON.stringify(record);
      if (!compact) return '-';
      return this.compactTextForVerify(compact, VERIFY_PROMPT_MAX_STEP_SUMMARY_CHARS);
    } catch {
      return '[unserializable result]';
    }
  }

  private buildVerifyCompletedStepSummary(completedSteps: AgentStep[]): string {
    const recentSteps = completedSteps.slice(-VERIFY_PROMPT_MAX_COMPLETED_STEPS);
    if (recentSteps.length === 0) return '- (none)';
    return recentSteps.map(step => {
      const desc = this.compactTextForVerify(step.description || '', 140).replace(/\s+/g, ' ').trim();
      const resultSummary = this.summarizeVerifyResultPayload(step.result);
      return `- [${step.type}] ${desc || '(no description)'} => ${resultSummary}`;
    }).join('\n');
  }

  private extractLatestWriteDraft(completedSteps: AgentStep[]): string {
    for (let i = completedSteps.length - 1; i >= 0; i -= 1) {
      const step = completedSteps[i];
      if (step.type !== 'write') continue;
      const result = step.result;
      if (!result || typeof result !== 'object' || Array.isArray(result)) continue;
      const record = result as Record<string, unknown>;
      const content = typeof record.content === 'string' ? record.content : '';
      if (!content.trim()) continue;
      return this.compactTextForVerify(content, VERIFY_PROMPT_MAX_DRAFT_CHARS);
    }
    return '';
  }

  private createRuntimeStep(
    type: AgentStep['type'],
    description: string,
    toolCall?: { toolName: string; parameters: Record<string, unknown> },
  ): AgentStep {
    return {
      id: `step_runtime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      description,
      status: 'pending',
      toolCall,
    };
  }

  private createVerifyRepairLoopSteps(
    gate: VerifyGateSummary,
    round: number,
    threshold: number
  ): AgentStep[] {
    const issueHint = gate.issues.slice(0, 4).join('; ');
    const improveHint = gate.improvements.slice(0, 4).join('; ');
    const writeDesc = issueHint
      ? `Repair round ${round}: optimize paragraphs and sentences below threshold ${threshold}. Focus on: ${issueHint}. Apply improvements: ${improveHint}`
      : `Repair round ${round}: optimize all low-score paragraphs and weak sentence alignments to exceed threshold ${threshold}.`;
    const verifyDesc = `Re-verify sentence-level alignment and score. Return strict JSON with passed/score/issues/improvements. Pass threshold: ${threshold}.`;
    return [
      this.createRuntimeStep('write', writeDesc),
      this.createRuntimeStep('verify', verifyDesc),
    ];
  }

  private async executeVerifyStep(
    task: AgentTask,
    step: AgentStep
  ): Promise<{ result: unknown; output?: string }> {
    const { memory, stateManager } = this.config;

    const plan = stateManager.getCurrentPlan();
    const completedSteps = plan?.steps.filter(s => s.status === 'completed') || [];
    const passThreshold = this.getVerifyGateScoreThreshold(task);
    const stepSummary = this.buildVerifyCompletedStepSummary(completedSteps);
    const finalDraft = this.extractLatestWriteDraft(completedSteps);
    const hasDraft = !!finalDraft.trim();

    const messages = memory.toChatMessages({ taskId: task.id });
    messages.push({
      role: 'user',
      content: `Verify the execution result for task:

Task description: ${task.description}

Completed step summary (already compacted, do not request extra tool calls):
${stepSummary}

${hasDraft ? `Final draft to verify (possibly truncated for token control):
${finalDraft}
` : 'Final draft to verify: (not captured from write step output)'}

Output STRICT JSON only:
{
  "passed": boolean,
  "score": number,
  "issues": string[],
  "improvements": string[],
  "summary": string
}

Scoring rubric:
1. Task completeness
2. Factual correctness
3. Structure and formatting quality
4. Style consistency with decomposition and reference article
5. Sentence-level alignment score

Rules:
- If score < ${passThreshold}, passed must be false.
- If any critical issue remains, passed must be false.
- If input draft is truncated, still evaluate based on available draft and summary.
- Keep score in range 0-100.`
    });

    const response = await aiService.generateText({
      model: this.config.executionConfig.modelId,
      messages: [
        { role: 'system', content: this.config.systemPrompt || cachedExecutorPrompt || '' },
        ...messages
      ],
      temperature: 0.2,
      maxTokens: 1200,
      signal: this.abortController?.signal
    });

    const gate = this.parseVerifyGateSummary(response.content, passThreshold);
    const gateHeader = `[verify-gate] score=${gate.score}/${passThreshold} passed=${gate.passed ? 'true' : 'false'}`;

    return {
      result: { verification: response.content, gate: { ...gate, threshold: passThreshold } },
      output: `${gateHeader}\n${response.content}`
    };
  }

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
    const currentRetry = this.stepRetryCounts.get(step.id) || 0;

    if (currentRetry >= maxRetries) {
      return false;
    }

    const nextRetry = currentRetry + 1;
    this.stepRetryCounts.set(step.id, nextRetry);

    const backoffDelay = retryDelay * nextRetry;
    console.warn(
      `[AgentExecutor] 步骤 ${step.id} 执行失败，开始第 ${nextRetry}/${maxRetries} 次重试，等待 ${backoffDelay}ms。错误: ${error}`
    );

    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    return true;
  }

  /** 是否为命令执行工具 */
  private isCommandTool(toolName: string): boolean {
    return toolName === 'bash';
  }

  /** 是否为文件写入工具 */
  private isFileWriteTool(toolName: string): boolean {
    return toolName === 'write_file'
      || toolName === 'edit_file'
      || toolName === 'multi_edit_file';
  }

  private normalizeBashCommandForCurrentShell(
    step: AgentStep,
    toolName: string,
    parameters: Record<string, unknown>
  ): { parameters: Record<string, unknown>; message?: string } {
    if (toolName !== 'bash') {
      return { parameters };
    }

    const rawCommand = parameters.command;
    if (typeof rawCommand !== 'string' || !rawCommand.trim()) {
      return { parameters };
    }

    const command = rawCommand.trim();
    const stepDescription = (step.description || '').trim();
    const looksLikeReferenceStep = RANDOM_REFERENCE_STEP_REGEX.test(stepDescription)
      || /\[reference-article-path\]/i.test(command);
    const hasBashOnlySyntax = BASH_ARRAY_LENGTH_SYNTAX_REGEX.test(command)
      || RANDOM_REFERENCE_UNIX_COMMAND_REGEX.test(command);

    if (!looksLikeReferenceStep || !hasBashOnlySyntax) {
      return { parameters };
    }

    return {
      parameters: {
        ...parameters,
        command: RANDOM_REFERENCE_ARTICLE_COMMAND,
      },
      message: '检测到不兼容的 Bash 语法，已自动切换为 PowerShell 随机参考文章命令。',
    };
  }

  private isReadFileDirectoryError(toolName: string, toolResult: ToolResult): boolean {
    if (toolName !== 'read_file' || toolResult.success) {
      return false;
    }
    const errorText = (toolResult.error || '').toLowerCase();
    return errorText.includes('eisdir')
      || errorText.includes('is a directory')
      || errorText.includes('illegal operation on a directory');
  }

  private async tryFallbackListFilesForReadDirectory(
    task: AgentTask,
    step: AgentStep,
    originalParameters: Record<string, unknown>
  ): Promise<{ result: ToolResult; message: string } | null> {
    const { toolRegistry, stateManager, memory } = this.config;
    const rawPath = originalParameters.path;
    const directoryPath = typeof rawPath === 'string' ? rawPath.trim() : '';
    if (!directoryPath) {
      return null;
    }

    const listToolName = 'list_files';
    const listTool = toolRegistry.get(listToolName);
    if (!listTool) {
      return null;
    }

    const listParams: Record<string, unknown> = {
      path: directoryPath,
      recursive: false,
      maxDepth: 2,
    };

    if (listTool.requiresConfirmation && this.confirmCallback) {
      const allowed = await this.confirmCallback(listToolName, listParams);
      if (!allowed) {
        return null;
      }
    }

    stateManager.emit({
      type: 'tool_call',
      data: { toolName: listToolName, params: listParams },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    const listResult = await toolRegistry.execute(listToolName, listParams);

    stateManager.emit({
      type: 'tool_result',
      data: { toolName: listToolName, result: listResult },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    memory.addToolResult(listToolName, listResult, task.id, step.id);

    if (!listResult.success) {
      return null;
    }

    return {
      result: listResult,
      message: `read_file 目标是目录，已自动切换为 list_files：${directoryPath}`
    };
  }

  private hasReferencedContext(task: AgentTask): boolean {
    const raw = task.context.additionalContext?.referencedContext;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return false;
    }
    const ref = raw as Record<string, unknown>;
    const hasFiles = Array.isArray(ref.files) && ref.files.length > 0;
    const hasDirectories = Array.isArray(ref.directories) && ref.directories.length > 0;
    const hasKnowledge = Array.isArray(ref.knowledgeBases) && ref.knowledgeBases.length > 0;
    const hasForms = Array.isArray(ref.forms) && ref.forms.length > 0;
    return hasFiles || hasDirectories || hasKnowledge || hasForms;
  }

  private extractListedFileCount(toolResult: ToolResult): number {
    if (!toolResult.success || !toolResult.data || typeof toolResult.data !== 'object') {
      return 0;
    }
    const payload = toolResult.data as Record<string, unknown>;
    if (typeof payload.count === 'number' && Number.isFinite(payload.count)) {
      return payload.count;
    }
    if (Array.isArray(payload.entries)) {
      return payload.entries.length;
    }
    return 0;
  }

  private async runLargeWorkspaceScanIfNeeded(
    task: AgentTask,
    step: AgentStep,
    toolName: string,
    toolResult: ToolResult
  ): Promise<string | undefined> {
    const { toolRegistry, stateManager, memory } = this.config;

    if (this.attemptedLargeWorkspaceScan) return undefined;
    if (task.type !== 'write') return undefined;
    if (this.hasReferencedContext(task)) return undefined;
    if (toolName !== 'list_files') return undefined;
    if (task.constraints?.allowCommandExecution === false) return undefined;

    const listedCount = this.extractListedFileCount(toolResult);
    if (listedCount < LARGE_WORKSPACE_FILE_THRESHOLD) {
      return undefined;
    }

    const bashToolName = 'bash';
    const bashTool = toolRegistry.get(bashToolName);
    if (!bashTool) {
      return `检测到大型工作区(${listedCount}项)，但未找到 bash 工具，跳过命令扫描。`;
    }

    const parameters: Record<string, unknown> = {
      command: LARGE_WORKSPACE_SCAN_COMMAND,
    };

    if (bashTool.requiresConfirmation && this.confirmCallback) {
      const allowed = await this.confirmCallback(bashToolName, parameters);
      if (!allowed) {
        this.attemptedLargeWorkspaceScan = true;
        return `检测到大型工作区(${listedCount}项)，用户拒绝执行命令扫描。`;
      }
    }

    this.attemptedLargeWorkspaceScan = true;

    stateManager.emit({
      type: 'tool_call',
      data: { toolName: bashToolName, params: parameters },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    const bashResult = await toolRegistry.execute(bashToolName, parameters);

    stateManager.emit({
      type: 'tool_result',
      data: { toolName: bashToolName, result: bashResult },
      timestamp: Date.now(),
      taskId: task.id,
      stepId: step.id
    });

    memory.addToolResult(bashToolName, bashResult, task.id, step.id);

    if (!bashResult.success) {
      return `检测到大型工作区(${listedCount}项)，命令扫描失败: ${bashResult.error || 'unknown error'}`;
    }

    const data = (bashResult.data && typeof bashResult.data === 'object')
      ? (bashResult.data as Record<string, unknown>)
      : {};
    const stdout = typeof data.stdout === 'string' ? data.stdout : '';
    const lineCount = stdout ? stdout.split('\n').filter(Boolean).length : 0;
    return `检测到大型工作区(${listedCount}项)，已执行命令扫描(${lineCount}行): ${LARGE_WORKSPACE_SCAN_COMMAND}`;
  }

  private shouldAutoPersistWriteOutput(task: AgentTask, generatedContent: string): boolean {
    if (task.type !== 'write' && task.type !== 'edit') {
      return false;
    }

    if (task.constraints?.allowFileWrite === false) {
      return false;
    }

    if (!task.context.currentFile?.trim()) {
      return false;
    }

    return !!generatedContent.trim();
  }

  private async persistWriteOutputToCurrentFile(
    task: AgentTask,
    content: string
  ): Promise<{ diffChanges?: DiffChange[]; message?: string }> {
    const { toolRegistry, stateManager, memory } = this.config;
    const currentFile = task.context.currentFile?.trim();

    if (!currentFile) {
      return { message: '[自动写入跳过] 未提供当前文件路径。' };
    }

    const toolName = 'write_file';
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      return { message: '[自动写入失败] write_file 工具不可用。' };
    }

    const parameters: Record<string, unknown> = {
      path: currentFile,
      content
    };

    if (tool.requiresConfirmation && this.confirmCallback) {
      const allowed = await this.confirmCallback(toolName, parameters);
      if (!allowed) {
        return { message: `[自动写入取消] 用户拒绝写入当前文件: ${currentFile}` };
      }
    }

    stateManager.emit({
      type: 'tool_call',
      data: { toolName, params: parameters },
      timestamp: Date.now(),
      taskId: task.id
    });

    const toolResult = await toolRegistry.execute(toolName, parameters);

    stateManager.emit({
      type: 'tool_result',
      data: { toolName, result: toolResult },
      timestamp: Date.now(),
      taskId: task.id
    });

    memory.addToolResult(toolName, toolResult, task.id);

    if (!toolResult.success) {
      return {
        message: `[自动写入失败] ${toolResult.error || 'write_file 执行失败'}`
      };
    }

    if (toolResult.changes) {
      this.fileChanges.push(...toolResult.changes);
    }

    let diffChanges: DiffChange[] | undefined;
    if (toolResult.changes && toolResult.changes.length > 0) {
      diffChanges = this.generateDiffChanges(toolResult.changes);
      for (const diff of diffChanges) {
        stateManager.emit({
          type: 'diff_generated',
          data: diff,
          timestamp: Date.now(),
          taskId: task.id
        });
      }
    }

    return {
      diffChanges,
      message: `[已写入当前文件] ${currentFile}`
    };
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
      /** 写入类工具需要用户确认时调用，返回 true 表示允许，false 表示拒绝 */
      onConfirmRequired?: (toolName: string, params: Record<string, unknown>) => Promise<boolean>;
    }
  ): Promise<ExecutionResult> {
    // 将确认回调挂载到实例，供 executeToolCallStep 使用
    this.confirmCallback = callbacks.onConfirmRequired ?? null;
    this.streamCallbacks = {
      onContent: callbacks.onContent,
      onThinking: callbacks.onThinking
    };
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
      // 清理事件监听器和确认回调
      unsubscribers.forEach(unsub => unsub());
      this.confirmCallback = null;
      this.streamCallbacks = null;
    }
  }
}
