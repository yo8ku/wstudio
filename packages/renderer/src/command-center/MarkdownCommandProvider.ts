/**
 * Markdown 命令提供器。
 * 为命令中心注册基于 CodeMirror 的 Markdown 编辑命令。
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command } from './CommandTypes';
import { CodeMirrorMarkdownActions } from './CodeMirrorMarkdownActions';
import {
  getActiveCodeMirrorEditorMeta,
  getActiveCodeMirrorEditorView,
} from '../lib/editor/activeCodeMirrorEditor';

interface MarkdownCommandDefinition {
  readonly id: string;
  readonly label: string;
  readonly displayId: string;
  readonly description: string;
  readonly icon: string;
  readonly keybinding?: string;
}

const MARKDOWN_COMMAND_DEFINITIONS: readonly MarkdownCommandDefinition[] = [
  {
    id: 'mdEditor.toggleBold',
    label: 'Markdown: 加粗',
    displayId: 'Markdown: Toggle Bold',
    description: '将选中文本切换为加粗',
    icon: 'B',
    keybinding: 'Ctrl+B',
  },
  {
    id: 'mdEditor.toggleItalic',
    label: 'Markdown: 斜体',
    displayId: 'Markdown: Toggle Italic',
    description: '将选中文本切换为斜体',
    icon: 'I',
    keybinding: 'Ctrl+I',
  },
  {
    id: 'mdEditor.toggleStrikethrough',
    label: 'Markdown: 删除线',
    displayId: 'Markdown: Toggle Strikethrough',
    description: '将选中文本切换为删除线',
    icon: 'S',
  },
  {
    id: 'mdEditor.toggleCode',
    label: 'Markdown: 行内代码',
    displayId: 'Markdown: Toggle Code',
    description: '将选中文本切换为行内代码',
    icon: '`',
    keybinding: 'Ctrl+`',
  },
  {
    id: 'mdEditor.toggleCodeBlock',
    label: 'Markdown: 代码块',
    displayId: 'Markdown: Toggle Code Block',
    description: '插入或包裹多行代码块',
    icon: '```',
  },
  {
    id: 'mdEditor.insertLink',
    label: 'Markdown: 插入链接',
    displayId: 'Markdown: Insert Link',
    description: '插入 Markdown 链接',
    icon: 'link',
    keybinding: 'Ctrl+K',
  },
  {
    id: 'mdEditor.insertImage',
    label: 'Markdown: 插入图片',
    displayId: 'Markdown: Insert Image',
    description: '插入 Markdown 图片',
    icon: 'image',
  },
  {
    id: 'mdEditor.insertTable',
    label: 'Markdown: 插入表格',
    displayId: 'Markdown: Insert Table',
    description: '插入 Markdown 表格模板',
    icon: 'table',
  },
  {
    id: 'mdEditor.insertHorizontalRule',
    label: 'Markdown: 插入分割线',
    displayId: 'Markdown: Insert Horizontal Rule',
    description: '插入 Markdown 分割线',
    icon: '---',
  },
  {
    id: 'mdEditor.toggleHeading1',
    label: 'Markdown: 一级标题',
    displayId: 'Markdown: Toggle Heading 1',
    description: '将当前行切换为 H1',
    icon: 'H1',
  },
  {
    id: 'mdEditor.toggleHeading2',
    label: 'Markdown: 二级标题',
    displayId: 'Markdown: Toggle Heading 2',
    description: '将当前行切换为 H2',
    icon: 'H2',
  },
  {
    id: 'mdEditor.toggleHeading3',
    label: 'Markdown: 三级标题',
    displayId: 'Markdown: Toggle Heading 3',
    description: '将当前行切换为 H3',
    icon: 'H3',
  },
  {
    id: 'mdEditor.toggleUnorderedList',
    label: 'Markdown: 无序列表',
    displayId: 'Markdown: Toggle Unordered List',
    description: '将当前行切换为无序列表',
    icon: 'ul',
  },
  {
    id: 'mdEditor.toggleOrderedList',
    label: 'Markdown: 有序列表',
    displayId: 'Markdown: Toggle Ordered List',
    description: '将当前行切换为有序列表',
    icon: 'ol',
  },
  {
    id: 'mdEditor.toggleTaskList',
    label: 'Markdown: 任务列表',
    displayId: 'Markdown: Toggle Task List',
    description: '将当前行切换为任务列表',
    icon: 'todo',
  },
  {
    id: 'mdEditor.toggleQuote',
    label: 'Markdown: 引用',
    displayId: 'Markdown: Toggle Quote',
    description: '将当前行切换为引用',
    icon: 'quote',
  },
  {
    id: 'mdEditor.showPreview',
    label: 'Markdown: 打开预览',
    displayId: 'Markdown: Open Preview',
    description: '打开当前文档预览',
    icon: 'eye',
  },
  {
    id: 'mdEditor.showPreviewToSide',
    label: 'Markdown: 在侧边打开预览',
    displayId: 'Markdown: Open Preview to the Side',
    description: '在侧边打开当前文档预览',
    icon: 'split',
    keybinding: 'Ctrl+Shift+V',
  },
  {
    id: 'mdEditor.formatDocument',
    label: 'Markdown: 格式化文档',
    displayId: 'Markdown: Format Document',
    description: '格式化当前 Markdown 文档',
    icon: 'fmt',
  },
];

export class MarkdownCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerMarkdownCommands();
  }

  private registerMarkdownCommands(): void {
    const commands: Command[] = MARKDOWN_COMMAND_DEFINITIONS.map((definition) => ({
      id: definition.id,
      label: definition.label,
      displayId: definition.displayId,
      description: definition.description,
      category: 'Markdown',
      icon: definition.icon,
      keybinding: definition.keybinding,
      execute: async () => {
        await this.executeMarkdownCommand(definition.id);
      },
      when: () => this.isMarkdownEditor(),
    }));

    this.commandCenter.registerCommands(commands);
  }

  private isMarkdownEditor(): boolean {
    const view = getActiveCodeMirrorEditorView();
    if (!view) {
      return false;
    }

    return getActiveCodeMirrorEditorMeta().language === 'markdown';
  }

  private showNotification(message: string): void {
    console.info(`[通知] ${message}`);
  }

  private async executeMarkdownCommand(commandId: string): Promise<void> {
    const view = getActiveCodeMirrorEditorView();
    if (!view) {
      this.showNotification('请先打开一个 Markdown 文档');
      return;
    }

    try {
      const actions = new CodeMirrorMarkdownActions(view);
      const commandMap: Record<string, () => void> = {
        'mdEditor.toggleBold': () => actions.toggleBold(),
        'mdEditor.toggleItalic': () => actions.toggleItalic(),
        'mdEditor.toggleStrikethrough': () => actions.toggleStrikethrough(),
        'mdEditor.toggleCode': () => actions.toggleCode(),
        'mdEditor.toggleCodeBlock': () => actions.toggleCodeBlock(),
        'mdEditor.insertLink': () => actions.insertLink(),
        'mdEditor.insertImage': () => actions.insertImage(),
        'mdEditor.insertTable': () => actions.insertTable(),
        'mdEditor.insertHorizontalRule': () => actions.insertHorizontalRule(),
        'mdEditor.toggleHeading1': () => actions.toggleHeading1(),
        'mdEditor.toggleHeading2': () => actions.toggleHeading2(),
        'mdEditor.toggleHeading3': () => actions.toggleHeading3(),
        'mdEditor.toggleUnorderedList': () => actions.toggleUnorderedList(),
        'mdEditor.toggleOrderedList': () => actions.toggleOrderedList(),
        'mdEditor.toggleTaskList': () => actions.toggleTaskList(),
        'mdEditor.toggleQuote': () => actions.toggleQuote(),
        'mdEditor.showPreview': () => actions.showPreview(),
        'mdEditor.showPreviewToSide': () => actions.showPreviewToSide(),
        'mdEditor.formatDocument': () => actions.formatDocument(),
      };

      const handler = commandMap[commandId];
      if (!handler) {
        console.warn(`[MarkdownCommandProvider] 未知命令: ${commandId}`);
        return;
      }

      handler();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MarkdownCommandProvider] 执行命令失败: ${commandId}`, error);
      this.showNotification(`执行命令失败: ${message}`);
    }
  }
}
