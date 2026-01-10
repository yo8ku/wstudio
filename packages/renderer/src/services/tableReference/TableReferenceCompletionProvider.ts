/**
 * 表格引用自动补全提供器
 * 功能：为 Monaco 和 CodeMirror 编辑器提供表格/表单引用的自动补全功能
 * 描述：当用户输入 @ 时，显示表单列表；选择表单后输入 / 显示列列表
 */

import * as monaco from 'monaco-editor';
import {
  autocompletion,
  startCompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
  type Completion,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, type ViewUpdate, tooltips } from '@codemirror/view';
import { tableReferenceService, type ReferenceItem } from './TableReferenceService';

/** 补全状态 */
interface CompletionState {
  /** 是否正在选择表单 */
  isSelectingForm: boolean;
  /** 当前选中的表单ID */
  selectedFormId: string | null;
  /** 当前选中的表单名称 */
  selectedFormName: string | null;
  /** 触发位置 */
  triggerPosition: monaco.Position | null;
}

/** 全局补全状态 */
let completionState: CompletionState = {
  isSelectingForm: false,
  selectedFormId: null,
  selectedFormName: null,
  triggerPosition: null,
};

/**
 * 重置补全状态
 */
export function resetCompletionState(): void {
  completionState = {
    isSelectingForm: false,
    selectedFormId: null,
    selectedFormName: null,
    triggerPosition: null,
  };
}

/**
 * 设置选中的表单（用于二级补全）
 */
export function setSelectedForm(formId: string, formName: string): void {
  completionState.selectedFormId = formId;
  completionState.selectedFormName = formName;
}

/**
 * 获取列类型图标对应的 Monaco CompletionItemKind
 */
function getCompletionItemKind(icon: string): monaco.languages.CompletionItemKind {
  const iconKindMap: Record<string, monaco.languages.CompletionItemKind> = {
    'table-properties': monaco.languages.CompletionItemKind.Module,
    'type-icon': monaco.languages.CompletionItemKind.Text,
    'number-hash': monaco.languages.CompletionItemKind.Value,
    'calendar-date': monaco.languages.CompletionItemKind.Event,
    'clock': monaco.languages.CompletionItemKind.Event,
    'checkbox-select': monaco.languages.CompletionItemKind.Constant,
    'radio-select': monaco.languages.CompletionItemKind.Enum,
    'list-checks': monaco.languages.CompletionItemKind.Enum,
    'tag': monaco.languages.CompletionItemKind.Keyword,
    'link-2': monaco.languages.CompletionItemKind.Reference,
    'at-sign': monaco.languages.CompletionItemKind.Reference,
    'eye-off': monaco.languages.CompletionItemKind.Property,
  };
  return iconKindMap[icon] || monaco.languages.CompletionItemKind.Field;
}

/**
 * 将 ReferenceItem 转换为 Monaco CompletionItem
 */
function toMonacoCompletionItem(
  item: ReferenceItem,
  range: monaco.IRange,
  formName?: string
): monaco.languages.CompletionItem {
  const isColumn = item.type === 'column';
  
  // 生成插入文本
  let insertText: string;
  if (isColumn && item.formId && formName) {
    // 列引用格式
    insertText = tableReferenceService.formatReference(
      'column',
      item.formId,
      formName,
      item.id,
      item.label
    );
  } else {
    // 表单引用格式
    insertText = tableReferenceService.formatReference('form', item.id, item.label);
  }

  return {
    label: {
      label: item.label,
      description: item.description,
    },
    kind: getCompletionItemKind(item.icon || 'table-properties'),
    documentation: isColumn
      ? `引用表单 "${formName}" 的 "${item.label}" 列`
      : `引用表单 "${item.label}"`,
    insertText,
    detail: item.description,
    sortText: `0_${item.label}`,
    filterText: item.label,
    range,
  };
}

/**
 * 创建 Monaco 表格引用补全提供器
 */
export function createMonacoTableReferenceProvider(): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['@', '/'],
    
    provideCompletionItems: async (
      model: monaco.editor.ITextModel,
      position: monaco.Position,
      _context: monaco.languages.CompletionContext,
      _token: monaco.CancellationToken
    ): Promise<monaco.languages.CompletionList> => {
      try {
        const lineContent = model.getLineContent(position.lineNumber);
        const textUntilPosition = lineContent.substring(0, position.column - 1);
        
        // 检查是否是 @ 触发
        const atMatch = textUntilPosition.match(/@([^\s@/]*)$/);
        
        // 检查是否是 / 触发（在表单引用后）
        const slashMatch = textUntilPosition.match(/\[\[form:([^|]+)\|([^\]]+)\]\]\/([^\s]*)$/);
        
        if (slashMatch) {
          // 二级补全：显示列列表
          const formId = slashMatch[1];
          const formName = slashMatch[2];
          const query = slashMatch[3] || '';
          
          const suggestions = await tableReferenceService.getSuggestions(query, formId);
          
          const range: monaco.IRange = {
            startLineNumber: position.lineNumber,
            startColumn: position.column - query.length,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          
          const completionItems = suggestions.map(item =>
            toMonacoCompletionItem(item, range, formName)
          );
          
          return {
            suggestions: completionItems,
            incomplete: false,
          };
        }
        
        if (atMatch) {
          // 一级补全：显示表单列表
          const query = atMatch[1] || '';
          
          const suggestions = await tableReferenceService.getSuggestions(query);
          
          const range: monaco.IRange = {
            startLineNumber: position.lineNumber,
            startColumn: position.column - query.length - 1, // 包含 @
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };
          
          const completionItems = suggestions.map(item =>
            toMonacoCompletionItem(item, range)
          );
          
          return {
            suggestions: completionItems,
            incomplete: false,
          };
        }
        
        return { suggestions: [] };
      } catch (error) {
        console.error('[TableReferenceCompletionProvider] 补全失败:', error);
        return { suggestions: [] };
      }
    },
  };
}

/**
 * 注册 Monaco 表格引用补全提供器
 * @param monacoInstance Monaco 实例
 * @param languages 要注册的语言列表，默认为 ['markdown', 'plaintext']
 * @returns 返回 disposable 用于清理
 */
export function registerMonacoTableReferenceProvider(
  monacoInstance: typeof monaco,
  languages: string[] = ['markdown', 'plaintext']
): monaco.IDisposable[] {
  const disposables: monaco.IDisposable[] = [];
  const provider = createMonacoTableReferenceProvider();
  
  for (const lang of languages) {
    const disposable = monacoInstance.languages.registerCompletionItemProvider(lang, provider);
    disposables.push(disposable);
  }
  
  console.log('[TableReferenceCompletionProvider] 已注册表格引用补全提供器，语言:', languages);
  
  return disposables;
}

export default {
  createMonacoTableReferenceProvider,
  registerMonacoTableReferenceProvider,
  resetCompletionState,
  setSelectedForm,
};

// ==================== CodeMirror 支持 ====================

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
