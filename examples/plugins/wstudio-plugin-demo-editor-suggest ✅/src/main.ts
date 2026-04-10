/**
 * Demo plugin entry used to verify editor suggest, regular suggest modal, and fuzzy suggest modal behavior.
 */

import {
  EditorSuggest,
  FuzzySuggestModal,
  Notice,
  Plugin,
  SuggestModal,
  type App,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type FuzzyMatch,
  type MarkdownFileInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '输入建议演示';
const REGULAR_MODAL_QUERY = 'a';
const FUZZY_MODAL_QUERY = 'ap';

const EDITOR_SUGGEST_VALUES = ['apple', 'apricot', 'atlas', 'azure'];
const REGULAR_MODAL_VALUES = ['alpha-note', 'atlas-doc', 'amber-card', 'beta-sheet'];
const FUZZY_MODAL_VALUES = ['apple', 'apricot', 'grape', 'paper'];

function createSyntheticKeyboardEvent(): KeyboardEvent {
  return {
    key: 'Enter',
    preventDefault(): void {
      return undefined;
    },
    stopPropagation(): void {
      return undefined;
    },
  } as KeyboardEvent;
}

function formatPosition(position: EditorPosition): string {
  return `${position.line}:${position.ch}`;
}

function summarizeValues(values: readonly string[]): string {
  return values.length === 0 ? '无' : values.join(' | ');
}

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
  const triggerText = context.editor.getRange(context.start, context.end);
  return triggerText.startsWith('::') ? '::' : '@';
}

function resolveEditorTrigger(editor: Editor, cursor: EditorPosition): EditorSuggestTriggerInfo | null {
  const prefix = getLinePrefix(editor, cursor);
  const match = /(?:@|::)([a-z-]*)$/i.exec(prefix);

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

interface EditorSuggestSnapshot {
  readonly trigger: EditorSuggestTriggerInfo;
  readonly suggestions: readonly string[];
}

class DemoEditorSuggest extends EditorSuggest<string> {
  public constructor(
    app: App,
    private readonly owner: EditorSuggestDemoPlugin,
  ) {
    super(app);
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
    el.textContent = `@${value}`;
  }

  public selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();

    if (this.context === null) {
      this.owner.showNotice('当前没有可应用的编辑器建议。', 2600);
      return;
    }

    const replacementPrefix = getSuggestReplacementPrefix(this.context);
    this.context.editor.replaceRange(`${replacementPrefix}${value}`, this.context.start, this.context.end);
    this.context.editor.focus();
    this.owner.setEditorAppliedValue(value);
    this.owner.recordTrace(`editorSuggest.select value=${value}`);
    this.close();
  }

  public inspect(editor: Editor, file: TFile | null): EditorSuggestSnapshot | null {
    const cursor = editor.getCursor();
    const trigger = this.onTrigger(cursor, editor, file);

    if (trigger === null || file === null) {
      return null;
    }

    const context: EditorSuggestContext = {
      ...trigger,
      editor,
      file,
    };

    this.context = context;

    return {
      trigger,
      suggestions: this.getSuggestions(context).slice(0, this.limit),
    };
  }

  public applyFirst(editor: Editor, file: TFile | null): string | null {
    const snapshot = this.inspect(editor, file);

    if (snapshot === null) {
      return null;
    }

    const firstSuggestion = snapshot.suggestions[0];

    if (firstSuggestion === undefined) {
      return null;
    }

    this.selectSuggestion(firstSuggestion, createSyntheticKeyboardEvent());
    return firstSuggestion;
  }
}

class DemoSuggestModal extends SuggestModal<string> {
  public constructor(
    app: App,
    private readonly owner: EditorSuggestDemoPlugin,
  ) {
    super(app);
    this.setTitle('普通建议模态框');
    this.setPlaceholder('输入字母以过滤建议');
    this.setInstructions([
      { command: 'Enter', purpose: '选择当前建议' },
      { command: 'Esc', purpose: '关闭模态框' },
    ]);
  }

  public getSuggestions(query: string): readonly string[] {
    return filterValues(REGULAR_MODAL_VALUES, query);
  }

  public renderSuggestion(value: string, el: HTMLElement): void {
    el.textContent = value;
  }

  public onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();
    this.owner.setRegularModalValue(item);
    this.owner.recordTrace(`suggestModal.choose value=${item}`);
    this.owner.showNotice(`普通建议第一项已选择：${item}`, 2800);
  }

  public openWithQuery(query: string): readonly string[] {
    this.close();
    this.inputEl.value = query;
    return this.renderPreviewAndOpen(query);
  }

  public chooseFirst(query: string): string | null {
    const suggestions = this.renderPreview(query);
    const firstSuggestion = suggestions[0];

    if (firstSuggestion === undefined) {
      return null;
    }

    this.selectSuggestion(firstSuggestion, createSyntheticKeyboardEvent());
    return firstSuggestion;
  }

  private renderPreviewAndOpen(query: string): readonly string[] {
    const suggestions = this.renderPreview(query);
    this.open();
    return suggestions;
  }

  private renderPreview(query: string): readonly string[] {
    const suggestions = this.getSuggestions(query).slice(0, this.limit);
    this.resultContainerEl.replaceChildren();

    if (suggestions.length === 0) {
      this.onNoSuggestion();
      return suggestions;
    }

    for (const suggestion of suggestions) {
      const itemEl = document.createElement('div');
      this.renderSuggestion(suggestion, itemEl);
      this.resultContainerEl.append(itemEl);
    }

    return suggestions;
  }
}

class DemoFuzzySuggestModal extends FuzzySuggestModal<string> {
  public constructor(
    app: App,
    private readonly owner: EditorSuggestDemoPlugin,
  ) {
    super(app);
    this.setTitle('模糊建议模态框');
    this.setPlaceholder('输入字母以模糊匹配');
    this.setInstructions([
      { command: 'Enter', purpose: '选择当前模糊建议' },
      { command: 'Esc', purpose: '关闭模态框' },
    ]);
  }

  public getItems(): readonly string[] {
    return FUZZY_MODAL_VALUES;
  }

  public getItemText(item: string): string {
    return item;
  }

  public onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
    evt.preventDefault();
    this.owner.setFuzzyModalValue(item);
    this.owner.recordTrace(`fuzzySuggestModal.choose value=${item}`);
    this.owner.showNotice(`模糊建议第一项已选择：${item}`, 2800);
  }

  public openWithQuery(query: string): readonly FuzzyMatch<string>[] {
    this.close();
    this.inputEl.value = query;
    return this.renderPreviewAndOpen(query);
  }

  public chooseFirst(query: string): string | null {
    const suggestions = this.renderPreview(query);
    const firstSuggestion = suggestions[0];

    if (firstSuggestion === undefined) {
      return null;
    }

    this.selectSuggestion(firstSuggestion, createSyntheticKeyboardEvent());
    return firstSuggestion.item;
  }

  private renderPreviewAndOpen(query: string): readonly FuzzyMatch<string>[] {
    const suggestions = this.renderPreview(query);
    this.open();
    return suggestions;
  }

  private renderPreview(query: string): readonly FuzzyMatch<string>[] {
    const suggestions = this.getSuggestions(query).slice(0, this.limit);
    this.resultContainerEl.replaceChildren();

    if (suggestions.length === 0) {
      this.onNoSuggestion();
      return suggestions;
    }

    for (const suggestion of suggestions) {
      const itemEl = document.createElement('div');
      this.renderSuggestion(suggestion, itemEl);
      this.resultContainerEl.append(itemEl);
    }

    return suggestions;
  }
}

export default class EditorSuggestDemoPlugin extends Plugin {
  private editorSuggestDemo: DemoEditorSuggest | null = null;
  private regularSuggestModal: DemoSuggestModal | null = null;
  private fuzzySuggestModal: DemoFuzzySuggestModal | null = null;
  private lastEditorQuery = '无';
  private lastEditorSuggestions = '无';
  private lastEditorAppliedValue = '无';
  private lastRegularModalValue = '无';
  private lastFuzzyModalValue = '无';

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.editorSuggestDemo = new DemoEditorSuggest(this.app, this);
    this.regularSuggestModal = new DemoSuggestModal(this.app, this);
    this.fuzzySuggestModal = new DemoFuzzySuggestModal(this.app, this);

    this.registerEditorSuggest(this.editorSuggestDemo);

    this.addRibbonIcon('list-filter', DEMO_TITLE, () => {
      this.showNotice('请在编辑器里输入 @a，然后执行输入建议演示相关命令。', 3200);
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'show-editor-suggest-snapshot',
      name: '输入建议演示：显示编辑器建议快照',
      editorCallback: (editor, context) => {
        this.showEditorSuggestSnapshot(editor, context);
      },
    });

    this.addCommand({
      id: 'apply-first-editor-suggest',
      name: '输入建议演示：应用第一个编辑器建议',
      editorCallback: (editor, context) => {
        this.applyFirstEditorSuggest(editor, context);
      },
    });

    this.addCommand({
      id: 'open-regular-suggest-modal',
      name: '输入建议演示：打开普通建议模态框',
      callback: () => {
        this.openRegularSuggestModal();
      },
    });

    this.addCommand({
      id: 'choose-first-regular-suggest',
      name: '输入建议演示：选择普通建议第一项',
      callback: () => {
        this.chooseFirstRegularSuggest();
      },
    });

    this.addCommand({
      id: 'open-fuzzy-suggest-modal',
      name: '输入建议演示：打开模糊建议模态框',
      callback: () => {
        this.openFuzzySuggestModal();
      },
    });

    this.addCommand({
      id: 'choose-first-fuzzy-suggest',
      name: '输入建议演示：选择模糊建议第一项',
      callback: () => {
        this.chooseFirstFuzzySuggest();
      },
    });

    this.addCommand({
      id: 'show-editor-suggest-demo-snapshot',
      name: '输入建议演示：显示快照',
      callback: () => {
        this.showSnapshot();
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public onunload(): void {
    this.recordTrace('plugin.onunload');
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  public setEditorAppliedValue(value: string): void {
    this.lastEditorAppliedValue = value;
  }

  public setRegularModalValue(value: string): void {
    this.lastRegularModalValue = value;
  }

  public setFuzzyModalValue(value: string): void {
    this.lastFuzzyModalValue = value;
  }

  public showNotice(message: string, timeout = 2400): void {
    new Notice(`${DEMO_TITLE}：${message}`, timeout);
  }

  public recordTrace(message: string): void {
    console.log(`[demo-editor-suggest] ${message}`);
  }

  private showEditorSuggestSnapshot(editor: Editor, context: MarkdownFileInfo): void {
    const editorSuggestDemo = this.requireEditorSuggest();
    const snapshot = editorSuggestDemo.inspect(editor, context.file ?? null);

    if (snapshot === null) {
      this.recordTrace('editorSuggest.snapshot missed');
      this.showNotice('当前光标前没有可触发的编辑器建议，请先输入 ::a。', 2800);
      return;
    }

    this.lastEditorQuery = snapshot.trigger.query || '空查询';
    this.lastEditorSuggestions = summarizeValues(snapshot.suggestions);

    const summary = [
      `file=${context.file?.path ?? '无文件'}`,
      `query=${snapshot.trigger.query || '空查询'}`,
      `start=${formatPosition(snapshot.trigger.start)}`,
      `end=${formatPosition(snapshot.trigger.end)}`,
      `suggestions=${this.lastEditorSuggestions}`,
    ].join(', ');

    this.recordTrace(`editorSuggest.snapshot ${summary}`);
    this.showNotice(summary, 4200);
  }

  private applyFirstEditorSuggest(editor: Editor, context: MarkdownFileInfo): void {
    const editorSuggestDemo = this.requireEditorSuggest();
    const appliedValue = editorSuggestDemo.applyFirst(editor, context.file ?? null);

    if (appliedValue === null) {
      this.recordTrace('editorSuggest.apply skipped');
      this.showNotice('当前没有可应用的编辑器建议，请先输入 ::a。', 2800);
      return;
    }

    this.recordTrace(`editorSuggest.apply value=${appliedValue}`);
    this.showNotice(`已应用第一个编辑器建议：@${appliedValue}`, 3200);
  }

  private openRegularSuggestModal(): void {
    const regularSuggestModal = this.requireRegularSuggestModal();
    const suggestions = regularSuggestModal.openWithQuery(REGULAR_MODAL_QUERY);
    const summary = `query=${REGULAR_MODAL_QUERY}, suggestions=${summarizeValues(suggestions)}`;

    this.recordTrace(`suggestModal.open ${summary}`);
    this.showNotice(`普通建议模态框已打开，${summary}`, 3600);
  }

  private chooseFirstRegularSuggest(): void {
    const regularSuggestModal = this.requireRegularSuggestModal();
    const chosenValue = regularSuggestModal.chooseFirst(REGULAR_MODAL_QUERY);

    if (chosenValue === null) {
      this.recordTrace('suggestModal.choose skipped');
      this.showNotice('普通建议列表为空。', 2600);
      return;
    }

    this.recordTrace(`suggestModal.choose first=${chosenValue}`);
  }

  private openFuzzySuggestModal(): void {
    const fuzzySuggestModal = this.requireFuzzySuggestModal();
    const suggestions = fuzzySuggestModal.openWithQuery(FUZZY_MODAL_QUERY);
    const summary = `query=${FUZZY_MODAL_QUERY}, suggestions=${summarizeValues(suggestions.map((item) => item.item))}`;

    this.recordTrace(`fuzzySuggestModal.open ${summary}`);
    this.showNotice(`模糊建议模态框已打开，${summary}`, 3600);
  }

  private chooseFirstFuzzySuggest(): void {
    const fuzzySuggestModal = this.requireFuzzySuggestModal();
    const chosenValue = fuzzySuggestModal.chooseFirst(FUZZY_MODAL_QUERY);

    if (chosenValue === null) {
      this.recordTrace('fuzzySuggestModal.choose skipped');
      this.showNotice('模糊建议列表为空。', 2600);
      return;
    }

    this.recordTrace(`fuzzySuggestModal.choose first=${chosenValue}`);
  }

  private showSnapshot(): void {
    const summary = [
      `editorQuery=${this.lastEditorQuery}`,
      `editorSuggestions=${this.lastEditorSuggestions}`,
      `editorApplied=${this.lastEditorAppliedValue}`,
      `regularModal=${this.lastRegularModalValue}`,
      `fuzzyModal=${this.lastFuzzyModalValue}`,
    ].join(', ');

    this.recordTrace(`snapshot ${summary}`);
    this.showNotice(summary, 4200);
  }

  private requireEditorSuggest(): DemoEditorSuggest {
    if (this.editorSuggestDemo === null) {
      throw new Error('Editor suggest demo is not initialized.');
    }

    return this.editorSuggestDemo;
  }

  private requireRegularSuggestModal(): DemoSuggestModal {
    if (this.regularSuggestModal === null) {
      throw new Error('Regular suggest modal is not initialized.');
    }

    return this.regularSuggestModal;
  }

  private requireFuzzySuggestModal(): DemoFuzzySuggestModal {
    if (this.fuzzySuggestModal === null) {
      throw new Error('Fuzzy suggest modal is not initialized.');
    }

    return this.fuzzySuggestModal;
  }
}
