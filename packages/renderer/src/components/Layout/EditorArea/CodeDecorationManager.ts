/**
 * 代码装饰器管理器
 * 
 * 功能描述：
 * - 管理编辑器中的代码高亮和装饰
 * - 支持选中区域高亮
 * - 支持 Diff 视图（插入/删除标记）
 * - 支持临时高亮效果
 */

import * as monaco from 'monaco-editor';
import type { editor as Editor } from 'monaco-editor';

interface DecorationOptions {
  type: 'selection' | 'insertion' | 'deletion' | 'highlight' | 'warning' | 'error';
  range: monaco.IRange;
  hoverMessage?: string;
  glyphMarginClassName?: string;
}

interface DiffChange {
  type: 'insert' | 'delete' | 'modify';
  range: monaco.IRange;
  oldText?: string;
  newText?: string;
}

export class CodeDecorationManager {
  private editor: monaco.editor.IStandaloneCodeEditor;
  private decorations: Map<string, string[]> = new Map();
  private styleInjected: boolean = false;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.injectStyles();
  }

  /**
   * 注入装饰器样式
   */
  private injectStyles(): void {
    if (this.styleInjected || document.getElementById('code-decoration-styles')) {
      this.styleInjected = true;
      return;
    }

    const style = document.createElement('style');
    style.id = 'code-decoration-styles';
    style.textContent = `
      /* 选中区域高亮 */
      .decoration-selection {
        background: var(--vscode-editor-selectionHighlightBackground, rgba(173, 214, 255, 0.15)) !important;
        border: 1px solid var(--vscode-editor-selectionHighlightBorder, rgba(173, 214, 255, 0.4));
        border-radius: 2px;
      }

      /* 插入的代码 */
      .decoration-insertion {
        background: var(--vscode-diffEditor-insertedTextBackground, rgba(155, 185, 85, 0.2)) !important;
        border-left: 2px solid var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.8));
      }

      .decoration-insertion-glyph {
        background: var(--vscode-diffEditor-insertedLineBackground, rgba(155, 185, 85, 0.8));
        width: 3px !important;
      }

      /* 删除的代码 */
      .decoration-deletion {
        background: var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.2)) !important;
        border-left: 2px solid var(--vscode-diffEditor-removedLineBackground, rgba(255, 0, 0, 0.8));
        text-decoration: line-through;
        opacity: 0.6;
      }

      .decoration-deletion-glyph {
        background: var(--vscode-diffEditor-removedLineBackground, rgba(255, 0, 0, 0.8));
        width: 3px !important;
      }

      /* 高亮 */
      .decoration-highlight {
        background: var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33)) !important;
        border: 1px solid var(--vscode-editor-findMatchHighlightBorder, rgba(234, 92, 0, 0.5));
        border-radius: 2px;
      }

      /* 警告 */
      .decoration-warning {
        background: var(--vscode-editorWarning-background, rgba(255, 193, 7, 0.1)) !important;
        border-bottom: 2px wavy var(--vscode-editorWarning-foreground, #ff9800);
      }

      /* 错误 */
      .decoration-error {
        background: var(--vscode-editorError-background, rgba(255, 0, 0, 0.1)) !important;
        border-bottom: 2px wavy var(--vscode-editorError-foreground, #f44336);
      }

      /* Glyph Margin 图标 */
      .glyph-insertion::before {
        content: "▸";
        color: var(--vscode-diffEditor-insertedLineBackground, #9bb955);
        font-weight: bold;
      }

      .glyph-deletion::before {
        content: "▸";
        color: var(--vscode-diffEditor-removedLineBackground, #ff0000);
        font-weight: bold;
      }
    `;
    document.head.appendChild(style);
    this.styleInjected = true;
  }

  /**
   * 添加装饰器
   */
  addDecoration(id: string, options: DecorationOptions | DecorationOptions[]): void {
    const optionsArray = Array.isArray(options) ? options : [options];
    
    const decorations: monaco.editor.IModelDeltaDecoration[] = optionsArray.map(opt => {
      return {
        range: new monaco.Range(
          opt.range.startLineNumber,
          opt.range.startColumn,
          opt.range.endLineNumber,
          opt.range.endColumn
        ),
        options: this.getDecorationOptions(opt)
      };
    });

    const decorationIds = this.editor.deltaDecorations([], decorations);
    this.decorations.set(id, decorationIds);


  }

  /**
   * 更新装饰器
   */
  updateDecoration(id: string, options: DecorationOptions | DecorationOptions[]): void {
    const oldDecorations = this.decorations.get(id) || [];
    const optionsArray = Array.isArray(options) ? options : [options];
    
    const decorations: monaco.editor.IModelDeltaDecoration[] = optionsArray.map(opt => {
      return {
        range: new monaco.Range(
          opt.range.startLineNumber,
          opt.range.startColumn,
          opt.range.endLineNumber,
          opt.range.endColumn
        ),
        options: this.getDecorationOptions(opt)
      };
    });

    const decorationIds = this.editor.deltaDecorations(oldDecorations, decorations);
    this.decorations.set(id, decorationIds);


  }

  /**
   * 移除装饰器
   */
  removeDecoration(id: string): void {
    const decorationIds = this.decorations.get(id);
    if (!decorationIds) return;

    this.editor.deltaDecorations(decorationIds, []);
    this.decorations.delete(id);


  }

  /**
   * 移除所有装饰器
   */
  clearAll(): void {
    this.decorations.forEach((decorationIds, id) => {
      this.editor.deltaDecorations(decorationIds, []);
    });
    this.decorations.clear();


  }

  /**
   * 高亮选中区域
   */
  highlightSelection(range: monaco.IRange, id: string = 'selection'): void {
    this.addDecoration(id, {
      type: 'selection',
      range
    });
  }

  /**
   * 显示 Diff 变化
   */
  showDiff(changes: DiffChange[]): void {
    const decorations: DecorationOptions[] = changes.map((change, index) => {
      const type = change.type === 'insert' ? 'insertion' : 
                   change.type === 'delete' ? 'deletion' : 'highlight';
      
      return {
        type: type as 'insertion' | 'deletion' | 'highlight',
        range: change.range,
        hoverMessage: change.newText || change.oldText,
        glyphMarginClassName: `glyph-${change.type}`
      };
    });

    this.addDecoration('diff', decorations);
  }

  /**
   * 清除 Diff 高亮
   */
  clearDiff(): void {
    this.removeDecoration('diff');
  }

  /**
   * 临时高亮（指定时间后自动消失）
   */
  flashHighlight(range: monaco.IRange, duration: number = 2000): void {
    const id = `flash-${Date.now()}`;
    
    this.addDecoration(id, {
      type: 'highlight',
      range
    });

    setTimeout(() => {
      this.removeDecoration(id);
    }, duration);
  }

  /**
   * 标记插入的行
   */
  markInsertion(startLine: number, endLine: number, id: string = 'insertion'): void {
    const model = this.editor.getModel();
    if (!model) return;

    this.addDecoration(id, {
      type: 'insertion',
      range: {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine)
      }
    });
  }

  /**
   * 标记删除的行
   */
  markDeletion(startLine: number, endLine: number, id: string = 'deletion'): void {
    const model = this.editor.getModel();
    if (!model) return;

    this.addDecoration(id, {
      type: 'deletion',
      range: {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine)
      }
    });
  }

  /**
   * 获取装饰器选项
   */
  private getDecorationOptions(opt: DecorationOptions): monaco.editor.IModelDecorationOptions {
    const baseOptions: monaco.editor.IModelDecorationOptions = {
      isWholeLine: false,
      glyphMarginClassName: opt.glyphMarginClassName,
      hoverMessage: opt.hoverMessage ? { value: opt.hoverMessage } : undefined
    };

    switch (opt.type) {
      case 'selection':
        return {
          ...baseOptions,
          className: 'decoration-selection',
          isWholeLine: false
        };

      case 'insertion':
        return {
          ...baseOptions,
          className: 'decoration-insertion',
          isWholeLine: true,
          glyphMarginClassName: 'decoration-insertion-glyph'
        };

      case 'deletion':
        return {
          ...baseOptions,
          className: 'decoration-deletion',
          isWholeLine: true,
          glyphMarginClassName: 'decoration-deletion-glyph'
        };

      case 'highlight':
        return {
          ...baseOptions,
          className: 'decoration-highlight'
        };

      case 'warning':
        return {
          ...baseOptions,
          className: 'decoration-warning'
        };

      case 'error':
        return {
          ...baseOptions,
          className: 'decoration-error'
        };

      default:
        return baseOptions;
    }
  }

  /**
   * 获取当前所有装饰器
   */
  getAllDecorations(): Map<string, string[]> {
    return new Map(this.decorations);
  }

  /**
   * 清理
   */
  dispose(): void {
    this.clearAll();
  }
}


