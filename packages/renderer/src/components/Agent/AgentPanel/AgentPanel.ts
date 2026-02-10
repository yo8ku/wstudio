/**
 * Agent 主面板组件
 * 功能：Agent 交互的主界面
 * 描述：包含任务输入、执行状态、输出结果、历史记录等功能
 */

import {
  AgentState,
  AgentTask,
  AgentStep,
  AgentEventType
} from '../../../services/agent/types';
import { agentService } from '../../../services/agent/AgentService';
import { ExecutionResult } from '../../../services/agent/AgentExecutor';

/**
 * 面板配置
 */
export interface AgentPanelOptions {
  /** 容器元素 */
  container: HTMLElement;
  /** 工作区路径 */
  workspacePath?: string;
  /** 当前文件路径 */
  currentFile?: string;
  /** 任务完成回调 */
  onTaskComplete?: (result: ExecutionResult) => void;
  /** 任务错误回调 */
  onTaskError?: (error: Error) => void;
  /** 差异生成回调 */
  onDiffGenerated?: (diff: any) => void;
}

/**
 * 面板样式 ID
 */
const PANEL_STYLES_ID = 'agent-panel-styles';

/**
 * Agent 主面板类
 */
export class AgentPanel {
  /** 配置选项 */
  private options: AgentPanelOptions;

  /** 面板容器 */
  private panelElement: HTMLElement | null = null;

  /** 输入框元素 */
  private inputElement: HTMLTextAreaElement | null = null;

  /** 输出区域元素 */
  private outputElement: HTMLElement | null = null;

  /** 状态显示元素 */
  private statusElement: HTMLElement | null = null;

  /** 进度条元素 */
  private progressElement: HTMLElement | null = null;

  /** 步骤列表元素 */
  private stepsElement: HTMLElement | null = null;

  /** 事件取消订阅函数列表 */
  private unsubscribers: Array<() => void> = [];

  /** 是否已初始化 */
  private initialized: boolean = false;

  constructor(options: AgentPanelOptions) {
    this.options = options;
    this.injectStyles();
    this.render();
    this.setupEventListeners();
  }

  /**
   * 注入样式
   */
  private injectStyles(): void {
    if (document.getElementById(PANEL_STYLES_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = PANEL_STYLES_ID;
    style.textContent = `
      .agent-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--ws-editor-background, #1e1e1e);
        color: var(--ws-foreground, #cccccc);
        font-family: var(--ws-font-family, system-ui);
        font-size: 13px;
      }

      /* 头部区域 */
      .agent-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--ws-panel-border, #3c3c3c);
      }

      .agent-panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
      }

      .agent-panel-title svg {
        width: 18px;
        height: 18px;
        color: var(--ws-accent, #007acc);
      }

      .agent-panel-status {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: var(--ws-foreground-muted, #888);
      }

      .agent-panel-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #888;
      }

      .agent-panel-status-dot.idle { background: #888; }
      .agent-panel-status-dot.planning { background: #f0ad4e; }
      .agent-panel-status-dot.executing { background: #5bc0de; }
      .agent-panel-status-dot.waiting { background: #f0ad4e; }
      .agent-panel-status-dot.completed { background: #5cb85c; }
      .agent-panel-status-dot.error { background: #d9534f; }
      .agent-panel-status-dot.interrupted { background: #d9534f; }

      /* 输入区域 */
      .agent-panel-input-area {
        padding: 12px 16px;
        border-bottom: 1px solid var(--ws-panel-border, #3c3c3c);
      }

      .agent-panel-input-wrapper {
        display: flex;
        gap: 8px;
      }

      .agent-panel-input {
        flex: 1;
        min-height: 60px;
        max-height: 150px;
        padding: 10px 12px;
        background: var(--ws-input-background, #3c3c3c);
        border: 1px solid var(--ws-input-border, #3c3c3c);
        border-radius: 6px;
        color: var(--ws-foreground, #cccccc);
        font-family: inherit;
        font-size: 13px;
        resize: vertical;
        outline: none;
      }

      .agent-panel-input:focus {
        border-color: var(--ws-accent, #007acc);
      }

      .agent-panel-input::placeholder {
        color: var(--ws-foreground-muted, #888);
      }

      .agent-panel-submit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: var(--ws-accent, #007acc);
        border: none;
        border-radius: 6px;
        color: white;
        cursor: pointer;
        transition: background 0.15s ease;
      }

      .agent-panel-submit-btn:hover {
        background: var(--ws-accent-hover, #005a9e);
      }

      .agent-panel-submit-btn:disabled {
        background: var(--ws-button-disabled, #555);
        cursor: not-allowed;
      }

      .agent-panel-submit-btn svg {
        width: 18px;
        height: 18px;
      }

      /* 进度区域 */
      .agent-panel-progress {
        padding: 8px 16px;
        border-bottom: 1px solid var(--ws-panel-border, #3c3c3c);
        display: none;
      }

      .agent-panel-progress.visible {
        display: block;
      }

      .agent-panel-progress-bar {
        height: 4px;
        background: var(--ws-progress-background, #3c3c3c);
        border-radius: 2px;
        overflow: hidden;
      }

      .agent-panel-progress-fill {
        height: 100%;
        background: var(--ws-accent, #007acc);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .agent-panel-progress-text {
        display: flex;
        justify-content: space-between;
        margin-top: 6px;
        font-size: 11px;
        color: var(--ws-foreground-muted, #888);
      }

      /* 步骤列表 */
      .agent-panel-steps {
        padding: 12px 16px;
        border-bottom: 1px solid var(--ws-panel-border, #3c3c3c);
        max-height: 200px;
        overflow-y: auto;
        display: none;
      }

      .agent-panel-steps.visible {
        display: block;
      }

      .agent-panel-step {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid var(--ws-panel-border, #2a2a2a);
      }

      .agent-panel-step:last-child {
        border-bottom: none;
      }

      .agent-panel-step-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 11px;
        flex-shrink: 0;
      }

      .agent-panel-step-icon.pending {
        background: var(--ws-panel-border, #3c3c3c);
        color: var(--ws-foreground-muted, #888);
      }

      .agent-panel-step-icon.running {
        background: rgba(91, 192, 222, 0.2);
        color: #5bc0de;
      }

      .agent-panel-step-icon.completed {
        background: rgba(92, 184, 92, 0.2);
        color: #5cb85c;
      }

      .agent-panel-step-icon.failed {
        background: rgba(217, 83, 79, 0.2);
        color: #d9534f;
      }

      .agent-panel-step-content {
        flex: 1;
        min-width: 0;
      }

      .agent-panel-step-title {
        font-size: 12px;
        color: var(--ws-foreground, #cccccc);
        margin-bottom: 2px;
      }

      .agent-panel-step-desc {
        font-size: 11px;
        color: var(--ws-foreground-muted, #888);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* 输出区域 */
      .agent-panel-output {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        font-family: var(--ws-font-family-mono, 'Consolas', monospace);
        font-size: 12px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .agent-panel-output-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--ws-foreground-muted, #888);
        text-align: center;
      }

      .agent-panel-output-empty svg {
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
        opacity: 0.5;
      }

      /* 底部操作栏 */
      .agent-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        border-top: 1px solid var(--ws-panel-border, #3c3c3c);
        font-size: 11px;
        color: var(--ws-foreground-muted, #888);
      }

      .agent-panel-footer-actions {
        display: flex;
        gap: 8px;
      }

      .agent-panel-footer-btn {
        padding: 4px 8px;
        background: transparent;
        border: 1px solid var(--ws-panel-border, #3c3c3c);
        border-radius: 4px;
        color: var(--ws-foreground-muted, #888);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .agent-panel-footer-btn:hover {
        background: var(--ws-list-hover-background, #2a2d2e);
        color: var(--ws-foreground, #cccccc);
      }

      .agent-panel-footer-btn.danger:hover {
        background: rgba(217, 83, 79, 0.1);
        border-color: #d9534f;
        color: #d9534f;
      }

      /* 加载动画 */
      @keyframes agent-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .agent-panel-loading {
        animation: agent-spin 1s linear infinite;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 渲染面板
   */
  private render(): void {
    const panel = document.createElement('div');
    panel.className = 'agent-panel';

    panel.innerHTML = `
      <!-- 头部 -->
      <div class="agent-panel-header">
        <div class="agent-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          Agent
        </div>
        <div class="agent-panel-status">
          <span class="agent-panel-status-dot idle"></span>
          <span class="agent-panel-status-text">就绪</span>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="agent-panel-input-area">
        <div class="agent-panel-input-wrapper">
          <textarea
            class="agent-panel-input"
            placeholder="描述你想要完成的任务..."
            rows="3"
          ></textarea>
          <button class="agent-panel-submit-btn" title="执行任务 (Ctrl+Enter)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 进度区域 -->
      <div class="agent-panel-progress">
        <div class="agent-panel-progress-bar">
          <div class="agent-panel-progress-fill" style="width: 0%"></div>
        </div>
        <div class="agent-panel-progress-text">
          <span class="agent-panel-progress-step">步骤 0/0</span>
          <span class="agent-panel-progress-percent">0%</span>
        </div>
      </div>

      <!-- 步骤列表 -->
      <div class="agent-panel-steps"></div>

      <!-- 输出区域 -->
      <div class="agent-panel-output">
        <div class="agent-panel-output-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
          <div>输入任务描述开始</div>
          <div style="font-size: 11px; margin-top: 4px;">支持写作、编辑、查询等任务</div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="agent-panel-footer">
        <div class="agent-panel-footer-info">
          <span class="agent-panel-memory-usage">记忆: 0%</span>
        </div>
        <div class="agent-panel-footer-actions">
          <button class="agent-panel-footer-btn agent-panel-clear-btn">清空</button>
          <button class="agent-panel-footer-btn agent-panel-stop-btn danger" style="display: none;">停止</button>
        </div>
      </div>
    `;

    // 保存元素引用
    this.panelElement = panel;
    this.inputElement = panel.querySelector('.agent-panel-input');
    this.outputElement = panel.querySelector('.agent-panel-output');
    this.statusElement = panel.querySelector('.agent-panel-status');
    this.progressElement = panel.querySelector('.agent-panel-progress');
    this.stepsElement = panel.querySelector('.agent-panel-steps');

    // 添加到容器
    this.options.container.appendChild(panel);

    // 绑定事件
    this.bindEvents();

    this.initialized = true;
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    if (!this.panelElement) return;

    // 提交按钮
    const submitBtn = this.panelElement.querySelector('.agent-panel-submit-btn');
    submitBtn?.addEventListener('click', () => this.submitTask());

    // 输入框快捷键
    this.inputElement?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.submitTask();
      }
    });

    // 清空按钮
    const clearBtn = this.panelElement.querySelector('.agent-panel-clear-btn');
    clearBtn?.addEventListener('click', () => this.clearOutput());

    // 停止按钮
    const stopBtn = this.panelElement.querySelector('.agent-panel-stop-btn');
    stopBtn?.addEventListener('click', () => this.stopTask());
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听状态变化
    this.unsubscribers.push(
      agentService.on('state_change', (event) => {
        const { currentState } = event.data as { currentState: AgentState };
        this.updateStatus(currentState);
      })
    );

    // 监听步骤开始
    this.unsubscribers.push(
      agentService.on('step_start', (event) => {
        const step = event.data as AgentStep;
        this.updateStepStatus(step.id, 'running');
        this.appendOutput(`▶ ${step.description}...\n`);
      })
    );

    // 监听步骤完成
    this.unsubscribers.push(
      agentService.on('step_complete', (event) => {
        const step = event.data as AgentStep;
        this.updateStepStatus(step.id, 'completed');
        this.updateProgress();
      })
    );

    // 监听步骤错误
    this.unsubscribers.push(
      agentService.on('step_error', (event) => {
        const { step, error } = event.data as { step: AgentStep; error: string };
        this.updateStepStatus(step.id, 'failed');
        this.appendOutput(`✗ 错误: ${error}\n`, 'error');
      })
    );

    // 监听计划创建
    this.unsubscribers.push(
      agentService.on('plan_created', (event) => {
        const plan = event.data as { steps: AgentStep[] };
        this.renderSteps(plan.steps);
        this.showProgress();
      })
    );

    // 监听差异生成
    this.unsubscribers.push(
      agentService.on('diff_generated', (event) => {
        if (this.options.onDiffGenerated) {
          this.options.onDiffGenerated(event.data);
        }
      })
    );
  }

  /**
   * 提交任务
   */
  private async submitTask(): Promise<void> {
    if (!this.inputElement) return;

    const description = this.inputElement.value.trim();
    if (!description) return;

    // 清空输入框
    this.inputElement.value = '';

    // 清空输出
    this.clearOutput();

    // 显示任务描述
    this.appendOutput(`📝 任务: ${description}\n\n`);

    // 显示停止按钮
    this.showStopButton(true);

    try {
      // 创建并执行任务
      const task = agentService.createTask('write', description, {
        workspacePath: this.options.workspacePath,
        currentFile: this.options.currentFile
      });

      const result = await agentService.executeTaskStream(task, {
        onContent: (content) => {
          this.appendOutput(content);
        },
        onThinking: (thinking) => {
          this.appendOutput(`💭 ${thinking}\n`, 'thinking');
        },
        onComplete: (result) => {
          this.handleTaskComplete(result);
        },
        onError: (error) => {
          this.handleTaskError(error);
        }
      });

    } catch (error) {
      this.handleTaskError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.showStopButton(false);
    }
  }

  /**
   * 停止任务
   */
  private stopTask(): void {
    agentService.interrupt();
    this.appendOutput('\n⚠️ 任务已中断\n', 'warning');
    this.showStopButton(false);
  }

  /**
   * 处理任务完成
   */
  private handleTaskComplete(result: ExecutionResult): void {
    if (result.success) {
      this.appendOutput(`\n✓ 任务完成\n`, 'success');

      if (result.stats) {
        this.appendOutput(
          `  完成步骤: ${result.stats.completedSteps}/${result.stats.totalSteps}\n`,
          'info'
        );
      }
    } else {
      this.appendOutput(`\n✗ 任务失败: ${result.error}\n`, 'error');
    }

    if (this.options.onTaskComplete) {
      this.options.onTaskComplete(result);
    }

    this.hideProgress();
    this.updateMemoryUsage();
  }

  /**
   * 处理任务错误
   */
  private handleTaskError(error: Error): void {
    this.appendOutput(`\n✗ 错误: ${error.message}\n`, 'error');

    if (this.options.onTaskError) {
      this.options.onTaskError(error);
    }

    this.hideProgress();
  }

  /**
   * 更新状态显示
   */
  private updateStatus(state: AgentState): void {
    if (!this.statusElement) return;

    const dot = this.statusElement.querySelector('.agent-panel-status-dot');
    const text = this.statusElement.querySelector('.agent-panel-status-text');

    if (dot) {
      dot.className = `agent-panel-status-dot ${state}`;
    }

    if (text) {
      const statusTexts: Record<AgentState, string> = {
        [AgentState.IDLE]: '就绪',
        [AgentState.PLANNING]: '规划中...',
        [AgentState.EXECUTING]: '执行中...',
        [AgentState.WAITING]: '等待确认...',
        [AgentState.COMPLETED]: '已完成',
        [AgentState.ERROR]: '错误',
        [AgentState.INTERRUPTED]: '已中断'
      };
      text.textContent = statusTexts[state] || state;
    }
  }

  /**
   * 渲染步骤列表
   */
  private renderSteps(steps: AgentStep[]): void {
    if (!this.stepsElement) return;

    this.stepsElement.innerHTML = steps.map((step, index) => `
      <div class="agent-panel-step" data-step-id="${step.id}">
        <div class="agent-panel-step-icon ${step.status}">
          ${index + 1}
        </div>
        <div class="agent-panel-step-content">
          <div class="agent-panel-step-title">${step.type}</div>
          <div class="agent-panel-step-desc">${step.description}</div>
        </div>
      </div>
    `).join('');

    this.stepsElement.classList.add('visible');
  }

  /**
   * 更新步骤状态
   */
  private updateStepStatus(stepId: string, status: string): void {
    if (!this.stepsElement) return;

    const stepElement = this.stepsElement.querySelector(`[data-step-id="${stepId}"]`);
    if (stepElement) {
      const icon = stepElement.querySelector('.agent-panel-step-icon');
      if (icon) {
        icon.className = `agent-panel-step-icon ${status}`;
      }
    }
  }

  /**
   * 显示进度
   */
  private showProgress(): void {
    if (this.progressElement) {
      this.progressElement.classList.add('visible');
    }
  }

  /**
   * 隐藏进度
   */
  private hideProgress(): void {
    if (this.progressElement) {
      this.progressElement.classList.remove('visible');
    }
    if (this.stepsElement) {
      this.stepsElement.classList.remove('visible');
    }
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    const progress = agentService.getProgress();

    if (this.progressElement) {
      const fill = this.progressElement.querySelector('.agent-panel-progress-fill') as HTMLElement;
      const stepText = this.progressElement.querySelector('.agent-panel-progress-step');
      const percentText = this.progressElement.querySelector('.agent-panel-progress-percent');

      if (fill) {
        fill.style.width = `${progress.percentage}%`;
      }
      if (stepText) {
        stepText.textContent = `步骤 ${progress.current}/${progress.total}`;
      }
      if (percentText) {
        percentText.textContent = `${progress.percentage}%`;
      }
    }
  }

  /**
   * 追加输出
   */
  private appendOutput(text: string, type?: 'error' | 'success' | 'warning' | 'info' | 'thinking'): void {
    if (!this.outputElement) return;

    // 移除空状态提示
    const emptyState = this.outputElement.querySelector('.agent-panel-output-empty');
    if (emptyState) {
      emptyState.remove();
    }

    // 创建输出行
    const line = document.createElement('span');
    line.textContent = text;

    if (type) {
      const colors: Record<string, string> = {
        error: '#d9534f',
        success: '#5cb85c',
        warning: '#f0ad4e',
        info: '#5bc0de',
        thinking: '#888'
      };
      line.style.color = colors[type] || 'inherit';
    }

    this.outputElement.appendChild(line);

    // 滚动到底部
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  /**
   * 清空输出
   */
  private clearOutput(): void {
    if (!this.outputElement) return;

    this.outputElement.innerHTML = `
      <div class="agent-panel-output-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <div>输入任务描述开始</div>
        <div style="font-size: 11px; margin-top: 4px;">支持写作、编辑、查询等任务</div>
      </div>
    `;

    this.hideProgress();
  }

  /**
   * 显示/隐藏停止按钮
   */
  private showStopButton(show: boolean): void {
    const stopBtn = this.panelElement?.querySelector('.agent-panel-stop-btn') as HTMLElement;
    if (stopBtn) {
      stopBtn.style.display = show ? 'block' : 'none';
    }
  }

  /**
   * 更新记忆使用量
   */
  private updateMemoryUsage(): void {
    const stats = agentService.getMemoryStats();
    const memoryText = this.panelElement?.querySelector('.agent-panel-memory-usage');
    if (memoryText) {
      memoryText.textContent = `记忆: ${stats.usagePercentage}%`;
    }
  }

  /**
   * 设置当前文件
   */
  setCurrentFile(filePath: string): void {
    this.options.currentFile = filePath;
  }

  /**
   * 设置工作区路径
   */
  setWorkspacePath(path: string): void {
    this.options.workspacePath = path;
  }

  /**
   * 聚焦输入框
   */
  focus(): void {
    this.inputElement?.focus();
  }

  /**
   * 销毁面板
   */
  dispose(): void {
    // 取消事件订阅
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // 移除面板
    if (this.panelElement) {
      this.panelElement.remove();
      this.panelElement = null;
    }

    this.initialized = false;
    console.log('[AgentPanel] 面板已销毁');
  }
}
