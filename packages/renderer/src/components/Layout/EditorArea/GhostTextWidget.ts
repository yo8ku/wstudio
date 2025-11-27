/**
 * Ghost Text Widget（代码预览组件）
 * 功能：在编辑器中显示 AI 生成的代码预览（灰色/半透明文本）
 * 描述：使用 Monaco Editor 的 Decorations API 实现类似 GitHub Copilot 的代码预览效果
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

    const lines = text.split('\n');
    const decorationsData: monaco.editor.IModelDeltaDecoration[] = [];

    lines.forEach((line, index) => {
      const lineNumber = position.lineNumber + index;
      
      decorationsData.push({
        range: new monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          after: {
            content: line,
            inlineClassName: 'ghost-text',
          },
          showIfCollapsed: true,
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

    // 如果还有剩余行，显示剩余的
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
<<<<<<< Updated upstream:packages/renderer/src/components/Layout/EditorArea/GhostTextWidget.ts
          opacity: 0.4;
          font-style: italic;
          color: var(--vscode-editorGhostText-foreground, #858585) !important;
=======
          opacity: 0.6;
          color: var(--ws-editor-ghost-text-foregroun) !important;
>>>>>>> Stashed changes:packages/renderer/src/components/Layout/EditorArea/GhostTextWidget/GhostTextWidget.ts
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
