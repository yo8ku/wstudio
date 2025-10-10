/**
 * AI 功能演示示例
 * 
 * 功能描述：
 * 演示如何在其他地方使用 AI 编辑器功能
 */

import type { editor as Editor } from 'monaco-editor';
import { AIZoneWidget } from './AIZoneWidget';
import { GhostTextWidget } from './GhostTextWidget';
import { CodeDecorationManager } from './CodeDecorationManager';

/**
 * 示例：在外部代码中使用 AI 功能
 */
export class AIEditorDemo {
  private editor: Editor.IStandaloneCodeEditor;
  private aiZone?: AIZoneWidget;
  private ghostText?: GhostTextWidget;
  private decorations?: CodeDecorationManager;

  constructor(editor: Editor.IStandaloneCodeEditor) {
    this.editor = editor;
    this.initialize();
  }

  private initialize() {
    // 初始化 Zone Widget
    this.aiZone = new AIZoneWidget(this.editor, {
      onSubmit: (message, includeSelection) => {
        console.log('用户提交:', message);
        this.handleAIRequest(message, includeSelection);
      },
      onClose: () => {
        console.log('面板关闭');
        this.decorations?.clearAll();
      }
    });

    // 初始化 Ghost Text
    this.ghostText = new GhostTextWidget(this.editor, {
      onAccept: (text) => {
        console.log('接受建议:', text);
        this.markInsertedCode(text);
      },
      onReject: () => {
        console.log('拒绝建议');
      }
    });

    // 初始化装饰器
    this.decorations = new CodeDecorationManager(this.editor);
  }

  /**
   * 演示：显示 AI 面板
   */
  showAIPanel() {
    const selection = this.editor.getSelection();
    if (!selection) return;

    const model = this.editor.getModel();
    if (!model) return;

    const selectedText = model.getValueInRange(selection);
    
    // 高亮选中文本
    if (selectedText) {
      this.decorations?.highlightSelection({
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn
      });
    }

    // 显示面板
    this.aiZone?.show(selection.endLineNumber, selectedText);
  }

  /**
   * 演示：显示代码建议
   */
  showCodeSuggestion(code: string) {
    const position = this.editor.getPosition();
    if (!position) return;

    this.ghostText?.show(position, code);
  }

  /**
   * 演示：高亮代码差异
   */
  highlightDiff(startLine: number, endLine: number, type: 'insert' | 'delete') {
    if (type === 'insert') {
      this.decorations?.markInsertion(startLine, endLine);
    } else {
      this.decorations?.markDeletion(startLine, endLine);
    }

    // 3秒后清除
    setTimeout(() => {
      this.decorations?.clearDiff();
    }, 3000);
  }

  /**
   * 处理 AI 请求（模拟）
   */
  private async handleAIRequest(message: string, includeSelection: boolean) {
    // 模拟 AI 生成延迟
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 生成示例代码
    const generatedCode = this.generateExampleCode(message);

    // 显示预览
    const position = this.editor.getPosition();
    if (position) {
      this.ghostText?.show(position, generatedCode);
    }
  }

  /**
   * 生成示例代码
   */
  private generateExampleCode(message: string): string {
    if (message.includes('function')) {
      return `function ${message.replace(/[^a-zA-Z0-9]/g, '')}() {\n  // TODO: Implement\n  return true;\n}`;
    }
    return `// Generated for: ${message}\n// TODO: Implement`;
  }

  /**
   * 标记插入的代码
   */
  private markInsertedCode(text: string) {
    const position = this.editor.getPosition();
    if (!position) return;

    const lines = text.split('\n').length;
    this.decorations?.markInsertion(
      position.lineNumber,
      position.lineNumber + lines - 1
    );

    // 2秒后清除高亮
    setTimeout(() => {
      this.decorations?.clearAll();
    }, 2000);
  }

  /**
   * 清理
   */
  dispose() {
    this.aiZone?.dispose();
    this.ghostText?.dispose();
    this.decorations?.dispose();
  }
}

/**
 * 使用示例：
 * 
 * ```typescript
 * import { AIEditorDemo } from './DEMO_EXAMPLE';
 * 
 * // 在 Monaco 编辑器挂载后
 * const demo = new AIEditorDemo(editor);
 * 
 * // 显示 AI 面板
 * demo.showAIPanel();
 * 
 * // 显示代码建议
 * demo.showCodeSuggestion('function example() {\n  return true;\n}');
 * 
 * // 高亮差异
 * demo.highlightDiff(1, 5, 'insert');
 * 
 * // 清理
 * demo.dispose();
 * ```
 */


