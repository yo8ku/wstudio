/**
 * Monaco Editor Markdown 操作
 * 
 * 功能：
 * - 提供直接操作 Monaco Editor 的 Markdown 编辑功能
 * - 实现文本格式化、插入元素等操作
 * - 不依赖 VSCode API，直接使用 Monaco Editor API
 */

import type * as monaco from 'monaco-editor';

// 获取全局 Monaco 对象
const getMonaco = () => (window as any).monaco;

export class MonacoMarkdownActions {
  private editor: monaco.editor.IStandaloneCodeEditor;

  constructor(editor: monaco.editor.IStandaloneCodeEditor) {
    this.editor = editor;
  }

  /**
   * 获取当前选择或光标位置
   */
  private getSelection(): monaco.Selection {
    const selection = this.editor.getSelection();
    if (!selection) {
      throw new Error('无法获取编辑器选择');
    }
    return selection;
  }

  /**
   * 获取选中的文本
   */
  private getSelectedText(): string {
    const model = this.editor.getModel();
    if (!model) return '';
    
    const selection = this.getSelection();
    return model.getValueInRange(selection);
  }

  /**
   * 包装选中文本
   */
  private wrapSelection(prefix: string, suffix: string = prefix): void {
    console.log('[MonacoMarkdownActions] wrapSelection 开始, prefix:', prefix, 'suffix:', suffix);
    const model = this.editor.getModel();
    if (!model) {
      console.error('[MonacoMarkdownActions] 无法获取编辑器模型');
      return;
    }
    console.log('[MonacoMarkdownActions] 模型获取成功');

    const selection = this.getSelection();
    console.log('[MonacoMarkdownActions] 获取选区:', selection);
    
    const text = this.getSelectedText();
    console.log('[MonacoMarkdownActions] 当前选中文本:', JSON.stringify(text));

    // 检查是否已经被包装
    const monaco = getMonaco();
    console.log('[MonacoMarkdownActions] Monaco 实例:', monaco ? '存在' : '不存在');
    
    if (!monaco) {
      console.error('[MonacoMarkdownActions] Monaco 实例不可用');
      return;
    }

    const range = new monaco.Range(
      selection.startLineNumber,
      Math.max(1, selection.startColumn - prefix.length),
      selection.endLineNumber,
      selection.endColumn + suffix.length
    );
    console.log('[MonacoMarkdownActions] 创建范围:', range);

    const wrappedText = model.getValueInRange(range);
    console.log('[MonacoMarkdownActions] wrappedText:', JSON.stringify(wrappedText));

    const shouldUnwrap = wrappedText.startsWith(prefix) && wrappedText.endsWith(suffix);
    const targetRange = shouldUnwrap ? range : selection;
    const newText = shouldUnwrap ? text : `${prefix}${text}${suffix}`;
    
    console.log('[MonacoMarkdownActions] 准备编辑 - shouldUnwrap:', shouldUnwrap, 'newText:', JSON.stringify(newText));
    console.log('[MonacoMarkdownActions] targetRange:', targetRange);
    
    const result = this.editor.executeEdits('markdown', [{
      range: targetRange,
      text: newText
    }]);
    
    console.log('[MonacoMarkdownActions] executeEdits 结果:', result);
    console.log('[MonacoMarkdownActions] 编辑后的文本:', model.getValue());

    // 恢复选择
    this.editor.focus();
    console.log('[MonacoMarkdownActions] wrapSelection 完成');
  }

  /**
   * 切换行级前缀
   */
  private toggleLinePrefix(prefix: string): void {
    const model = this.editor.getModel();
    if (!model) return;

    const selection = this.getSelection();
    const lineNumber = selection.startLineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const trimmedText = lineContent.trimStart();
    const indent = lineContent.substring(0, lineContent.length - trimmedText.length);

    let newText: string;
    if (trimmedText.startsWith(prefix)) {
      // 移除前缀
      newText = indent + trimmedText.substring(prefix.length).trimStart();
    } else {
      // 添加前缀
      newText = indent + prefix + ' ' + trimmedText;
    }

    const monaco = getMonaco();
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    this.editor.executeEdits('markdown', [{
      range,
      text: newText
    }]);

    this.editor.focus();
  }

  // ============ 文本格式化命令 ============

  /**
   * 加粗
   */
  toggleBold(): void {
    console.log('[MonacoMarkdownActions] 执行 toggleBold');
    this.wrapSelection('**');
    console.log('[MonacoMarkdownActions] toggleBold 完成');
  }

  /**
   * 斜体
   */
  toggleItalic(): void {
    this.wrapSelection('*');
  }

  /**
   * 删除线
   */
  toggleStrikethrough(): void {
    this.wrapSelection('~~');
  }

  /**
   * 行内代码
   */
  toggleCode(): void {
    this.wrapSelection('`');
  }

  /**
   * 代码块
   */
  toggleCodeBlock(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const selection = this.getSelection();
    const text = this.getSelectedText();

    const newText = text.includes('\n') 
      ? `\`\`\`\n${text}\n\`\`\``
      : `\`\`\`\n${text || 'code'}\n\`\`\``;

    this.editor.executeEdits('markdown', [{
      range: selection,
      text: newText
    }]);

    this.editor.focus();
  }

  // ============ 插入元素命令 ============

  /**
   * 插入链接
   */
  insertLink(): void {
    const selectedText = this.getSelectedText();
    const linkText = selectedText || '链接文本';
    const url = 'https://example.com';

    const selection = this.getSelection();
    this.editor.executeEdits('markdown', [{
      range: selection,
      text: `[${linkText}](${url})`
    }]);

    // 选中 URL 部分以便用户直接编辑
    const monaco = getMonaco();
    const newSelection = new monaco.Selection(
      selection.startLineNumber,
      selection.startColumn + linkText.length + 3,
      selection.startLineNumber,
      selection.startColumn + linkText.length + 3 + url.length
    );
    this.editor.setSelection(newSelection);
    this.editor.focus();
  }

  /**
   * 插入图片
   */
  insertImage(): void {
    const selectedText = this.getSelectedText();
    const altText = selectedText || '图片描述';
    const url = 'https://example.com/image.png';

    const selection = this.getSelection();
    this.editor.executeEdits('markdown', [{
      range: selection,
      text: `![${altText}](${url})`
    }]);

    // 选中 URL 部分以便用户直接编辑
    const monaco = getMonaco();
    const newSelection = new monaco.Selection(
      selection.startLineNumber,
      selection.startColumn + altText.length + 4,
      selection.startLineNumber,
      selection.startColumn + altText.length + 4 + url.length
    );
    this.editor.setSelection(newSelection);
    this.editor.focus();
  }

  /**
   * 插入表格
   */
  insertTable(): void {
    const table = `| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n| 内容 | 内容 | 内容 |`;
    
    const selection = this.getSelection();
    this.editor.executeEdits('markdown', [{
      range: selection,
      text: table
    }]);

    this.editor.focus();
  }

  // ============ 标题命令 ============

  /**
   * 切换标题
   */
  toggleHeading(level: number): void {
    const model = this.editor.getModel();
    if (!model) return;

    const selection = this.getSelection();
    const lineNumber = selection.startLineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const prefix = '#'.repeat(level);

    // 检查当前行是否已经是标题
    const headingMatch = lineContent.match(/^(#{1,6})\s/);

    let newText: string;
    if (headingMatch && headingMatch[1].length === level) {
      // 移除标题
      newText = lineContent.replace(/^#{1,6}\s/, '');
    } else if (headingMatch) {
      // 更改标题级别
      newText = lineContent.replace(/^#{1,6}\s/, `${prefix} `);
    } else {
      // 添加标题
      newText = `${prefix} ${lineContent}`;
    }

    const monaco = getMonaco();
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    this.editor.executeEdits('markdown', [{
      range,
      text: newText
    }]);

    this.editor.focus();
  }

  toggleHeading1(): void {
    this.toggleHeading(1);
  }

  toggleHeading2(): void {
    this.toggleHeading(2);
  }

  toggleHeading3(): void {
    this.toggleHeading(3);
  }

  // ============ 列表命令 ============

  /**
   * 无序列表
   */
  toggleUnorderedList(): void {
    this.toggleLinePrefix('-');
  }

  /**
   * 有序列表
   */
  toggleOrderedList(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const selection = this.getSelection();
    const lineNumber = selection.startLineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const trimmedText = lineContent.trimStart();
    const indent = lineContent.substring(0, lineContent.length - trimmedText.length);

    let newText: string;
    if (/^\d+\.\s/.test(trimmedText)) {
      // 移除序号
      newText = indent + trimmedText.replace(/^\d+\.\s/, '');
    } else {
      // 添加序号
      newText = indent + '1. ' + trimmedText;
    }

    const monaco = getMonaco();
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    this.editor.executeEdits('markdown', [{
      range,
      text: newText
    }]);

    this.editor.focus();
  }

  /**
   * 任务列表
   */
  toggleTaskList(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const selection = this.getSelection();
    const lineNumber = selection.startLineNumber;
    const lineContent = model.getLineContent(lineNumber);
    const trimmedText = lineContent.trimStart();
    const indent = lineContent.substring(0, lineContent.length - trimmedText.length);

    let newText: string;
    if (/^-\s\[\s?\]\s/.test(trimmedText) || /^-\s\[x\]\s/.test(trimmedText)) {
      // 移除任务列表
      newText = indent + trimmedText.replace(/^-\s\[[\sx]\]\s/, '');
    } else {
      // 添加任务列表
      const baseText = trimmedText.replace(/^-\s/, '');
      newText = indent + '- [ ] ' + baseText;
    }

    const monaco = getMonaco();
    const range = new monaco.Range(lineNumber, 1, lineNumber, lineContent.length + 1);
    this.editor.executeEdits('markdown', [{
      range,
      text: newText
    }]);

    this.editor.focus();
  }

  // ============ 其他命令 ============

  /**
   * 引用
   */
  toggleQuote(): void {
    this.toggleLinePrefix('>');
  }

  /**
   * 插入分隔线
   */
  insertHorizontalRule(): void {
    const selection = this.getSelection();
    this.editor.executeEdits('markdown', [{
      range: selection,
      text: '\n---\n'
    }]);

    this.editor.focus();
  }

  /**
   * 格式化文档
   */
  formatDocument(): void {
    const model = this.editor.getModel();
    if (!model) return;

    const text = model.getValue();

    // 基本格式化规则
    const formatted = text
      // 标题后添加空行
      .replace(/(^#{1,6}\s.+$)/gm, '$1\n')
      // 代码块前后添加空行
      .replace(/([^\n])(```)/g, '$1\n\n$2')
      .replace(/(```[^\n]*\n)/g, '$1\n')
      // 列表项之间的空行
      .replace(/(\n[-*+]\s.+)(\n[-*+]\s)/g, '$1\n$2')
      // 移除多余空行（最多保留一个空行）
      .replace(/\n{3,}/g, '\n\n')
      // 文件末尾添加换行
      .replace(/([^\n])$/g, '$1\n');

    const fullRange = model.getFullModelRange();
    this.editor.executeEdits('markdown', [{
      range: fullRange,
      text: formatted
    }]);

    this.editor.focus();
  }

  /**
   * 显示预览（占位，需要后续实现）
   */
  showPreview(): void {
    console.log('[MonacoMarkdownActions] 预览功能待实现');
    // TODO: 实现 Markdown 预览
  }

  /**
   * 在侧边显示预览
   */
  showPreviewToSide(): void {
    console.log('[MonacoMarkdownActions] 打开 Markdown 预览');
    
    const model = this.editor.getModel();
    if (!model) {
      console.error('[MonacoMarkdownActions] 无法获取编辑器模型');
      return;
    }

    // 获取当前编辑器内容
    const content = model.getValue();
    
    // 从全局获取当前标签页 ID 和标题
    const sourceTabId = (window as any).__currentTabId;
    const tabTitle = (window as any).__currentTabTitle;
    
    if (!sourceTabId || !tabTitle) {
      console.error('[MonacoMarkdownActions] 无法获取当前标签页信息');
      return;
    }
    
    console.log('[MonacoMarkdownActions] 触发预览事件:', { 
      sourceTabId, 
      tabTitle,
      contentLength: content.length 
    });
    
    // 触发全局事件，通知 EditorArea 创建预览标签页
    window.dispatchEvent(new CustomEvent('show-markdown-preview', {
      detail: {
        content: content,
        sourceTabId: sourceTabId,
        title: tabTitle
      }
    }));
  }
}

