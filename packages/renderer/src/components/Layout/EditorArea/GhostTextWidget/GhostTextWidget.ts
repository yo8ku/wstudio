/**
 * Ghost Text Widget（预览组件）
 * 功能：在编辑器中显示 AI 生成的回复预览（灰色/半透明文本）
 * 描述：使用 Monaco Editor Decorations API 实现预览效果
 */

import * as monaco from 'monaco-editor';

interface GhostTextOptions {
  /** 接受预览的回调 */
  onAccept?: (text: string) => void;
  /** 拒绝预览的回调 */
  onReject?: () => void;
  /** 部分接受的回调（接受一行） */
  onAcceptLine?: (line: string) => void;
}

export class GhostTextWidget {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorations: string[] = [];
  private ghostText: string = '';
  private position: monaco.IPosition | null = null;
  private options: GhostTextOptions;
  private keyboardDisposable: monaco.IDisposable | null = null;

  constructor(editor: monaco.editor.IStandaloneCodeEditor, options: GhostTextOptions = {}) {
    this.editor = editor;
    this.options = options;
    this.addStyles();
  }

  /**
   * 显示 Ghost Text
   * @param position 起始位置
   * @param text 要显示的文本（支持多行）
   */
  show(position: monaco.IPosition, text: string): void {
    this.ghostText = text;
    this.position = position;

    const model = this.editor.getModel();
    if (!model) return;

    const lines = text.split('\n');
    const decorationsData: monaco.editor.IModelDeltaDecoration[] = [];
    let totalLines = model.getLineCount();

    console.log('[GhostTextWidget] show - 起始行号:', position.lineNumber, '文档总行数:', totalLines, '要显示的行数:', lines.length);

    // 计算需要的最大行号
    const maxRequiredLine = position.lineNumber + lines.length - 1;
    
    // 如果需要的行数超过了文档现有行数，先插入空行
    if (maxRequiredLine > totalLines) {
      const linesToAdd = maxRequiredLine - totalLines;
      const lastLineMaxColumn = model.getLineMaxColumn(totalLines);
      
      console.log('[GhostTextWidget] 需要插入', linesToAdd, '个空行');
      
      this.editor.executeEdits('ghost-text-prepare', [{
        range: new monaco.Range(totalLines, lastLineMaxColumn, totalLines, lastLineMaxColumn),
        text: '\n'.repeat(linesToAdd),
        forceMoveMarkers: true
      }]);
      
      // 更新总行数
      totalLines = model.getLineCount();
      console.log('[GhostTextWidget] 插入后文档总行数:', totalLines);
    }

    lines.forEach((line, index) => {
      const lineNumber = position.lineNumber + index;
      
      // 检查行号是否有效（理论上现在应该都有效了）
      if (lineNumber < 1 || lineNumber > totalLines) {
        console.warn('[GhostTextWidget] 跳过无效行号:', lineNumber, '(文档总行数:', totalLines, ')');
        return;
      }
      
      // 获取目标行的内容
      const lineContent = model.getLineContent(lineNumber);
      
      // 如果行为空或只有空白字符，在行首显示
      // 否则在行尾显示
      const isEmptyLine = lineContent.trim().length === 0;
      
      decorationsData.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          [isEmptyLine ? 'before' : 'after']: {
            content: line,
            inlineClassName: 'ghost-text',
          },
          showIfCollapsed: true,
          className: 'ghost-text-line-background', // 添加行背景样式
        }
      });
    });

    // 使用 deltaDecorations 更新装饰（会自动清除旧的装饰）
    this.decorations = this.editor.deltaDecorations(
      this.decorations,
      decorationsData
    );

    // 注册快捷键
    this.registerKeyBindings();
  }

  /**
   * 更新 Ghost Text 内容（用于流式更新）
   * @param text 新的文本内容
   */
  updateText(text: string): void {
    if (!this.position) {
      // 如果还没有位置，使用当前光标位置
      const currentPosition = this.editor.getPosition();
      if (currentPosition) {
        this.show(currentPosition, text);
      }
    } else {
      // 更新已有的 Ghost Text
      this.show(this.position, text);
    }
  }

  /**
   * 在指定行号更新 Ghost Text 内容（用于流式更新）
   * @param text 新的文本内容
   * @param lineNumber 起始行号
   */
  updateTextAtLine(text: string, lineNumber: number): void {
    // console.log('[GhostTextWidget] updateTextAtLine - 行号:', lineNumber, '文本长度:', text.length);
    const position: monaco.IPosition = {
      lineNumber: lineNumber,
      column: 1
    };
    this.show(position, text);
  }

  /**
   * 注册快捷键（Tab 接受，Esc 拒绝）
   */
  private registerKeyBindings(): void {
    // 清除之前的快捷键
    if (this.keyboardDisposable) {
      this.keyboardDisposable.dispose();
    }

    this.keyboardDisposable = this.editor.onKeyDown((e) => {
      // Tab 键：接受整个预览
      if (e.keyCode === monaco.KeyCode.Tab && this.decorations.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        this.accept();
      }
      // Escape 键：拒绝预览
      else if (e.keyCode === monaco.KeyCode.Escape && this.decorations.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        this.reject();
      }
      // Ctrl+Right / Cmd+Right：接受一行
      else if (
        (e.keyCode === monaco.KeyCode.RightArrow && (e.ctrlKey || e.metaKey)) &&
        this.decorations.length > 0
      ) {
        e.preventDefault();
        e.stopPropagation();
        this.acceptLine();
      }
    });
  }

  /**
   * 接受整个预览
   */
  private accept(): void {
    if (!this.ghostText || !this.position) return;

    // 插入文本
    const position = this.editor.getPosition();
    if (position) {
      this.editor.executeEdits('ghost-text', [{
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: this.ghostText,
      }]);
    }

    // 回调
    if (this.options.onAccept) {
      this.options.onAccept(this.ghostText);
    }

    // 清除预览
    this.hide();
  }

  /**
   * 拒绝预览
   */
  private reject(): void {
    // 回调
    if (this.options.onReject) {
      this.options.onReject();
    }

    // 清除预览
    this.hide();
  }

  /**
   * 接受一行
   */
  private acceptLine(): void {
    if (!this.ghostText || !this.position) return;

    const lines = this.ghostText.split('\n');
    if (lines.length === 0) return;

    const firstLine = lines[0];

    // 插入第一行
    const position = this.editor.getPosition();
    if (position) {
      this.editor.executeEdits('ghost-text', [{
        range: new monaco.Range(
          position.lineNumber,
          position.column,
          position.lineNumber,
          position.column
        ),
        text: firstLine + (lines.length > 1 ? '\n' : ''),
      }]);
    }

    // 回调
    if (this.options.onAcceptLine) {
      this.options.onAcceptLine(firstLine);
    }

    // 如果还有剩余行，显示剩余内容
    if (lines.length > 1) {
      const remainingText = lines.slice(1).join('\n');
      const newPosition = this.editor.getPosition();
      if (newPosition) {
        this.show(newPosition, remainingText);
      }
    } else {
      this.hide();
    }
  }

  /**
   * 添加 Ghost Text 的样式
   */
  private addStyles(): void {
    if (!document.getElementById('ghost-text-styles')) {
      const style = document.createElement('style');
      style.id = 'ghost-text-styles';
      style.textContent = `
        .ghost-text {
          opacity: 0.6;
          color: var(--ws-editor-ghost-text-foregroun) !important;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * 隐藏 Ghost Text
   */
  hide(): void {
    this.decorations = this.editor.deltaDecorations(this.decorations, []);
    this.ghostText = '';
    this.position = null;

    // 清除快捷键
    if (this.keyboardDisposable) {
      this.keyboardDisposable.dispose();
      this.keyboardDisposable = null;
    }
  }

  /**
   * 销毁组件
   */
  dispose(): void {
    this.hide();
  }
}
