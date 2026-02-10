/**
 * Agent 进度显示组件
 * 功能：在编辑器中显示 Agent 执行进度
 * 描述：轻量级的进度指示器，可嵌入编辑器或独立显示
 */

import * as monaco from 'monaco-editor';
import { AgentState, AgentStep } from '../../../services/agent/types';
import { agentService } from '../../../services/agent/AgentService';

/**
 * 进度组件配置
 */
export interface AgentProgressOptions {
  /** 是否显示步骤详情 */
  showSteps?: boolean;
  /** 是否显示百分比 */
  showPercentage?: boolean;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 初始是否折叠 */
  collapsed?: boolean;
  /** 位置 */
  position?: 'top' | 'bottom' | 'inline';
}

/**
 * 进度组件样式 ID
 */
const PROGRESS_STYLES_ID = 'agent-progress-styles';

/**
 * Agent 进度显示组件类
 */
export class AgentProgress {
  /** 编辑器实例 */
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;

  /** 配置选项 */
  private options: Required<AgentProgressOptions>;

  /** 进度容器元素 */
  private containerElement: HTMLElement | null = null;

  /** Content Widget（用于编辑器内显示） */
  private contentWidget: monaco.editor.IContentWidget | null = null;

  /** 事件取消订阅函数列表 */
  private unsubscribers: Array<() => void> = [];

  /** 当前状态 */
  private currentState: AgentState = AgentState.IDLE;

  /** 当前步骤列表 */
  private currentSteps: AgentStep[] = [];

  /** 是否已折叠 */
  private isCollapsed: boolean = false;

  /** 是否可见 */
  private isVisible: boolean = false;

  constructor(options?: AgentProgressOptions) {
    this.options = {
      showSteps: true,
      showPercentage: true,
      collapsible: true,
      collapsed: false,
      position: 'top',
      ...options
    };

    this.isCollapsed = this.options.collapsed;
    this.injectStyles();
  }

  /**
   * 注入样式
   */
  private injectStyles(): void {
    if (document.getElementById(PROGRESS_STYLES_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = PROGRESS_STYLES_ID;
    style.textContent = `
      .agent-progress {
        display: flex;
        flex-direction: column;
        background: var(--ws-editor-background, #1e1e1e);
        border: 1px solid var(--ws-panel-border, #3c3c3c);
        border-radius: 6px;
        padding: 10px 14px;
        font-family: var(--ws-font-family, system-ui);
        font-size: 12px;
        color: var(--ws-foreground, #cccccc);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        min-width: 200px;
        max-width: 300px;
        z-index: 100;
      }

      .agent-progress.inline {
        position: relative;
        margin: 8px 0;
      }

      .agent-progress.floating {
        position: fixed;
      }

      /* 头部 */
      .agent-progress-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .agent-progress-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }

      .agent-progress-status {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .agent-progress-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #888;
      }

      .agent-progress-status-dot.idle { background: #888; }
      .agent-progress-status-dot.planning { background: #f0ad4e; animation: agent-progress-pulse 1.5s infinite; }
      .agent-progress-status-dot.executing { background: #5bc0de; animation: agent-progress-pulse 1.5s infinite; }
      .agent-progress-status-dot.waiting { background: #f0ad4e; }
      .agent-progress-status-dot.completed { background: #5cb85c; }
      .agent-progress-status-dot.error { background: #d9534f; }
      .agent-progress-status-dot.interrupted { background: #d9534f; }

      @keyframes agent-progress-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }

      .agent-progress-toggle {
        background: none;
        border: none;
        color: var(--ws-foreground-muted, #888);
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease;
      }

      .agent-progress-toggle:hover {
        color: var(--ws-foreground, #cccccc);
      }

      .agent-progress-toggle svg {
        width: 14px;
        height: 14px;
        transition: transform 0.2s ease;
      }

      .agent-progress-toggle.collapsed svg {
        transform: rotate(-90deg);
      }

      /* 进度条 */
      .agent-progress-bar-container {
        margin-bottom: 8px;
      }

      .agent-progress-bar {
        height: 4px;
        background: var(--ws-progress-background, #3c3c3c);
        border-radius: 2px;
        overflow: hidden;
      }

      .agent-progress-bar-fill {
        height: 100%;
        background: var(--ws-accent, #007acc);
        border-radius: 2px;
        transition: width 0.3s ease;
      }

      .agent-progress-bar-fill.completed {
        background: #5cb85c;
      }

      .agent-progress-bar-fill.error {
        background: #d9534f;
      }

      .agent-progress-info {
        display: flex;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 11px;
        color: var(--ws-foreground-muted, #888);
      }

      /* 步骤列表 */
      .agent-progress-steps {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 150px;
        overflow-y: auto;
        padding-right: 4px;
      }

      .agent-progress-steps.collapsed {
        display: none;
      }

      .agent-progress-step {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 0;
        font-size: 11px;
      }

      .agent-progress-step-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 9px;
        flex-shrink: 0;
      }

      .agent-progress-step-icon.pending {
        background: var(--ws-panel-border, #3c3c3c);
        color: var(--ws-foreground-muted, #888);
      }

      .agent-progress-step-icon.running {
        background: rgba(91, 192, 222, 0.2);
        color: #5bc0de;
      }

      .agent-progress-step-icon.completed {
        background: rgba(92, 184, 92, 0.2);
        color: #5cb85c;
      }

      .agent-progress-step-icon.failed {
        background: rgba(217, 83, 79, 0.2);
        color: #d9534f;
      }

      .agent-progress-step-text {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--ws-foreground, #cccccc);
      }

      .agent-progress-step-text.muted {
        color: var(--ws-foreground-muted, #888);
      }

      /* 操作按钮 */
      .agent-progress-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--ws-panel-border, #3c3c3c);
      }

      .agent-progress-btn {
        padding: 4px 10px;
        background: transparent;
        border: 1px solid var(--ws-panel-border, #3c3c3c);
        border-radius: 4px;
        color: var(--ws-foreground-muted, #888);
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .agent-progress-btn:hover {
        background: rgba(217, 83, 79, 0.1);
        border-color: #d9534f;
        color: #d9534f;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 附加到编辑器
   */
  attachToEditor(editor: monaco.editor.IStandaloneCodeEditor, line?: number): void {
    this.editor = editor;
    this.createContentWidget(line || 1);
    this.setupEventListeners();
  }

  /**
   * 附加到 DOM 元素
   */
  attachToElement(container: HTMLElement): void {
    this.containerElement = this.createProgressElement();
    this.containerElement.classList.add('inline');
    container.appendChild(this.containerElement);
    this.setupEventListeners();
    this.isVisible = true;
  }

  /**
   * 显示为浮动窗口
   */
  showFloating(x: number, y: number): void {
    if (this.containerElement) {
      this.containerElement.remove();
    }

    this.containerElement = this.createProgressElement();
    this.containerElement.classList.add('floating');
    this.containerElement.style.left = `${x}px`;
    this.containerElement.style.top = `${y}px`;

    document.body.appendChild(this.containerElement);
    this.setupEventListeners();
    this.isVisible = true;

    // 调整位置确保不超出视口
    this.adjustFloatingPosition();
  }

  /**
   * 创建 Content Widget
   */
  private createContentWidget(line: number): void {
    if (!this.editor) return;

    const progressElement = this.createProgressElement();

    this.contentWidget = {
      getId: () => 'agent-progress-widget',
      getDomNode: () => progressElement,
      getPosition: () => ({
        position: { lineNumber: line, column: 1 },
        preference: [
          this.options.position === 'top'
            ? monaco.editor.ContentWidgetPositionPreference.ABOVE
            : monaco.editor.ContentWidgetPositionPreference.BELOW
        ]
      })
    };

    this.editor.addContentWidget(this.contentWidget);
    this.containerElement = progressElement;
    this.isVisible = true;
  }

  /**
   * 创建进度元素
   */
  private createProgressElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'agent-progress';

    container.innerHTML = `
      <!-- 头部 -->
      <div class="agent-progress-header">
        <div class="agent-progress-title">
          <div class="agent-progress-status">
            <span class="agent-progress-status-dot idle"></span>
            <span class="agent-progress-status-text">就绪</span>
          </div>
        </div>
        ${this.options.collapsible ? `
          <button class="agent-progress-toggle" title="折叠/展开">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        ` : ''}
      </div>

      <!-- 进度条 -->
      <div class="agent-progress-bar-container">
        <div class="agent-progress-bar">
          <div class="agent-progress-bar-fill" style="width: 0%"></div>
        </div>
        ${this.options.showPercentage ? `
          <div class="agent-progress-info">
            <span class="agent-progress-step-count">步骤 0/0</span>
            <span class="agent-progress-percent">0%</span>
          </div>
        ` : ''}
      </div>

      <!-- 步骤列表 -->
      ${this.options.showSteps ? `
        <div class="agent-progress-steps ${this.isCollapsed ? 'collapsed' : ''}"></div>
      ` : ''}

      <!-- 操作按钮 -->
      <div class="agent-progress-actions" style="display: none;">
        <button class="agent-progress-btn agent-progress-stop-btn">停止</button>
      </div>
    `;

    // 绑定事件
    this.bindElementEvents(container);

    return container;
  }

  /**
   * 绑定元素事件
   */
  private bindElementEvents(container: HTMLElement): void {
    // 折叠按钮
    const toggleBtn = container.querySelector('.agent-progress-toggle');
    toggleBtn?.addEventListener('click', () => this.toggleCollapse());

    // 停止按钮
    const stopBtn = container.querySelector('.agent-progress-stop-btn');
    stopBtn?.addEventListener('click', () => {
      agentService.interrupt();
    });
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 清除旧的监听器
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // 监听状态变化
    this.unsubscribers.push(
      agentService.on('state_change', (event) => {
        const { currentState } = event.data as { currentState: AgentState };
        this.updateState(currentState);
      })
    );

    // 监听计划创建
    this.unsubscribers.push(
      agentService.on('plan_created', (event) => {
        const plan = event.data as { steps: AgentStep[] };
        this.updateSteps(plan.steps);
      })
    );

    // 监听计划更新
    this.unsubscribers.push(
      agentService.on('plan_updated', (event) => {
        const plan = event.data as { steps: AgentStep[] };
        this.updateSteps(plan.steps);
      })
    );

    // 监听步骤开始
    this.unsubscribers.push(
      agentService.on('step_start', (event) => {
        const step = event.data as AgentStep;
        this.updateStepStatus(step.id, 'running');
        this.updateProgress();
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
        const { step } = event.data as { step: AgentStep };
        this.updateStepStatus(step.id, 'failed');
        this.updateProgress();
      })
    );
  }

  /**
   * 更新状态
   */
  private updateState(state: AgentState): void {
    this.currentState = state;

    if (!this.containerElement) return;

    const dot = this.containerElement.querySelector('.agent-progress-status-dot');
    const text = this.containerElement.querySelector('.agent-progress-status-text');
    const actions = this.containerElement.querySelector('.agent-progress-actions') as HTMLElement;
    const barFill = this.containerElement.querySelector('.agent-progress-bar-fill');

    if (dot) {
      dot.className = `agent-progress-status-dot ${state}`;
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

    // 显示/隐藏停止按钮
    if (actions) {
      const isActive = [AgentState.PLANNING, AgentState.EXECUTING].includes(state);
      actions.style.display = isActive ? 'flex' : 'none';
    }

    // 更新进度条样式
    if (barFill) {
      barFill.classList.remove('completed', 'error');
      if (state === AgentState.COMPLETED) {
        barFill.classList.add('completed');
      } else if (state === AgentState.ERROR) {
        barFill.classList.add('error');
      }
    }
  }

  /**
   * 更新步骤列表
   */
  private updateSteps(steps: AgentStep[]): void {
    this.currentSteps = steps;

    if (!this.containerElement || !this.options.showSteps) return;

    const stepsContainer = this.containerElement.querySelector('.agent-progress-steps');
    if (!stepsContainer) return;

    stepsContainer.innerHTML = steps.map((step, index) => `
      <div class="agent-progress-step" data-step-id="${step.id}">
        <div class="agent-progress-step-icon ${step.status}">
          ${this.getStepIcon(step.status)}
        </div>
        <div class="agent-progress-step-text ${step.status === 'pending' ? 'muted' : ''}">
          ${step.description}
        </div>
      </div>
    `).join('');

    this.updateProgress();
  }

  /**
   * 获取步骤图标
   */
  private getStepIcon(status: string): string {
    switch (status) {
      case 'completed':
        return '✓';
      case 'failed':
        return '✗';
      case 'running':
        return '●';
      default:
        return '○';
    }
  }

  /**
   * 更新步骤状态
   */
  private updateStepStatus(stepId: string, status: string): void {
    // 更新内部状态
    const step = this.currentSteps.find(s => s.id === stepId);
    if (step) {
      step.status = status as AgentStep['status'];
    }

    if (!this.containerElement) return;

    const stepElement = this.containerElement.querySelector(`[data-step-id="${stepId}"]`);
    if (stepElement) {
      const icon = stepElement.querySelector('.agent-progress-step-icon');
      const text = stepElement.querySelector('.agent-progress-step-text');

      if (icon) {
        icon.className = `agent-progress-step-icon ${status}`;
        icon.textContent = this.getStepIcon(status);
      }

      if (text) {
        text.classList.toggle('muted', status === 'pending');
      }
    }
  }

  /**
   * 更新进度
   */
  private updateProgress(): void {
    if (!this.containerElement) return;

    const progress = agentService.getProgress();

    const barFill = this.containerElement.querySelector('.agent-progress-bar-fill') as HTMLElement;
    const stepCount = this.containerElement.querySelector('.agent-progress-step-count');
    const percent = this.containerElement.querySelector('.agent-progress-percent');

    if (barFill) {
      barFill.style.width = `${progress.percentage}%`;
    }

    if (stepCount) {
      stepCount.textContent = `步骤 ${progress.current}/${progress.total}`;
    }

    if (percent) {
      percent.textContent = `${progress.percentage}%`;
    }
  }

  /**
   * 切换折叠状态
   */
  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;

    if (!this.containerElement) return;

    const toggleBtn = this.containerElement.querySelector('.agent-progress-toggle');
    const stepsContainer = this.containerElement.querySelector('.agent-progress-steps');

    if (toggleBtn) {
      toggleBtn.classList.toggle('collapsed', this.isCollapsed);
    }

    if (stepsContainer) {
      stepsContainer.classList.toggle('collapsed', this.isCollapsed);
    }
  }

  /**
   * 调整浮动位置
   */
  private adjustFloatingPosition(): void {
    if (!this.containerElement) return;

    const rect = this.containerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = parseFloat(this.containerElement.style.left);
    let top = parseFloat(this.containerElement.style.top);

    // 检查右边界
    if (left + rect.width > viewportWidth) {
      left = viewportWidth - rect.width - 20;
    }

    // 检查底部边界
    if (top + rect.height > viewportHeight) {
      top = viewportHeight - rect.height - 20;
    }

    // 确保不超出左边界和顶部边界
    left = Math.max(20, left);
    top = Math.max(20, top);

    this.containerElement.style.left = `${left}px`;
    this.containerElement.style.top = `${top}px`;
  }

  /**
   * 显示
   */
  show(): void {
    if (this.containerElement) {
      this.containerElement.style.display = 'flex';
      this.isVisible = true;
    }
  }

  /**
   * 隐藏
   */
  hide(): void {
    if (this.containerElement) {
      this.containerElement.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * 检查是否可见
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * 销毁组件
   */
  dispose(): void {
    // 取消事件订阅
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // 移除 Content Widget
    if (this.editor && this.contentWidget) {
      this.editor.removeContentWidget(this.contentWidget);
      this.contentWidget = null;
    }

    // 移除容器元素
    if (this.containerElement) {
      this.containerElement.remove();
      this.containerElement = null;
    }

    this.editor = null;
    this.isVisible = false;

    console.log('[AgentProgress] 组件已销毁');
  }
}
