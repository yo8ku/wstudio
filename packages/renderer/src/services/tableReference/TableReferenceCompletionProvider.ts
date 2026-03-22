/**
 * 表格引用自动补全提供器
 * 功能：为 CodeMirror 编辑器提供表单和列引用自动补全能力
 */

import {
  autocompletion,
  startCompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { ViewPlugin, keymap, type ViewUpdate, tooltips } from '@codemirror/view';
import { tableReferenceService, type ReferenceItem } from './TableReferenceService';
/**
 * 将 ReferenceItem 转换为 CodeMirror Completion
 */
function toCodeMirrorCompletion(
  item: ReferenceItem,
  formName?: string
): Completion {
  const isColumn = item.type === 'column';

  // 生成插入文本
  let insertText: string;
  if (isColumn && item.formId && formName) {
    insertText = tableReferenceService.formatReference(
      'column',
      item.formId,
      formName,
      item.id,
      item.label
    );
  } else {
    insertText = tableReferenceService.formatReference('form', item.id, item.label);
  }

  return {
    label: item.label,
    detail: item.description,
    info: isColumn
      ? `引用表单 "${formName}" 的 "${item.label}" 列`
      : `引用表单 "${item.label}"`,
    apply: insertText,
    type: isColumn ? 'property' : 'class',
  };
}

/**
 * CodeMirror 表格引用补全函数
 */
async function tableReferenceCompletions(
  context: CompletionContext
): Promise<CompletionResult | null> {
  // 获取光标前的文本
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.slice(0, context.pos - line.from);

  // 检查是否是 / 触发（在表单引用后）
  const slashMatch = textBefore.match(/\[\[form:([^|]+)\|([^\]]+)\]\]\/([^\s]*)$/);

  if (slashMatch) {
    // 二级补全：显示列列表
    const formId = slashMatch[1];
    const formName = slashMatch[2];
    const query = slashMatch[3] || '';

    const suggestions = await tableReferenceService.getSuggestions(query, formId);

    if (suggestions.length === 0) {
      return null;
    }

    const from = context.pos - query.length;
    const options = suggestions.map(item =>
      toCodeMirrorCompletion(item, formName)
    );

    return {
      from,
      options,
      validFor: /^[^\s/]*$/,
    };
  }

  // 检查是否是 @ 触发（显式触发或输入 @ 后触发）
  const atMatch = textBefore.match(/@([^\s@/]*)$/);

  if (atMatch) {
    // 一级补全：显示表单列表
    const query = atMatch[1] || '';

    console.log('[TableReferenceCompletions] @ 触发，查询:', query);

    const suggestions = await tableReferenceService.getSuggestions(query);

    console.log('[TableReferenceCompletions] 获取到建议:', suggestions.length);

    if (suggestions.length === 0) {
      return null;
    }

    // 从 @ 符号开始替换
    const from = context.pos - query.length - 1;
    const options = suggestions.map(item => toCodeMirrorCompletion(item));

    console.log('[TableReferenceCompletions] 返回补全结果, from:', from, 'options:', options);

    return {
      from,
      options,
    };
  }

  return null;
}

/**
 * 创建 CodeMirror 表格引用自动补全扩展
 * 注意：使用 override 会替换默认补全源，只保留表格引用补全
 * @returns CodeMirror Extension
 */
export function createCodeMirrorTableReferenceExtension(): Extension {
  // 监听输入事件，在输入 @ 或 / 时触发补全
  const triggerPlugin = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        // 检查是否有文档变化
        if (!update.docChanged) return;

        // 获取变化的内容
        update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
          const insertedText = inserted.toString();
          // 如果插入的是 @ 或 /，触发补全
          if (insertedText === '@' || insertedText === '/') {
            // 延迟触发，确保文档已更新
            setTimeout(() => {
              console.log('[TableReferenceExtension] 触发补全');
              startCompletion(update.view);
            }, 10);
          }
        });
      }
    }
  );

  return [
    // tooltips 扩展，确保 tooltip 能正确显示
    tooltips({
      parent: document.body,
    }),
    autocompletion({
      override: [tableReferenceCompletions],
      activateOnTyping: false,
      maxRenderedOptions: 50,
      closeOnBlur: true,
      defaultKeymap: true,
    }),
    keymap.of(completionKeymap),
    triggerPlugin,
  ];
}
