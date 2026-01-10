/**
 * CodeMirror 表格引用 Widget
 * 功能：在 CodeMirror 编辑器中将表单引用渲染为内联表格预览
 * 描述：使用 CodeMirror 的 WidgetType 和 StateField API 实现
 */

import { EditorView, WidgetType, Decoration, DecorationSet } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { InlineTablePreview } from './InlineTablePreview';

/** 表格引用匹配结果 */
interface TableReferenceMatch {
  from: number;
  to: number;
  formId: string;
  formName: string;
  raw: string;
}

/** Widget 状态存储 - 用于在 Widget 重建时保持状态 */
interface WidgetState {
  isExpanded: boolean;
  showAllRows: boolean;
  hiddenColumns: Set<string>;
}

/** 全局状态存储，使用 formId 作为 key */
const widgetStateStore = new Map<string, WidgetState>();

/**
 * 获取 Widget 状态
 */
function getWidgetState(formId: string): WidgetState {
  if (!widgetStateStore.has(formId)) {
    widgetStateStore.set(formId, {
      isExpanded: false,
      showAllRows: false,
      hiddenColumns: new Set(),
    });
  }
  return widgetStateStore.get(formId)!;
}

/**
 * 更新 Widget 状态
 */
function updateWidgetState(formId: string, updates: Partial<WidgetState>): void {
  const current = getWidgetState(formId);
  widgetStateStore.set(formId, { ...current, ...updates });
}

/** 刷新表格引用装饰器的 Effect */
export const refreshTableReferencesEffect = StateEffect.define<null>();

/** 存储 EditorView 引用，用于删除操作 */
let currentView: EditorView | null = null;

/**
 * 表格引用 Widget 类
 */
class TableReferenceWidgetClass extends WidgetType {
  private root: Root | null = null;
  public readonly formId: string;
  private formName: string;
  public from: number;
  public to: number;

  constructor(formId: string, formName: string, from: number, to: number) {
    super();
    this.formId = formId;
    this.formName = formName;
    this.from = from;
    this.to = to;
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-table-reference-widget';

    // 阻止事件冒泡到编辑器，防止光标移动
    wrapper.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    wrapper.addEventListener('click', e => {
      e.stopPropagation();
    });

    // 获取持久化状态
    const state = getWidgetState(this.formId);
    const formId = this.formId;
    const widget = this;

    // 使用 React 渲染组件
    this.root = createRoot(wrapper);
    this.root.render(
      React.createElement(InlineTablePreview, {
        formId: this.formId,
        formName: this.formName,
        initialExpanded: state.isExpanded,
        initialShowAllRows: state.showAllRows,
        initialHiddenColumns: state.hiddenColumns,
        onExpandedChange: (expanded: boolean) => {
          updateWidgetState(formId, { isExpanded: expanded });
        },
        onShowAllRowsChange: (showAll: boolean) => {
          updateWidgetState(formId, { showAllRows: showAll });
        },
        onHiddenColumnsChange: (hidden: Set<string>) => {
          updateWidgetState(formId, { hiddenColumns: hidden });
        },
        onClick: () => {
          console.log('[TableReferenceWidget] 点击表单引用:', formId);
        },
        onDelete: () => {
          // 删除引用文本
          if (currentView) {
            currentView.dispatch({
              changes: { from: widget.from, to: widget.to, insert: '' },
            });
          }
        },
      })
    );

    return wrapper;
  }

  destroy(): void {
    if (this.root) {
      setTimeout(() => {
        this.root?.unmount();
        this.root = null;
      }, 0);
    }
  }

  eq(other: TableReferenceWidgetClass): boolean {
    if (this.formId === other.formId && this.formName === other.formName) {
      this.from = other.from;
      this.to = other.to;
      return true;
    }
    return false;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 查找文档中的所有表格引用
 */
function findTableReferences(doc: string): TableReferenceMatch[] {
  const matches: TableReferenceMatch[] = [];
  const regex = /\[\[form:([^|:\]]+)\|([^\]]+)\]\]/g;
  let match;

  while ((match = regex.exec(doc)) !== null) {
    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      formId: match[1],
      formName: match[2],
      raw: match[0],
    });
  }

  return matches;
}

/**
 * 构建表格引用装饰器
 */
function buildTableReferenceDecorations(doc: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const references = findTableReferences(doc);

  for (const ref of references) {
    const widget = new TableReferenceWidgetClass(ref.formId, ref.formName, ref.from, ref.to);

    // 先添加 widget 装饰器（side: -1 表示在同位置的其他装饰器之前）
    builder.add(
      ref.from,
      ref.from,
      Decoration.widget({
        widget,
        side: -1,
      })
    );

    // 再添加隐藏原始文本的 mark 装饰器
    builder.add(
      ref.from,
      ref.to,
      Decoration.mark({
        class: 'cm-table-reference-hidden',
        attributes: { style: 'display: none !important;' },
      })
    );
  }

  return builder.finish();
}

/**
 * 表格引用 StateField - 使用 StateField 而不是 ViewPlugin
 * StateField 的装饰器不会因为光标位置而被移除
 */
const tableReferenceField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableReferenceDecorations(state.doc.toString());
  },
  update(decorations, tr) {
    // 检查是否有刷新效果
    if (tr.effects.some(e => e.is(refreshTableReferencesEffect))) {
      return buildTableReferenceDecorations(tr.state.doc.toString());
    }
    
    // 文档变化时处理
    if (tr.docChanged) {
      const oldDoc = tr.startState.doc.toString();
      const newDoc = tr.state.doc.toString();
      
      const oldRefs = findTableReferences(oldDoc);
      const newRefs = findTableReferences(newDoc);
      
      // 检查引用是否变化
      const refsChanged = oldRefs.length !== newRefs.length ||
        oldRefs.some((oldRef, i) => {
          const newRef = newRefs[i];
          return !newRef || oldRef.formId !== newRef.formId || oldRef.formName !== newRef.formName;
        });
      
      if (refsChanged) {
        return buildTableReferenceDecorations(newDoc);
      } else {
        // 只映射位置
        return decorations.map(tr.changes);
      }
    }
    
    return decorations;
  },
  provide: f => EditorView.decorations.from(f),
});

/**
 * 更新 EditorView 引用的扩展
 */
const viewRefPlugin = EditorView.updateListener.of(update => {
  currentView = update.view;
});

/**
 * 创建表格引用扩展
 * @returns CodeMirror Extension
 */
export function createTableReferenceExtension() {
  return [tableReferenceField, viewRefPlugin];
}

export default {
  createTableReferenceExtension,
  refreshTableReferencesEffect,
};
