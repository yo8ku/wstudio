/**
 * Markdown 命令提供器
 * 功能：
 * - 为命令中心提供Markdown相关命令
 * - 注册内置Markdown插件的所有功能
 * - 支持文本格式化、插入元素、预览等
 * 
 * 注意：
 * - 命令执行依赖于全局Monaco Editor实例
 * - 编辑器实例通过window.__monacoEditor访问
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';
import type * as monaco from 'monaco-editor';
import { MonacoMarkdownActions } from './MonacoMarkdownActions';

export class MarkdownCommandProvider {
  private commandCenter: VSCodeCommandCenter;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.initialize();
  }

  private initialize(): void {
    this.registerMarkdownCommands();
  }

  /**
   * 注册 Markdown 相关命令
   */
  private registerMarkdownCommands(): void {
    const commands: Command[] = [];

    // ============ 文本格式化命============

    // 加粗
    commands.push({
      id: 'mdEditor.toggleBold',
      label: 'Markdown: 加粗',
      displayId: 'Markdown: Toggle Bold',
      description: '将选中文本加粗',
      category: 'Markdown',
      icon: '𝐁',
      keybinding: 'Ctrl+B',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleBold');
      },
      when: () => this.isMarkdownEditor()
    });

    // 斜体
    commands.push({
      id: 'mdEditor.toggleItalic',
      label: 'Markdown: 斜体',
      displayId: 'Markdown: Toggle Italic',
      description: '将选中文本设为斜体',
      category: 'Markdown',
      icon: '𝐼',
      keybinding: 'Ctrl+I',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleItalic');
      },
      when: () => this.isMarkdownEditor()
    });

    // 删除线
    commands.push({
      id: 'mdEditor.toggleStrikethrough',
      label: 'Markdown: 删除线',
      displayId: 'Markdown: Toggle Strikethrough',
      description: '添加删除线效果',
      category: 'Markdown',
      icon: '̶S̶',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleStrikethrough');
      },
      when: () => this.isMarkdownEditor()
    });

    // 行内代码
    commands.push({
      id: 'mdEditor.toggleCode',
      label: 'Markdown: 行内代码',
      displayId: 'Markdown: Toggle Code',
      description: '将选中文本标记为代码',
      category: 'Markdown',
      icon: '`',
      keybinding: 'Ctrl+`',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleCode');
      },
      when: () => this.isMarkdownEditor()
    });

    // 代码块
    commands.push({
      id: 'mdEditor.toggleCodeBlock',
      label: 'Markdown: 代码块',
      displayId: 'Markdown: Toggle Code Block',
      description: '插入多行代码块',
      category: 'Markdown',
      icon: '```',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleCodeBlock');
      },
      when: () => this.isMarkdownEditor()
    });

    // ============ 插入元素命令 ============

    // 插入链接
    commands.push({
      id: 'mdEditor.insertLink',
      label: 'Markdown: 插入链接',
      displayId: 'Markdown: Insert Link',
      description: '插入超链接',
      category: 'Markdown',
      icon: 'link',
      keybinding: 'Ctrl+K',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.insertLink');
      },
      when: () => this.isMarkdownEditor()
    });

    // 插入图片
    commands.push({
      id: 'mdEditor.insertImage',
      label: 'Markdown: 插入图片',
      displayId: 'Markdown: Insert Image',
      description: '插入图片引用',
      category: 'Markdown',
      icon: 'image',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.insertImage');
      },
      when: () => this.isMarkdownEditor()
    });

    // 插入表格
    commands.push({
      id: 'mdEditor.insertTable',
      label: 'Markdown: 插入表格',
      displayId: 'Markdown: Insert Table',
      description: '快速插入表格模块,',
      category: 'Markdown',
      icon: 'table',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.insertTable');
      },
      when: () => this.isMarkdownEditor()
    });

    // 插入分割线
    commands.push({
      id: 'mdEditor.insertHorizontalRule',
      label: 'Markdown: 插入分割线',
      displayId: 'Markdown: Insert Horizontal Rule',
      description: '添加水平分割线',
      category: 'Markdown',
      icon: '─',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.insertHorizontalRule');
      },
      when: () => this.isMarkdownEditor()
    });

    // ============ 标题命令 ============

    // 一级标题
    commands.push({
      id: 'mdEditor.toggleHeading1',
      label: 'Markdown: 一级标题',
      displayId: 'Markdown: Toggle Heading 1',
      description: '将当前行转换为H1',
      category: 'Markdown',
      icon: 'H1',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleHeading1');
      },
      when: () => this.isMarkdownEditor()
    });

    // 二级标题
    commands.push({
      id: 'mdEditor.toggleHeading2',
      label: 'Markdown: 二级标题',
      displayId: 'Markdown: Toggle Heading 2',
      description: '将当前行转换为H2',
      category: 'Markdown',
      icon: 'H2',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleHeading2');
      },
      when: () => this.isMarkdownEditor()
    });

    // 三级标题
    commands.push({
      id: 'mdEditor.toggleHeading3',
      label: 'Markdown: 三级标题',
      displayId: 'Markdown: Toggle Heading 3',
      description: '将当前行转换为H3',
      category: 'Markdown',
      icon: 'H3',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleHeading3');
      },
      when: () => this.isMarkdownEditor()
    });

    // ============ 列表命令 ============

    // 无序列表
    commands.push({
      id: 'mdEditor.toggleUnorderedList',
      label: 'Markdown: 无序列表',
      displayId: 'Markdown: Toggle Unordered List',
      description: '创建无序列表',
      category: 'Markdown',
      icon: '□',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleUnorderedList');
      },
      when: () => this.isMarkdownEditor()
    });

    // 有序列表
    commands.push({
      id: 'mdEditor.toggleOrderedList',
      label: 'Markdown: 有序列表',
      displayId: 'Markdown: Toggle Ordered List',
      description: '创建有序列表',
      category: 'Markdown',
      icon: '1.',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleOrderedList');
      },
      when: () => this.isMarkdownEditor()
    });

    // 任务列表
    commands.push({
      id: 'mdEditor.toggleTaskList',
      label: 'Markdown: 任务列表',
      displayId: 'Markdown: Toggle Task List',
      description: '创建可勾选的任务列表',
      category: 'Markdown',
      icon: '□',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleTaskList');
      },
      when: () => this.isMarkdownEditor()
    });

    // 引用
    commands.push({
      id: 'mdEditor.toggleQuote',
      label: 'Markdown: 引用',
      displayId: 'Markdown: Toggle Quote',
      description: '添加引用块',
      category: 'Markdown',
      icon: '□',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.toggleQuote');
      },
      when: () => this.isMarkdownEditor()
    });

    // ============ 预览命令 ============

    // 打开预览
    commands.push({
      id: 'mdEditor.showPreview',
      label: 'Markdown: 打开预览',
      displayId: 'Markdown: Open Preview',
      description: '在新标签页中预览',
      category: 'Markdown',
      icon: 'eye',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.showPreview');
      },
      when: () => this.isMarkdownEditor()
    });

    // 侧边预览
    commands.push({
      id: 'mdEditor.showPreviewToSide',
      label: 'Markdown: 在侧边打开预览',
      displayId: 'Markdown: Open Preview to the Side',
      description: '分屏预览',
      category: 'Markdown',
      icon: '□',
      keybinding: 'Ctrl+Shift+V',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.showPreviewToSide');
      },
      when: () => this.isMarkdownEditor()
    });

    // ============ 格式化命令 ============

    // 格式化文档
    commands.push({
      id: 'mdEditor.formatDocument',
      label: 'Markdown: 格式化文档',
      displayId: 'Markdown: Format Document',
      description: '自动格式化整个Markdown文档',
      category: 'Markdown',
      icon: '□',
      execute: async () => {
        await this.executeVSCodeCommand('mdEditor.formatDocument');
      },
      when: () => this.isMarkdownEditor()
    });

    // 批量注册所有命令
    this.commandCenter.registerCommands(commands);

    console.log(`[MarkdownCommandProvider] 已注册${commands.length}个Markdown命令`);
  }

  /**
   * 检查当前是否是 Markdown 编辑器   */
  private isMarkdownEditor(): boolean {
    try {
      const editor = this.getMonacoEditor();
      if (!editor) return false; // 如果没有编辑器，不显示命令
    const model = editor.getModel();
      if (!model) return false;
      
      const language = model.getLanguageId();
      return language === 'markdown';
    } catch (error) {
      console.warn('[MarkdownCommandProvider] 无法检查编辑器类型:', error);
      return false; // 出错时不显示命令
    }
  }

  /**
   * 获取当前的Monaco Editor实例
   */
  private getMonacoEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return (window as any).__monacoEditor || null;
  }

  /**
   * 显示通知消息
   */
  private showNotification(message: string): void {
    // 简单的通知实现，后续可以集成到通知系统
    console.info(`[通知] ${message}`);
    // TODO: 集成到应用的通知系统
  }

  /**
   * 执行 Monaco 编辑器命令
   * 
   * 注意：这里不是执行VSCode API命令，而是直接操作Monaco Editor
   * 因为在浏览器环境中，我们需要手动实现这些Markdown编辑功能
   */
  private async executeVSCodeCommand(commandId: string): Promise<void> {
    console.log('[MarkdownCommandProvider] 执行命令:', commandId);
    const editor = this.getMonacoEditor();
    console.log('[MarkdownCommandProvider] 编辑器实例', editor);
    
    if (!editor) {
      console.warn('[MarkdownCommandProvider] Monaco Editor 实例不可用，请先打开一个Markdown文件');
      this.showNotification('请先打开一个Markdown编辑器');
      return;
    }

    // 检查编辑器状态
    const model = editor.getModel();
    const monacoInstance = (window as any).monaco;
    console.log('[MarkdownCommandProvider] 编辑器模块', model);
    if (monacoInstance) {
      console.log('[MarkdownCommandProvider] 编辑器只读状态', editor.getOption(monacoInstance.editor.EditorOption.readOnly));
    }
    console.log('[MarkdownCommandProvider] 当前选区:', editor.getSelection());

    try {
      console.log('[MarkdownCommandProvider] 创建 MonacoMarkdownActions 实例...');
      const actions = new MonacoMarkdownActions(editor);
      console.log('[MarkdownCommandProvider] MonacoMarkdownActions 实例创建成功');

      // 映射命令 ID 到对应的方法
    const commandMap: Record<string, () => void> = {
        'mdEditor.toggleBold': () => actions.toggleBold(),
        'mdEditor.toggleItalic': () => actions.toggleItalic(),
        'mdEditor.toggleStrikethrough': () => actions.toggleStrikethrough(),
        'mdEditor.toggleCode': () => actions.toggleCode(),
        'mdEditor.toggleCodeBlock': () => actions.toggleCodeBlock(),
        'mdEditor.insertLink': () => actions.insertLink(),
        'mdEditor.insertImage': () => actions.insertImage(),
        'mdEditor.insertTable': () => actions.insertTable(),
        'mdEditor.toggleHeading1': () => actions.toggleHeading1(),
        'mdEditor.toggleHeading2': () => actions.toggleHeading2(),
        'mdEditor.toggleHeading3': () => actions.toggleHeading3(),
        'mdEditor.toggleUnorderedList': () => actions.toggleUnorderedList(),
        'mdEditor.toggleOrderedList': () => actions.toggleOrderedList(),
        'mdEditor.toggleTaskList': () => actions.toggleTaskList(),
        'mdEditor.toggleQuote': () => actions.toggleQuote(),
        'mdEditor.insertHorizontalRule': () => actions.insertHorizontalRule(),
        'mdEditor.showPreview': () => actions.showPreview(),
        'mdEditor.showPreviewToSide': () => actions.showPreviewToSide(),
        'mdEditor.formatDocument': () => actions.formatDocument(),
      };

      const handler = commandMap[commandId];
      if (handler) {
        console.log('[MarkdownCommandProvider] 执行命令处理..');
        handler();
        console.log('[MarkdownCommandProvider] 命令执行完成');
      } else {
        console.warn(`[MarkdownCommandProvider] 未知命令: ${commandId}`);
      }
    } catch (error) {
      console.error(`[MarkdownCommandProvider] 执行命令失败: ${commandId}`, error);
      this.showNotification(`执行命令失败: ${error}`);
    }
  }

}

