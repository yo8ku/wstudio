import {
  Notice,
  Plugin,
  SuggestModal,
  normalizePath,
  type CachedMetadata,
  type Editor,
  type EditorPosition,
  type MarkdownFileInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '文档整理工作台';
const SUMMARY_START_MARKER = '<!-- wstudio-curation:start -->';
const SUMMARY_END_MARKER = '<!-- wstudio-curation:end -->';

interface ActiveEditorContext extends MarkdownFileInfo {
  readonly editor: Editor;
}

interface WorkspaceWithActiveEditorRefresh {
  refreshActiveEditorState?(): Promise<MarkdownFileInfo | null>;
}

interface WorkbenchAction {
  readonly id: 'curate-current-document' | 'sync-frontmatter' | 'update-summary' | 'open-action-note' | 'insert-action-link';
  readonly title: string;
  readonly description: string;
}

class CurationWorkbenchModal extends SuggestModal<WorkbenchAction> {
  public constructor(
    app: Plugin['app'],
    private readonly actions: readonly WorkbenchAction[],
    private readonly chooseAction: (action: WorkbenchAction) => void,
  ) {
    super(app);
    this.limit = 8;
    this.emptyStateText = '没有匹配的整理动作。';
    this.setTitle('文档整理工作台');
    this.setPlaceholder('搜索整理动作，例如：摘要、frontmatter、行动');
    this.setInstructions([
      { command: 'Enter', purpose: '执行当前高亮动作' },
      { command: 'Click', purpose: '直接执行所选动作' },
    ]);
  }

  public override getSuggestions(query: string): readonly WorkbenchAction[] {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery.length === 0) {
      return this.actions;
    }

    return this.actions.filter((action) => {
      return `${action.title} ${action.description}`.toLowerCase().includes(normalizedQuery);
    });
  }

  public override renderSuggestion(value: WorkbenchAction, el: HTMLElement): void {
    const titleEl = document.createElement('strong');
    titleEl.textContent = value.title;

    const descriptionEl = document.createElement('div');
    descriptionEl.textContent = value.description;

    el.append(titleEl, descriptionEl);
  }

  public override onChooseSuggestion(item: WorkbenchAction): void {
    this.chooseAction(item);
  }
}

function createDefaultActions(): readonly WorkbenchAction[] {
  return [
    {
      id: 'curate-current-document',
      title: '一键整理当前文档',
      description: '规范 frontmatter、更新整理摘要，并创建/打开关联行动清单。',
    },
    {
      id: 'sync-frontmatter',
      title: '仅同步 frontmatter',
      description: '把当前文档的状态、已整理标记和标签统一成整理状态。',
    },
    {
      id: 'update-summary',
      title: '更新整理摘要',
      description: '根据当前文档的标题、标签、链接数量，回写可见的整理摘要。',
    },
    {
      id: 'open-action-note',
      title: '创建并打开行动清单',
      description: '生成当前文档的关联行动清单，并直接打开该文件。',
    },
    {
      id: 'insert-action-link',
      title: '插入行动清单链接',
      description: '把关联行动清单的 wiki link 插入回当前文档。',
    },
  ];
}

export default class VaultMetadataEditorComboDemoPlugin extends Plugin {
  private readonly actions = createDefaultActions();

  public override onload(): void {
    this.addRibbonIcon('wand-sparkles', DEMO_TITLE, () => {
      this.openWorkbench();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'open-curation-workbench',
      name: '文档整理工作台：打开动作面板',
      callback: () => {
        this.openWorkbench();
      },
    });
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

  public override onFailed(failure: PluginFailureContext): void {
    new Notice(`${DEMO_TITLE}：在 ${failure.operation} 阶段发生异常。`, 2600);
  }

  private openWorkbench(): void {
    const modal = new CurationWorkbenchModal(this.app, this.actions, (action) => {
      void this.runAction(action);
    });
    modal.open();
  }

  private async runAction(action: WorkbenchAction): Promise<void> {
    switch (action.id) {
      case 'curate-current-document':
        await this.curateCurrentDocument();
        return;
      case 'sync-frontmatter':
        await this.syncFrontmatter();
        return;
      case 'update-summary':
        await this.updateSummarySection();
        return;
      case 'open-action-note':
        await this.openActionNote();
        return;
      case 'insert-action-link':
        await this.insertActionLink();
        return;
    }
  }

  private async curateCurrentDocument(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null || activeEditor.file === null) {
      return;
    }

    await this.applyFrontmatterChanges(activeEditor.file);
    await this.waitForMetadataRefresh();
    const refreshedEditor = await this.getActiveEditor();

    if (refreshedEditor === null || refreshedEditor.file === null) {
      return;
    }

    const actionFile = await this.ensureActionNote(refreshedEditor.file);
    await this.waitForMetadataRefresh();
    this.upsertSummarySection(refreshedEditor.editor, refreshedEditor.file, actionFile);
    await this.waitForEditorMutation();
    await this.openFileInWorkspace(actionFile);
  }

  private async syncFrontmatter(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null || activeEditor.file === null) {
      return;
    }

    await this.applyFrontmatterChanges(activeEditor.file);
    await this.waitForMetadataRefresh();
  }

  private async updateSummarySection(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null || activeEditor.file === null) {
      return;
    }

    const actionFile = await this.ensureActionNote(activeEditor.file);
    await this.waitForMetadataRefresh();
    this.upsertSummarySection(activeEditor.editor, activeEditor.file, actionFile);
    await this.waitForEditorMutation();
  }

  private async openActionNote(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null || activeEditor.file === null) {
      return;
    }

    const actionFile = await this.ensureActionNote(activeEditor.file);
    const linkText = this.app.metadataCache.fileToLinktext(actionFile, activeEditor.file.path, true);
    await this.app.workspace.openLinkText(linkText, activeEditor.file.path, 'tab');
  }

  private async insertActionLink(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null || activeEditor.file === null) {
      return;
    }

    const actionFile = await this.ensureActionNote(activeEditor.file);
    const linkText = this.app.fileManager.generateMarkdownLink(
      actionFile,
      activeEditor.file.path,
      undefined,
      `${activeEditor.file.basename} 行动清单`,
    );
    const cursor = activeEditor.editor.getCursor();
    const prefix = cursor.ch > 0 ? '\n' : '';

    activeEditor.editor.replaceSelection(`${prefix}${linkText}\n`);
    await this.waitForEditorMutation();
  }

  private async getActiveEditor(): Promise<ActiveEditorContext | null> {
    await this.refreshActiveEditor();
    const activeEditor = this.app.workspace.activeEditor;

    if (activeEditor?.editor === undefined || activeEditor.file === null) {
      new Notice(`${DEMO_TITLE}：请先聚焦一个 Markdown 文档。`, 2200);
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

  private async applyFrontmatterChanges(file: TFile): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.status = 'curated';
      frontmatter.reviewed = true;
      frontmatter.curatedAt = this.formatDateTime(new Date());

      const currentTags = frontmatter.tags;
      const normalizedTags = this.normalizeTagList(currentTags);

      if (!normalizedTags.includes('curated')) {
        normalizedTags.push('curated');
      }

      frontmatter.tags = [...new Set(normalizedTags)];
    });
  }

  private async ensureActionNote(file: TFile): Promise<TFile> {
    const actionPath = this.createActionNotePath(file);
    const sourceLink = this.app.fileManager.generateMarkdownLink(file, actionPath, undefined, file.basename);
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatterTags = this.getFrontmatterDisplayTags(cache);
    const inlineTags = this.getInlineDisplayTags(cache);
    const actionContent = [
      `# ${file.basename} - 整理行动`,
      '',
      `来源：${sourceLink}`,
      '',
      '## 待办',
      '- [ ] 补充最终结论',
      `- [ ] 检查 frontmatter 标签：${frontmatterTags.length === 0 ? '无' : frontmatterTags.join(' / ')}`,
      `- [ ] 检查正文标签：${inlineTags.length === 0 ? '无' : inlineTags.join(' / ')}`,
      `- [ ] 检查链接数量：${(cache?.links ?? []).length}`,
    ].join('\n');

    const existingFile = this.app.vault.getFileByPath(actionPath);

    if (existingFile !== null) {
      await this.app.vault.modify(existingFile, actionContent);
      return this.requireFile(actionPath);
    }

    return this.app.vault.create(actionPath, actionContent);
  }

  private upsertSummarySection(editor: Editor, file: TFile, actionFile: TFile): void {
    const currentContent = editor.getValue();
    const cache = this.app.metadataCache.getFileCache(file);
    const nextSection = this.buildSummarySection(cache, actionFile, file);
    const existingStart = currentContent.indexOf(SUMMARY_START_MARKER);
    const existingEnd = currentContent.indexOf(SUMMARY_END_MARKER);

    if (existingStart !== -1 && existingEnd !== -1 && existingEnd >= existingStart) {
      const replaceFrom = this.offsetToPosition(currentContent, existingStart);
      const replaceTo = this.offsetToPosition(
        currentContent,
        existingEnd + SUMMARY_END_MARKER.length,
      );
      editor.replaceRange(nextSection, replaceFrom, replaceTo);
      return;
    }

    const prefix = currentContent.trimEnd().length === 0 ? '' : '\n\n';
    const endPosition = this.offsetToPosition(currentContent, currentContent.length);
    editor.replaceRange(`${prefix}${nextSection}\n`, endPosition);
  }

  private buildSummarySection(cache: CachedMetadata | null, actionFile: TFile, sourceFile: TFile): string {
    const headings = (cache?.headings ?? []).map((heading) => heading.heading);
    const frontmatterTags = this.getFrontmatterDisplayTags(cache);
    const inlineTags = this.getInlineDisplayTags(cache);
    const actionLink = this.app.fileManager.generateMarkdownLink(
      actionFile,
      sourceFile.path,
      undefined,
      `${sourceFile.basename} 行动清单`,
    );

    return [
      SUMMARY_START_MARKER,
      '## 整理摘要',
      `- 标题数量：${(cache?.headings ?? []).length}`,
      `- frontmatter 标签：${frontmatterTags.length === 0 ? '无' : frontmatterTags.join(' / ')}`,
      `- 正文标签：${inlineTags.length === 0 ? '无' : inlineTags.join(' / ')}`,
      `- 链接数量：${(cache?.links ?? []).length}`,
      `- 标题列表：${headings.length === 0 ? '无' : headings.join(' / ')}`,
      `- 行动清单：${actionLink}`,
      SUMMARY_END_MARKER,
    ].join('\n');
  }

  private createActionNotePath(file: TFile): string {
    const parentPath = file.parent?.path ?? '';
    const actionFileName = `${file.basename}-整理行动.md`;

    if (parentPath.length === 0) {
      return normalizePath(actionFileName);
    }

    return normalizePath(`${parentPath}/${actionFileName}`);
  }

  private requireFile(targetPath: string): TFile {
    const file = this.app.vault.getFileByPath(targetPath);

    if (file === null) {
      throw new Error(`未找到目标文件：${targetPath}`);
    }

    return file;
  }

  private stringifyTags(cache: CachedMetadata | null): string {
    const tags = [...this.getFrontmatterDisplayTags(cache), ...this.getInlineDisplayTags(cache)];
    return tags.length === 0 ? '无' : tags.join(' / ');
  }

  private collectVisibleTags(cache: CachedMetadata | null): readonly string[] {
    const inlineTags = this.getInlineDisplayTags(cache);
    const frontmatterTags = this.getFrontmatterDisplayTags(cache);
    return [...new Set([...frontmatterTags, ...inlineTags])];
  }

  private getFrontmatterDisplayTags(cache: CachedMetadata | null): readonly string[] {
    const frontmatterTags = this.normalizeTagList(cache?.frontmatter?.tags);

    return [...new Set(frontmatterTags.map((value) => this.normalizeTagDisplay(value)))];
  }

  private getInlineDisplayTags(cache: CachedMetadata | null): readonly string[] {
    return [...new Set((cache?.tags ?? []).map((tag) => this.normalizeTagDisplay(tag.tag)))];
  }

  private normalizeTagList(currentTags: JsonLikeValue | undefined): string[] {
    if (Array.isArray(currentTags)) {
      return currentTags.flatMap((value) => this.normalizeTagList(value));
    }

    if (typeof currentTags === 'string') {
      const trimmed = currentTags.trim();

      if (trimmed.length === 0) {
        return [];
      }

      const parsedArray = this.tryParseTagArrayString(trimmed);

      if (parsedArray !== null) {
        return parsedArray.flatMap((value) => this.normalizeTagList(value));
      }

      return [trimmed];
    }

    return [];
  }

  private tryParseTagArrayString(value: string): readonly string[] | null {
    const trimmed = value.trim();

    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed) as JsonLikeValue;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : null;
    } catch {
      return null;
    }
  }

  private normalizeTagDisplay(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }

  private offsetToPosition(content: string, offset: number): EditorPosition {
    let currentLine = 0;
    let currentCh = 0;
    let currentOffset = 0;

    while (currentOffset < offset && currentOffset < content.length) {
      const character = content[currentOffset];

      if (character === '\n') {
        currentLine += 1;
        currentCh = 0;
      } else {
        currentCh += 1;
      }

      currentOffset += 1;
    }

    return {
      line: currentLine,
      ch: currentCh,
    };
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async waitForMetadataRefresh(): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  }

  private async waitForEditorMutation(): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 40);
    });
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
}

type JsonLikeValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonLikeValue[]
  | { readonly [key: string]: JsonLikeValue | undefined };
