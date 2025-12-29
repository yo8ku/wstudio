/**
 * CodeMirror 内联 AI 聊天 Widget
 * 功能：在 CodeMirror 编辑器中创建内联 AI 聊天区域
 * 描述：使用 CodeMirror 的 WidgetType 和 Decoration API 实现
 */

import { EditorView, WidgetType, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { InlineAIChatComponent } from './InlineAIChat';

/** 显示内联 AI 聊天的 Effect */
export const showInlineAIChat = StateEffect.define<{
  pos: number;
  selection?: string;
  selectionRange?: { from: number; to: number };
}>();

/** 隐藏内联 AI 聊天的 Effect */
export const hideInlineAIChat = StateEffect.define<null>();

/** 更新选中文本高亮的 Effect */
export const updateSelectionHighlight = StateEffect.define<{
  from: number;
  to: number;
} | null>();

/** 选中文本高亮装饰器 */
const selectionHighlightMark = Decoration.mark({ class: 'cm-ai-selection-highlight' });

/** 内联 AI 聊天 Widget 类 */
class InlineAIChatWidget extends WidgetType {
  private root: Root | null = null;
  private selection: string;

  constructor(selection: string = '') {
    super();
    this.selection = selection;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'cm-inline-ai-widget';

    // 阻止事件冒泡到编辑器
    wrapper.addEventListener('mousedown', e => e.stopPropagation());
    wrapper.addEventListener('keydown', e => e.stopPropagation());
    wrapper.addEventListener('keyup', e => e.stopPropagation());

    // 使用 React 渲染组件
    this.root = createRoot(wrapper);
    this.root.render(
      React.createElement(InlineAIChatComponent, {
        onClose: () => {
          view.dispatch({
            effects: hideInlineAIChat.of(null),
          });
        },
        onInsert: (text: string) => {
          // 获取当前光标位置
          const { from } = view.state.selection.main;
          view.dispatch({
            changes: { from, insert: text + '\n' },
            effects: hideInlineAIChat.of(null),
          });
          view.focus();
        },
        initialSelection: this.selection,
        view,
      })
    );

    return wrapper;
  }

  destroy(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  eq(other: InlineAIChatWidget): boolean {
    return this.selection === other.selection;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** 内联 AI 聊天 StateField - 包含 widget 和选中文本高亮 */
export const inlineAIChatField = StateField.define<{
  widget: DecorationSet;
  highlight: DecorationSet;
  isOpen: boolean;
}>({
  create() {
    return { widget: Decoration.none, highlight: Decoration.none, isOpen: false };
  },
  update(state, tr) {
    let { widget, highlight, isOpen } = state;
    
    for (const effect of tr.effects) {
      if (effect.is(showInlineAIChat)) {
        const { pos, selection, selectionRange } = effect.value;
        const widgetDeco = Decoration.widget({
          widget: new InlineAIChatWidget(selection || ''),
          block: true,
          side: 1,
        });
        widget = Decoration.set([widgetDeco.range(pos)]);
        
        // 如果有选中范围，添加高亮装饰器
        if (selectionRange && selectionRange.from < selectionRange.to) {
          highlight = Decoration.set([
            selectionHighlightMark.range(selectionRange.from, selectionRange.to),
          ]);
        } else {
          highlight = Decoration.none;
        }
        
        return { widget, highlight, isOpen: true };
      }
      if (effect.is(hideInlineAIChat)) {
        return { widget: Decoration.none, highlight: Decoration.none, isOpen: false };
      }
      if (effect.is(updateSelectionHighlight)) {
        const range = effect.value;
        if (range && range.from < range.to) {
          highlight = Decoration.set([
            selectionHighlightMark.range(range.from, range.to),
          ]);
        } else {
          highlight = Decoration.none;
        }
        return { widget, highlight, isOpen };
      }
    }
    
    // 文档变化时更新装饰器位置
    if (tr.docChanged) {
      widget = widget.map(tr.changes);
      highlight = highlight.map(tr.changes);
    }
    
    // AI 助手打开时，选择变化时更新高亮
    if (isOpen && tr.selection) {
      const { from, to } = tr.state.selection.main;
      if (from < to) {
        highlight = Decoration.set([
          selectionHighlightMark.range(from, to),
        ]);
      } else {
        highlight = Decoration.none;
      }
    }
    
    return { widget, highlight, isOpen };
  },
  provide: f => [
    EditorView.decorations.from(f, state => state.widget),
    EditorView.decorations.from(f, state => state.highlight),
  ],
});

/** 打开内联 AI 聊天的辅助函数 */
export function openInlineAIChat(view: EditorView): void {
  const { from, to } = view.state.selection.main;
  const hasSelection = from !== to;
  const selection = hasSelection ? view.state.sliceDoc(from, to) : '';

  // 在选中文本末尾行或当前行末尾插入 widget
  const line = view.state.doc.lineAt(hasSelection ? to : from);

  view.dispatch({
    effects: showInlineAIChat.of({
      pos: line.to,
      selection,
      selectionRange: hasSelection ? { from, to } : undefined,
    }),
  });
}

/** 关闭内联 AI 聊天的辅助函数 */
export function closeInlineAIChat(view: EditorView): void {
  view.dispatch({
    effects: hideInlineAIChat.of(null),
  });
}

/** 检查内联 AI 聊天是否打开 */
export function isInlineAIChatOpen(view: EditorView): boolean {
  const state = view.state.field(inlineAIChatField, false);
  return state ? state.isOpen : false;
}
