/**
 * Demo plugin entry used to verify runtime-only editor suggest and runtime
 * popover flows.
 */

import {
  EditorSuggest,
  Notice,
  Plugin,
  PopoverSuggest,
  type App,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '输入建议演示';
const EDITOR_SUGGEST_TRIGGER_PREFIX = ';';
const EDITOR_SUGGEST_TRIGGER_PREFIX_FULLWIDTH = '；';
const EDITOR_SUGGEST_TRIGGER_EXAMPLE = ';a';
const EDITOR_SUGGEST_TRIGGER_EXAMPLE_FULLWIDTH = '；a';
const EDITOR_SUGGEST_VALUES = ['apple', 'apricot', 'atlas', 'azure'];
const RUNTIME_POPOVER_QUERY = 'a';
const RUNTIME_POPOVER_VALUES = ['autumn-board', 'azure-note', 'amber-task', 'atlas-sheet'];

function filterValues(values: readonly string[], query: string): readonly string[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return values;
  }

  return values.filter((value) => value.toLowerCase().includes(normalizedQuery));
}

function getLinePrefix(editor: Editor, cursor: EditorPosition): string {
  const lineText = editor.getLine(cursor.line);
  return lineText.slice(0, cursor.ch);
}

function getSuggestReplacementPrefix(context: EditorSuggestContext): string {
  const lineText = context.editor.getLine(context.start.line);
  const typedPrefix = lineText.slice(context.start.ch, context.start.ch + 1);

  if (typedPrefix === EDITOR_SUGGEST_TRIGGER_PREFIX_FULLWIDTH) {
    return EDITOR_SUGGEST_TRIGGER_PREFIX_FULLWIDTH;
  }

  return EDITOR_SUGGEST_TRIGGER_PREFIX;
}

function resolveEditorTrigger(editor: Editor, cursor: EditorPosition): EditorSuggestTriggerInfo | null {
  const prefix = getLinePrefix(editor, cursor);
  const match = /[;；]([a-z-]*)$/i.exec(prefix);

  if (match === null) {
    return null;
  }

  return {
    start: {
      line: cursor.line,
      ch: cursor.ch - match[0].length,
    },
    end: {
      line: cursor.line,
      ch: cursor.ch,
    },
    query: match[1],
  };
}

class DemoEditorSuggest extends EditorSuggest<string> {
  private static runtimeMode: 'runtime' | 'fallback' = 'runtime';
  private static readonly runtimeSurfaceIds = {
    runtime: 'editor-suggest-runtime-popover',
    fallback: 'editor-suggest-runtime-popover-failure',
  } as const;

  public static get runtimeSurfaceId(): string {
    return DemoEditorSuggest.runtimeSurfaceIds[DemoEditorSuggest.runtimeMode];
  }

  public static setRuntimeMode(mode: 'runtime' | 'fallback'): void {
    DemoEditorSuggest.runtimeMode = mode;
  }

  public static getRuntimeMode(): 'runtime' | 'fallback' {
    return DemoEditorSuggest.runtimeMode;
  }

  public constructor(
    app: App,
    private readonly owner: EditorSuggestDemoPlugin,
  ) {
    super(app);
    this.setInstructions([
      { command: '↑/↓', purpose: '在编辑器中切换当前建议' },
      { command: 'Enter', purpose: '在编辑器中选择当前建议' },
      { command: 'Esc', purpose: '在编辑器中关闭建议弹层' },
    ]);
  }

  public onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    if (file === null) {
      return null;
    }

    return resolveEditorTrigger(editor, cursor);
  }

  public getSuggestions(context: EditorSuggestContext): readonly string[] {
    return filterValues(EDITOR_SUGGEST_VALUES, context.query);
  }

  public renderSuggestion(value: string, el: HTMLElement): void {
    el.textContent = `${EDITOR_SUGGEST_TRIGGER_PREFIX}${value}`;
  }

  public selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();

    if (this.context === null) {
      this.owner.showNotice('当前没有可用的编辑器建议上下文。', 2600);
      return;
    }

    const replacementPrefix = getSuggestReplacementPrefix(this.context);
    this.context.editor.replaceRange(`${replacementPrefix}${value}`, this.context.start, this.context.end);
    this.context.editor.focus();
    this.owner.onEditorApplied(value);
    this.close();
  }
}

class DemoRuntimePopover extends PopoverSuggest<string> {
  public static readonly runtimeSurfaceId: string = 'editor-suggest-runtime-popover';

  public constructor(
    app: App,
    private readonly owner: EditorSuggestDemoPlugin,
  ) {
    super(app);
    this.setInstructions([
      { command: 'Click', purpose: '选择一条 runtime 建议' },
      { command: 'Esc', purpose: '关闭弹层' },
    ]);
  }

  public renderSuggestion(value: string, el: HTMLElement): void {
    el.textContent = value;
  }

  public selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();
    this.owner.onRuntimePopoverSelected(value);
    this.owner.showNotice(`Runtime popover 已选择：${value}`, 2800);
    this.close();
  }

  public openWithQuery(query: string): readonly string[] {
    this.close();
    const suggestions = filterValues(RUNTIME_POPOVER_VALUES, query);
    this.setSuggestions(suggestions);
    this.open();
    return suggestions;
  }
}

class DemoRuntimePopoverFailure extends DemoRuntimePopover {
  public static readonly runtimeSurfaceId: string = 'editor-suggest-runtime-popover-failure';
}

export default class EditorSuggestDemoPlugin extends Plugin {
  private editorSuggestDemo: DemoEditorSuggest | null = null;
  private runtimePopover: DemoRuntimePopover | null = null;
  private runtimePopoverFailure: DemoRuntimePopoverFailure | null = null;

  public onload(): void {
    DemoEditorSuggest.setRuntimeMode('runtime');
    this.editorSuggestDemo = new DemoEditorSuggest(this.app, this);
    this.runtimePopover = new DemoRuntimePopover(this.app, this);
    this.runtimePopoverFailure = new DemoRuntimePopoverFailure(this.app, this);

    this.registerEditorSuggest(this.editorSuggestDemo);

    this.addRibbonIcon('list-filter', DEMO_TITLE, () => {
      this.showNotice(
        `请在 Markdown 编辑器输入 ${EDITOR_SUGGEST_TRIGGER_EXAMPLE}。中文全角标点也支持 ${EDITOR_SUGGEST_TRIGGER_EXAMPLE_FULLWIDTH}。`,
        4200,
      );
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'enable-runtime-editor-suggest',
      name: 'EditorSuggest Runtime Demo：启用成功态',
      callback: () => {
        this.setEditorSuggestRuntimeMode('runtime');
      },
    });

    this.addCommand({
      id: 'enable-runtime-editor-suggest-fallback',
      name: 'EditorSuggest Runtime Demo：启用失败回退态',
      callback: () => {
        this.setEditorSuggestRuntimeMode('fallback');
      },
    });

    this.addCommand({
      id: 'open-runtime-popover-demo',
      name: 'Runtime Popover Demo：打开运行时弹层演示',
      callback: () => {
        this.openRuntimePopoverDemo();
      },
    });

    this.addCommand({
      id: 'open-runtime-popover-fallback-demo',
      name: 'Runtime Popover Fallback Demo：打开回退演示',
      callback: () => {
        this.openRuntimePopoverFallbackDemo();
      },
    });
  }

  public onEnable(): void {
    return undefined;
  }

  public onDisable(): void {
    return undefined;
  }

  public onunload(): void {
    return undefined;
  }

  public onFailed(failure: PluginFailureContext): void {
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  public onEditorApplied(value: string): void {
    this.showNotice(`EditorSuggest 已写回：${value}`, 2600);
  }

  public onRuntimePopoverSelected(value: string): void {
    this.showNotice(`Runtime popover 已写回：${value}`, 2600);
  }

  public showNotice(message: string, timeout = 2400): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  private setEditorSuggestRuntimeMode(mode: 'runtime' | 'fallback'): void {
    DemoEditorSuggest.setRuntimeMode(mode);
    this.showNotice(
      mode === 'runtime'
        ? `已切换到 EditorSuggest runtime 成功态。请在 Markdown 编辑器输入 ${EDITOR_SUGGEST_TRIGGER_EXAMPLE} 验证。`
        : `已切换到 EditorSuggest runtime 失败回退态。请在 Markdown 编辑器输入 ${EDITOR_SUGGEST_TRIGGER_EXAMPLE} 或 ${EDITOR_SUGGEST_TRIGGER_EXAMPLE_FULLWIDTH} 验证失败回退。`,
      4200,
    );
  }

  private openRuntimePopoverDemo(): void {
    const runtimePopover = this.requireRuntimePopover();
    const suggestions = runtimePopover.openWithQuery(RUNTIME_POPOVER_QUERY);
    this.showNotice(`Runtime popover 已打开：${suggestions.join(' | ')}`, 3600);
  }

  private openRuntimePopoverFallbackDemo(): void {
    const runtimePopoverFailure = this.requireRuntimePopoverFailure();
    const suggestions = runtimePopoverFailure.openWithQuery(RUNTIME_POPOVER_QUERY);
    this.showNotice(`Runtime popover 回退演示已打开：${suggestions.join(' | ')}`, 3600);
  }

  private requireRuntimePopover(): DemoRuntimePopover {
    if (this.runtimePopover === null) {
      throw new Error('Runtime popover demo is not initialized.');
    }

    return this.runtimePopover;
  }

  private requireRuntimePopoverFailure(): DemoRuntimePopoverFailure {
    if (this.runtimePopoverFailure === null) {
      throw new Error('Runtime popover fallback demo is not initialized.');
    }

    return this.runtimePopoverFailure;
  }
}
