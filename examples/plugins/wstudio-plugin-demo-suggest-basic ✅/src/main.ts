import {
  FuzzySuggestModal,
  Notice,
  Plugin,
  SuggestModal,
  type Editor,
  type MarkdownFileInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '模板插入器演示';

interface ActiveEditorContext extends MarkdownFileInfo {
  readonly editor: Editor;
}

interface WorkspaceWithActiveEditorRefresh {
  refreshActiveEditorState?(): Promise<MarkdownFileInfo | null>;
}

interface TemplateSnippet {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly body: (context: TemplateRenderContext) => string;
}

interface TemplateRenderContext {
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly fileName: string;
}

class CommonTemplateSuggestModal extends SuggestModal<TemplateSnippet> {
  public constructor(
    app: Plugin['app'],
    private readonly snippets: readonly TemplateSnippet[],
    private readonly chooseTemplate: (snippet: TemplateSnippet) => void,
  ) {
    super(app);
    this.limit = 6;
    this.emptyStateText = '没有匹配的常用模板。';
    this.setTitle('常用模板选择器');
    this.setPlaceholder('输入模板名称，例如：会议、复盘、代码');
    this.setInstructions([
      { command: 'Enter', purpose: '插入当前高亮模板' },
      { command: 'Click', purpose: '直接插入所选模板' },
    ]);
  }

  public override getSuggestions(query: string): readonly TemplateSnippet[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return this.snippets;
    }

    return this.snippets.filter((snippet) => {
      const searchText = [
        snippet.title,
        snippet.description,
        ...snippet.aliases,
      ].join(' ').toLowerCase();

      return searchText.includes(normalizedQuery);
    });
  }

  public override renderSuggestion(value: TemplateSnippet, el: HTMLElement): void {
    const titleEl = document.createElement('strong');
    titleEl.textContent = value.title;

    const descriptionEl = document.createElement('div');
    descriptionEl.textContent = value.description;

    const aliasesEl = document.createElement('small');
    aliasesEl.textContent = `关键词：${value.aliases.join(' / ')}`;

    el.append(titleEl, descriptionEl, aliasesEl);
  }

  public override onChooseSuggestion(item: TemplateSnippet): void {
    this.chooseTemplate(item);
  }
}

class FuzzyTemplateSuggestModal extends FuzzySuggestModal<TemplateSnippet> {
  public constructor(
    app: Plugin['app'],
    private readonly snippets: readonly TemplateSnippet[],
    private readonly chooseTemplate: (snippet: TemplateSnippet) => void,
  ) {
    super(app);
    this.limit = 8;
    this.emptyStateText = '没有匹配的模板，请换个关键词试试。';
    this.setTitle('模糊模板搜索');
    this.setPlaceholder('搜索模板，例如：复盘、阅读、代码');
    this.setInstructions([
      { command: 'Enter', purpose: '插入当前高亮模板' },
      { command: '↑ ↓', purpose: '切换高亮模板' },
    ]);
  }

  public override getItems(): readonly TemplateSnippet[] {
    return this.snippets;
  }

  public override getItemText(item: TemplateSnippet): string {
    return [item.title, item.description, ...item.aliases].join(' ');
  }

  public override renderSuggestion(
    value: { readonly item: TemplateSnippet; readonly match: { readonly score: number; readonly matches: readonly (readonly [number, number])[] } },
    el: HTMLElement,
  ): void {
    const titleEl = document.createElement('strong');
    titleEl.textContent = value.item.title;

    const descriptionEl = document.createElement('div');
    descriptionEl.textContent = value.item.description;

    const aliasesEl = document.createElement('small');
    aliasesEl.textContent = `关键词：${value.item.aliases.join(' / ')}`;

    el.append(titleEl, descriptionEl, aliasesEl);
  }

  public override onChooseItem(item: TemplateSnippet): void {
    this.chooseTemplate(item);
  }
}

export default class SuggestBasicDemoPlugin extends Plugin {
  private readonly snippets: readonly TemplateSnippet[] = [
    {
      id: 'meeting-note',
      title: '会议纪要模板',
      description: '快速插入会议纪要结构，适合记录结论和行动项。',
      aliases: ['会议', '纪要', '讨论'],
      body: (context) => [
        `## 会议纪要 - ${context.dateLabel}`,
        '',
        '- 参与人：',
        '- 议题：',
        '- 结论：',
        '- 后续行动：',
      ].join('\n'),
    },
    {
      id: 'daily-review',
      title: '每日复盘模板',
      description: '用于整理今天完成事项、问题和明日计划。',
      aliases: ['复盘', '日报', '计划'],
      body: (context) => [
        `## 每日复盘 - ${context.dateLabel}`,
        '',
        '### 今日完成',
        '- ',
        '',
        '### 遇到问题',
        '- ',
        '',
        '### 明日计划',
        '- ',
      ].join('\n'),
    },
    {
      id: 'code-note',
      title: '代码摘录模板',
      description: '插入代码说明块，适合记录某段实现和结论。',
      aliases: ['代码', '实现', '函数'],
      body: (context) => [
        `## 代码摘录 - ${context.timeLabel}`,
        '',
        '```ts',
        `// ${context.fileName}`,
        "console.log('demo-card');",
        '```',
        '',
        '- 说明：',
        '- 结论：',
      ].join('\n'),
    },
    {
      id: 'reading-note',
      title: '阅读摘录模板',
      description: '适合记录阅读要点、原文摘抄和行动建议。',
      aliases: ['阅读', '摘录', '文章'],
      body: (context) => [
        `## 阅读摘录 - ${context.dateLabel}`,
        '',
        '> 原文摘录：',
        '',
        '- 核心观点：',
        '- 可行动项：',
        `- 来源文件：${context.fileName}`,
      ].join('\n'),
    },
  ];

  private lastChosenSnippet: TemplateSnippet | null = null;

  public override onload(): void {
    this.addRibbonIcon('book-open', DEMO_TITLE, () => {
      this.openCommonTemplateModal();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'open-common-template-suggest',
      name: '模板插入器演示：打开常用模板',
      callback: () => {
        this.openCommonTemplateModal();
      },
    });

    this.addCommand({
      id: 'open-fuzzy-template-suggest',
      name: '模板插入器演示：打开模糊模板搜索',
      callback: () => {
        this.openFuzzyTemplateModal();
      },
    });

    this.addCommand({
      id: 'insert-last-template-again',
      name: '模板插入器演示：再次插入最近模板',
      callback: () => {
        this.insertLastTemplateAgain();
      },
    });
  }

  public override onFailed(failure: PluginFailureContext): void {
    new Notice(`${DEMO_TITLE}：在 ${failure.operation} 阶段发生异常。`, 2600);
  }

  public override onEnable(): void {
    return undefined;
  }

  public override onDisable(): void {
    return undefined;
  }

  public override onunload(): void {
    return undefined;
  }

  private openCommonTemplateModal(): void {
    const modal = new CommonTemplateSuggestModal(this.app, this.snippets, (snippet) => {
      void this.insertTemplate(snippet, '常用模板');
    });
    modal.open();
  }

  private openFuzzyTemplateModal(): void {
    const modal = new FuzzyTemplateSuggestModal(this.app, this.snippets, (snippet) => {
      void this.insertTemplate(snippet, '模糊模板');
    });
    modal.open();
  }

  private insertLastTemplateAgain(): void {
    if (this.lastChosenSnippet === null) {
      new Notice(`${DEMO_TITLE}：还没有最近一次模板，请先选择一个模板。`, 2200);
      return;
    }

    void this.insertTemplate(this.lastChosenSnippet, '最近模板');
  }

  private async insertTemplate(snippet: TemplateSnippet, source: string): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null) {
      return;
    }

    const renderedSnippet = this.renderSnippet(snippet, activeEditor.file);
    const editor = activeEditor.editor;
    const selectionText = editor.getSelection();
    const cursor = editor.getCursor();
    const prefix = selectionText.length === 0 && cursor.ch > 0 ? '\n' : '';
    const contentToInsert = `${prefix}${renderedSnippet}\n`;

    editor.replaceSelection(contentToInsert);
    editor.focus();
    this.lastChosenSnippet = snippet;
    new Notice(`${DEMO_TITLE}：已通过${source}插入“${snippet.title}”。`, 2400);
  }

  private async getActiveEditor(): Promise<ActiveEditorContext | null> {
    await this.refreshActiveEditor();
    const activeEditor = this.app.workspace.activeEditor;

    if (activeEditor?.editor === undefined) {
      new Notice(`${DEMO_TITLE}：请先聚焦一个可编辑文档。`, 2200);
      return null;
    }

    return activeEditor as ActiveEditorContext;
  }

  private async refreshActiveEditor(): Promise<void> {
    const workspace = this.app.workspace as typeof this.app.workspace & WorkspaceWithActiveEditorRefresh;

    if (typeof workspace.refreshActiveEditorState !== 'function') {
      return;
    }

    await workspace.refreshActiveEditorState();
  }

  private renderSnippet(snippet: TemplateSnippet, file: TFile | null): string {
    const now = new Date();
    const context: TemplateRenderContext = {
      dateLabel: this.formatDate(now),
      timeLabel: this.formatDateTime(now),
      fileName: file?.basename ?? '当前笔记',
    };

    return snippet.body(context);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDateTime(date: Date): string {
    const dateLabel = this.formatDate(date);
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    return `${dateLabel} ${hour}:${minute}`;
  }
}
