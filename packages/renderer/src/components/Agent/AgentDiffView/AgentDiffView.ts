/**
 * Agent 差异视图组件
 * 功能：显示文本差异，支持接受/拒绝操作
 * 描述：使用 Monaco Editor 装饰器实现红色删除线（原文）和绿色高亮（新文）效果
 */

import * as monaco from 'monaco-editor';
import { DiffChange, LineChange } from '../../../services/agent/types';

/**
 * 差异视图配置
 */
export interface AgentDiffViewOptions {
  /** 接受变更的回调 */
  onAccept?: (change: DiffChange) => void;
  /** 拒绝变更的回调 */
  onReject?: (change: DiffChange) => void;
  /** 部分接受的回调（接受单行） */
  onAcceptLine?: (change: DiffChange, lineIndex: number) => void;
  /** 显示行号 */
  showLineNumbers?: boolean;
  /** 是否只读 */
  readOnly?: boolean;
}

/**
 * 差异视图样式 ID
 */
const DIFF_STYLES_ID = 'agent-diff-view-styles';

/**
 * Agent 差异视图类
 */
export class AgentDiffView {
  /** 编辑器实例 */
  private editor: monaco.editor.IStandaloneCodeEditor;

  /** 配置选项 */
  private options: AgentDiffViewOptions;

  /** 当前差异变更 */
  private currentChange: DiffChange | null = null;

  /** 装饰器 ID 列表 */
  private decorationIds: string[] = [];

  /** 操作按钮容器 */
  private actionsContainer: HTMLElement | null = null;

  /** 键盘事件处理器 */
  private keyboardDisposable: monaco.IDisposable | null = null;

  /** 是否已显示 */
  private isVisible: boolean = false;

  constructor(
    editor: monaco.editor.IStandaloneCodeEditor,
    options: AgentDiffViewOptions = {}
  ) {
    this.editor = editor;
    this.options = {
      showLineNumbers: true,
      readOnly: true,
      ...options
    };

    this.injectStyles();
  }

  /**
   * 注入样式
   */
  private injectStyles(): void {
    if (document.getElementById(DIFF_STYLES_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = DIFF_STYLES_ID;
    style.textContent = `
      /* 删除行样式 - 红色删除线 */
      .agent-diff-delete-line {
        background-color: rgba(255, 0, 0, 0.1) !important;
      }

      .agent-diff-delete-text {
        color: #dc3545 !important;
        text-decoration: line-through !important;
        text-decoration-color: #dc3545 !important;
        opacity: 0.8;
      }

      /* 新增行样式 - 绿色高亮 */
      .agent-diff-add-line {
        background-color: rgba(40, 167, 69, 0.15) !important;
      }

      .agent-diff-add-text {
        color: #28a745 !important;
        background-color: rgba(40, 167, 69, 0.2);
        border-radius: 2px;
      }

      /* 未变更行样式 */
      .agent-diff-unchanged-line {
        opacity: 0.6;
      }

      /* 行号区域标记 */
      .agent-diff-glyph-delete {
        background-color: #dc3545;
        width: 4px !important;
        margin-left: 3px;
        border-radius: 2px;
      }

      .agent-diff-glyph-add {
        background-color: #28a745;
        width: 4px !important;
        margin-left: 3px;
        border-radius: 2px;
      }

      /* 操作按钮容器 */
      .agent-diff-actions {
        position: fixed;
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        background: var(--ws-editor-background, #1e1e1e);
        border: 1px solid var(--ws-panel-border, #3c3c3c);
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        font-family: var(--ws-font-family, system-ui);
        font-size: 13px;
      }

      .agent-diff-actions-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.15s ease;
      }

      .agent-diff-actions-btn svg {
        width: 14px;
        height: 14px;
      }

      .agent-diff-actions-btn-accept {
        background: #28a745;
        color: white;
      }

      .agent-diff-actions-btn-accept:hover {
        background: #218838;
      }

      .agent-diff-actions-btn-reject {
        background: transparent;
        color: var(--ws-foreground, #cccccc);
        border: 1px solid var(--ws-panel-border, #3c3c3c);
      }

      .agent-diff-actions-btn-reject:hover {
        background: rgba(220, 53, 69, 0.1);
        border-color: #dc3545;
        color: #dc3545;
      }

      /* 差异统计信息 */
      .agent-diff-stats {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 8px;
        color: var(--ws-foreground-muted, #888);
        font-size: 12px;
        border-right: 1px solid var(--ws-panel-border, #3c3c3c);
        margin-right: 4px;
      }

      .agent-diff-stats-add {
        color: #28a745;
      }

      .agent-diff-stats-delete {
        color: #dc3545;
      }

      /* 快捷键提示 */
      .agent-diff-shortcut {
        font-size: 11px;
        color: var(--ws-foreground-muted, #888);
        margin-left: 4px;
        opacity: 0.7;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * 显示差异
   */
  show(change: DiffChange, startLine?: number): void {
    this.currentChange = change;
    this.isVisible = true;

    // 清除旧的装饰器
    this.clearDecorations();

    // 计算起始行
    const displayStartLine = startLine || this.editor.getPosition()?.lineNumber || 1;

    // 应用装饰器
    this.applyDecorations(change, displayStartLine);

    // 显示操作按钮
    this.showActions(displayStartLine);

    // 注册快捷键
    this.registerKeyBindings();

    // 滚动到差异位置
    this.editor.revealLineInCenter(displayStartLine);

    console.log('[AgentDiffView] 显示差异:', {
      filePath: change.filePath,
      type: change.type,
      lineChanges: change.lineChanges.length
    });
  }

  /**
   * 应用装饰器
   */
  private applyDecorations(change: DiffChange, startLine: number): void {
    const model = this.editor.getModel();
    if (!model) return;

    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    let currentLine = startLine;

    for (const lineChange of change.lineChanges) {
      // 确保行号有效
      if (currentLine < 1 || currentLine > model.getLineCount()) {
        continue;
      }

      switch (lineChange.type) {
        case 'delete':
          // 删除行：红色背景 + 删除线
          decorations.push({
            range: new monaco.Range(currentLine, 1, currentLine, model.getLineMaxColumn(currentLine)),
            options: {
              isWholeLine: true,
              className: 'agent-diff-delete-line',
              glyphMarginClassName: 'agent-diff-glyph-delete',
              inlineClassName: 'agent-diff-delete-text',
              hoverMessage: { value: '将被删除' }
            }
          });
          currentLine++;
          break;

        case 'add':
          // 新增行：绿色背景 + 高亮
          decorations.push({
            range: new monaco.Range(currentLine, 1, currentLine, model.getLineMaxColumn(currentLine)),
            options: {
              isWholeLine: true,
              className: 'agent-diff-add-line',
              glyphMarginClassName: 'agent-diff-glyph-add',
              inlineClassName: 'agent-diff-add-text',
              hoverMessage: { value: '新增内容' }
            }
          });
          currentLine++;
          break;

        case 'unchanged':
          // 未变更行：降低透明度
          decorations.push({
            range: new monaco.Range(currentLine, 1, currentLine, model.getLineMaxColumn(currentLine)),
            options: {
              isWholeLine: true,
              className: 'agent-diff-unchanged-line'
            }
          });
          currentLine++;
          break;
      }
    }

    // 应用装饰器
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
  }

  /**
   * 显示操作按钮
   */
  private showActions(line: number): void {
    this.hideActions();

    // 创建操作按钮容器
    const container = document.createElement('div');
    container.className = 'agent-diff-actions';

    // 计算统计信息
    const stats = this.calculateStats();

    // 统计信息
    const statsDiv = document.createElement('div');
    statsDiv.className = 'agent-diff-stats';
    statsDiv.innerHTML = `
      <span class="agent-diff-stats-add">+${stats.additions}</span>
      <span class="agent-diff-stats-delete">-${stats.deletions}</span>
    `;
    container.appendChild(statsDiv);

    // 接受按钮
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'agent-diff-actions-btn agent-diff-actions-btn-accept';
    acceptBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      接受
      <span class="agent-diff-shortcut">Tab</span>
    `;
    acceptBtn.addEventListener('click', () => this.accept());
    container.appendChild(acceptBtn);

    // 拒绝按钮
    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'agent-diff-actions-btn agent-diff-actions-btn-reject';
    rejectBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      拒绝
      <span class="agent-diff-shortcut">Esc</span>
    `;
    rejectBtn.addEventListener('click', () => this.reject());
    container.appendChild(rejectBtn);

    // 计算位置
    const editorDom = this.editor.getDomNode();
    if (editorDom) {
      const lineTop = this.editor.getTopForLineNumber(line);
      const editorRect = editorDom.getBoundingClientRect();
      const scrollTop = this.editor.getScrollTop();

      // 按钮显示在差异区域上方
      container.style.left = `${editorRect.left + 60}px`;
      container.style.top = `${editorRect.top + lineTop - scrollTop - 50}px`;
    }

    document.body.appendChild(container);
    this.actionsContainer = container;

    // 调整位置，确保不超出视口
    this.adjustActionsPosition();
  }

  /**
   * 调整操作按钮位置
   */
  private adjustActionsPosition(): void {
    if (!this.actionsContainer) return;

    const rect = this.actionsContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 检查右边界
    if (rect.right > viewportWidth) {
      this.actionsContainer.style.left = `${viewportWidth - rect.width - 20}px`;
    }

    // 检查顶部边界
    if (rect.top < 10) {
      this.actionsContainer.style.top = '10px';
    }

    // 检查底部边界
    if (rect.bottom > viewportHeight) {
      this.actionsContainer.style.top = `${viewportHeight - rect.height - 10}px`;
    }
  }

  /**
   * 隐藏操作按钮
   */
  private hideActions(): void {
    if (this.actionsContainer) {
      this.actionsContainer.remove();
      this.actionsContainer = null;
    }
  }

  /**
   * 注册快捷键
   */
  private registerKeyBindings(): void {
    if (this.keyboardDisposable) {
      this.keyboardDisposable.dispose();
    }

    this.keyboardDisposable = this.editor.onKeyDown((e) => {
      if (!this.isVisible) return;

      // Tab 键：接受
      if (e.keyCode === monaco.KeyCode.Tab) {
        e.preventDefault();
        e.stopPropagation();
        this.accept();
      }
      // Escape 键：拒绝
      else if (e.keyCode === monaco.KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this.reject();
      }
    });
  }

  /**
   * 接受变更
   */
  accept(): void {
    if (!this.currentChange) return;

    console.log('[AgentDiffView] 接受变更');

    // 应用变更到编辑器
    this.applyChange();

    // 回调
    if (this.options.onAccept) {
      this.options.onAccept(this.currentChange);
    }

    // 隐藏差异视图
    this.hide();
  }

  /**
   * 拒绝变更
   */
  reject(): void {
    if (!this.currentChange) return;

    console.log('[AgentDiffView] 拒绝变更');

    // 回调
    if (this.options.onReject) {
      this.options.onReject(this.currentChange);
    }

    // 隐藏差异视图
    this.hide();
  }

  /**
   * 应用变更到编辑器
   */
  private applyChange(): void {
    if (!this.currentChange) return;

    const model = this.editor.getModel();
    if (!model) return;

    // 使用新内容替换
    const fullRange = model.getFullModelRange();

    this.editor.executeEdits('agent-diff-apply', [{
      range: fullRange,
      text: this.currentChange.newContent,
      forceMoveMarkers: true
    }]);
  }

  /**
   * 计算统计信息
   */
  private calculateStats(): { additions: number; deletions: number; unchanged: number } {
    if (!this.currentChange) {
      return { additions: 0, deletions: 0, unchanged: 0 };
    }

    let additions = 0;
    let deletions = 0;
    let unchanged = 0;

    for (const lineChange of this.currentChange.lineChanges) {
      switch (lineChange.type) {
        case 'add':
          additions++;
          break;
        case 'delete':
          deletions++;
          break;
        case 'unchanged':
          unchanged++;
          break;
      }
    }

    return { additions, deletions, unchanged };
  }

  /**
   * 清除装饰器
   */
  private clearDecorations(): void {
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
  }

  /**
   * 隐藏差异视图
   */
  hide(): void {
    this.isVisible = false;
    this.currentChange = null;

    // 清除装饰器
    this.clearDecorations();

    // 隐藏操作按钮
    this.hideActions();

    // 清除快捷键
    if (this.keyboardDisposable) {
      this.keyboardDisposable.dispose();
      this.keyboardDisposable = null;
    }

    console.log('[AgentDiffView] 差异视图已隐藏');
  }

  /**
   * 检查是否可见
   */
  isShowing(): boolean {
    return this.isVisible;
  }

  /**
   * 获取当前差异变更
   */
  getCurrentChange(): DiffChange | null {
    return this.currentChange;
  }

  /**
   * 更新差异内容
   */
  update(change: DiffChange): void {
    if (!this.isVisible) {
      this.show(change);
      return;
    }

    this.currentChange = change;

    // 重新应用装饰器
    const startLine = this.editor.getPosition()?.lineNumber || 1;
    this.clearDecorations();
    this.applyDecorations(change, startLine);
  }

  /**
   * 销毁组件
   */
  dispose(): void {
    this.hide();
    console.log('[AgentDiffView] 组件已销毁');
  }
}
