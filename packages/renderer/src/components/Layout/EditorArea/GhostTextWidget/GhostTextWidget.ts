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
  private hasPushedContent: boolean = false; // 标记是否已经插入空行把内容往下推
  private maxInsertedLine: number = 0; // 记录已经插入的最大行号，避免流式更新时重复插入空行

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
    
    // 检查目标位置之后是否有内容（确保diff在上方，原有内容在diff之后）
    // 只在第一次显示时检查并插入空行（避免流式更新时重复插入）
    // 但如果流式更新时内容变多了，需要补充插入空行
    let hasContentBelow = false;
    // 检查从目标位置之后开始到需要的最大行号之后是否有内容
    // 这样确保如果目标位置之后有内容，会被推到diff之后
    // 检查范围：从目标位置+1到 maxRequiredLine + 1（确保检查到diff之后的内容）
    // 注意：目标位置本身可能有内容（内联聊天下方的第一行），也需要推走
    // 如果是首次生成（hasPushedContent为false），扩大检查范围，确保能检测到所有需要推走的内容
    const checkStartLine = position.lineNumber; // 从目标位置开始检查（包括目标位置本身）
    // 首次生成时，扩大检查范围，至少检查到目标位置之后100行，确保能检测到所有内容
    // 同时，无论内容多少，都要检查到文档末尾，确保能检测到所有需要推走的内容
    const checkEndLine = !this.hasPushedContent 
      ? totalLines // 首次生成时，检查到文档末尾，确保能检测到所有内容
      : Math.min(maxRequiredLine + 1, totalLines);
    for (let lineNum = checkStartLine; lineNum <= checkEndLine; lineNum++) {
      const lineContent = model.getLineContent(lineNum);
      if (lineContent.trim().length > 0) {
        hasContentBelow = true;
        break;
      }
    }
    
    // 如果目标位置之后有内容，需要先插入空行把原有内容往下推
    // 实现思路：在内联聊天下方创建一个空行，从空行开始显示diff内容，将后面的内容全部向下推
    if (hasContentBelow) {
      // 检查是否已经插入过空行
      if (!this.hasPushedContent) {
        const targetLine = position.lineNumber;
        
        // 首次生成时，只插入实际需要的行数，最多预留2行空间以便流式更新
        // 避免插入过多空行，流式更新时会动态补充
        const minEmptyLines = lines.length + 2;
        
        // 检查目标位置是否有内容
        const targetLineContent = model.getLineContent(targetLine);
        const targetLineHasContent = targetLineContent.trim().length > 0;
        
        if (targetLineHasContent) {
          // 如果目标位置有内容，需要把目标位置及其之后的所有内容都推走
          // 然后在目标位置显示diff内容
          // 策略：
          // 1. 在目标行末尾插入空行和目标行内容（为diff内容腾出空间，同时推走目标行及其之后的所有内容）
          // 2. 删除目标行的原始内容（清空目标行，准备显示diff）
          const targetLineMaxColumn = model.getLineMaxColumn(targetLine);
          
          console.log('[GhostTextWidget] 目标位置有内容，推走目标行及其之后的所有内容，然后在目标位置显示diff');
          
          // 第一步：在目标行之后插入空行（这会推走目标行之后的所有内容）
          const emptyLinesForDiff = '\n'.repeat(minEmptyLines);
          
          this.editor.executeEdits('ghost-text-push-content-step1', [{
            range: new monaco.Range(targetLine, targetLineMaxColumn, targetLine, targetLineMaxColumn),
            text: emptyLinesForDiff,
            forceMoveMarkers: true
          }]);
          
          // 第二步：重新获取模型状态，因为插入后行号可能变化
          const updatedModel1 = this.editor.getModel();
          if (!updatedModel1) return;
          
          // 第三步：删除目标行的内容，并在空行之后插入（一次性操作，推走目标行的内容）
          // 插入空行后，目标行现在在 targetLine，空行在 targetLine + 1 到 targetLine + minEmptyLines
          // 需要把目标行的内容移到 targetLine + minEmptyLines + 1
          const updatedTargetLineMaxColumn1 = updatedModel1.getLineMaxColumn(targetLine);
          const targetLineStartColumn = 1;
          
          // 在空行之后插入目标行的内容
          const insertAfterEmptyLinesLine = targetLine + minEmptyLines;
          const insertAfterEmptyLinesColumn = updatedModel1.getLineMaxColumn(insertAfterEmptyLinesLine);
          
          // 一次性操作：删除目标行的内容，并在空行之后插入
          this.editor.executeEdits('ghost-text-push-content-step2', [
            {
              range: new monaco.Range(targetLine, targetLineStartColumn, targetLine, updatedTargetLineMaxColumn1),
              text: '',
              forceMoveMarkers: true
            },
            {
              range: new monaco.Range(insertAfterEmptyLinesLine, insertAfterEmptyLinesColumn, insertAfterEmptyLinesLine, insertAfterEmptyLinesColumn),
              text: '\n' + targetLineContent,
              forceMoveMarkers: true
            }
          ]);
          
          // 第四步：重新获取模型状态，确保模型已完全更新
          const updatedModel2 = this.editor.getModel();
          if (!updatedModel2) return;
          
          // 更新totalLines为最新值
          totalLines = updatedModel2.getLineCount();
          
          // 插入空行并推走内容后，diff应该显示在目标行（targetLine）上
          // position的行号保持不变，因为diff就显示在targetLine上
        } else {
          // 如果目标位置没有内容，在目标位置之后插入空行
          const targetLineMaxColumn = model.getLineMaxColumn(targetLine);
          const emptyLines = '\n'.repeat(minEmptyLines);
          
          console.log('[GhostTextWidget] 目标位置没有内容，在目标位置之后插入', minEmptyLines, '个空行，将目标位置之后的所有内容向下推');
          
          this.editor.executeEdits('ghost-text-push-content', [{
            range: new monaco.Range(targetLine, targetLineMaxColumn, targetLine, targetLineMaxColumn),
            text: emptyLines,
            forceMoveMarkers: true
          }]);
        }
        
        // 插入/替换后，重新获取模型状态（因为编辑后行数可能变化）
        // 如果已经在上面更新了totalLines（targetLineHasContent的情况），这里就不需要再次更新
        if (!targetLineHasContent) {
          const updatedModel = this.editor.getModel();
          if (updatedModel) {
            totalLines = updatedModel.getLineCount();
          } else {
            totalLines = model.getLineCount();
          }
        }
        
        // 更新总行数和已插入的最大行号
        // 重新计算maxRequiredLine，因为可能已经插入了空行，行号可能变化
        // 首次生成时，如果插入了更多空行（minEmptyLines），需要更新maxInsertedLine
        const finalMaxRequiredLine = position.lineNumber + minEmptyLines - 1;
        this.maxInsertedLine = Math.max(this.maxInsertedLine, finalMaxRequiredLine);
        console.log('[GhostTextWidget] 插入空行后文档总行数:', totalLines, '已插入最大行:', this.maxInsertedLine, '最终需要的最大行:', finalMaxRequiredLine);
        
        // 标记已经插入过空行
        this.hasPushedContent = true;
      } else {
        // 已经插入过空行，检查是否需要补充（流式更新时内容变多）
        // 只补充插入新增的行数，避免重复插入
        const currentMaxLine = position.lineNumber + lines.length - 1;
        if (currentMaxLine > this.maxInsertedLine) {
          const linesToAdd = currentMaxLine - this.maxInsertedLine;
          const insertLine = position.lineNumber + (this.maxInsertedLine - position.lineNumber + 1);
          const insertLineMaxColumn = model.getLineMaxColumn(insertLine);
          
          console.log('[GhostTextWidget] 流式更新内容变多，补充插入', linesToAdd, '个空行（当前最大行:', currentMaxLine, '已插入最大行:', this.maxInsertedLine, '）');
          
          this.editor.executeEdits('ghost-text-push-content-supplement', [{
            range: new monaco.Range(insertLine, insertLineMaxColumn, insertLine, insertLineMaxColumn),
            text: '\n'.repeat(linesToAdd),
            forceMoveMarkers: true
          }]);
          
          // 更新总行数和已插入的最大行号
          totalLines = model.getLineCount();
          this.maxInsertedLine = currentMaxLine;
        }
      }
    }
    
    // 如果需要的行数超过了文档现有行数，先插入空行
    // 但只在需要时才插入，避免流式更新时重复插入
    if (maxRequiredLine > totalLines) {
      // 检查是否已经插入过足够的行数
      // 如果 maxInsertedLine >= maxRequiredLine，说明已经插入过足够的行，不需要再插入
      if (maxRequiredLine > this.maxInsertedLine) {
        // 计算需要插入的行数
        // 如果之前已经插入过，只需要插入新增的部分
        // 如果之前没有插入过，需要插入 maxRequiredLine - totalLines 行
        const linesToAdd = maxRequiredLine - Math.max(totalLines, this.maxInsertedLine);
        const lastLineMaxColumn = model.getLineMaxColumn(totalLines);
        
        console.log('[GhostTextWidget] 需要插入', linesToAdd, '个空行（总需要:', maxRequiredLine, '当前文档:', totalLines, '已插入最大行:', this.maxInsertedLine, '）');
        
        if (linesToAdd > 0) {
          this.editor.executeEdits('ghost-text-prepare', [{
            range: new monaco.Range(totalLines, lastLineMaxColumn, totalLines, lastLineMaxColumn),
            text: '\n'.repeat(linesToAdd),
            forceMoveMarkers: true
          }]);
          
          // 更新总行数和已插入的最大行号
          totalLines = model.getLineCount();
          this.maxInsertedLine = maxRequiredLine;
          console.log('[GhostTextWidget] 插入后文档总行数:', totalLines, '已插入最大行:', this.maxInsertedLine);
        }
      }
    }

    // 重新获取模型以确保使用最新的状态（编辑后模型会自动更新，但为了保险起见）
    // 在显示diff之前，再次获取最新的模型状态，确保所有编辑操作都已完成
    const currentModel = this.editor.getModel();
    if (!currentModel) return;
    
    // 重新获取最新的总行数，确保使用最新的模型状态
    const finalTotalLines = currentModel.getLineCount();
    if (finalTotalLines !== totalLines) {
      console.log('[GhostTextWidget] 模型状态已更新，总行数从', totalLines, '变为', finalTotalLines);
      totalLines = finalTotalLines;
    }
    
    lines.forEach((line, index) => {
      const lineNumber = position.lineNumber + index;
      
      // 检查行号是否有效（理论上现在应该都有效了）
      if (lineNumber < 1 || lineNumber > totalLines) {
        console.warn('[GhostTextWidget] 跳过无效行号:', lineNumber, '(文档总行数:', totalLines, ')');
        return;
      }
      
      // 获取目标行的内容（使用最新的模型状态）
      const lineContent = currentModel.getLineContent(lineNumber);
      
      // 如果行为空或只有空白字符，在行首显示
      // 否则在行尾显示（这种情况应该很少了，因为我们已经把内容往下推了）
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
    this.hasPushedContent = false; // 重置标记
    this.maxInsertedLine = 0; // 重置已插入的最大行号

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
