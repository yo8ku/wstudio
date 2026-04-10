import {
  Modal,
  Notice,
  Plugin,
  type Editor,
  type JsonObject,
  type JsonValue,
  type MarkdownFileInfo,
  type PluginFailureContext,
  type TFile,
} from '@note-studio/plugin';
import { CommandModalSettingComboDemoTab } from './settings';

const DEMO_TITLE = '笔记整理助手演示';
const PREFIX_COMMAND_ID = 'command-modal-setting-combo-cycle-prefix';
const TAG_COMMAND_ID = 'command-modal-setting-combo-cycle-tag';
const ACTION_COMMAND_ID = 'command-modal-setting-combo-toggle-actions';
const INSERT_COMMAND_ID = 'command-modal-setting-combo-insert-card';
const PREVIEW_COMMAND_ID = 'command-modal-setting-combo-open-preview';
const RESET_COMMAND_ID = 'command-modal-setting-combo-reset';

const TITLE_PREFIX_VARIANTS = ['整理', '行动', '复盘'] as const;
const TAG_VARIANTS = ['#review', '#meeting', '#todo'] as const;

interface ActiveEditorContext extends MarkdownFileInfo {
  readonly editor: Editor;
}

interface WorkspaceWithActiveEditorRefresh {
  refreshActiveEditorState?(): Promise<MarkdownFileInfo | null>;
}

interface ComboDemoSettings extends JsonObject {
  readonly titlePrefix: string;
  readonly defaultTag: string;
  readonly includeActionItems: boolean;
}

function createDefaultSettings(): ComboDemoSettings {
  return {
    titlePrefix: TITLE_PREFIX_VARIANTS[0],
    defaultTag: TAG_VARIANTS[0],
    includeActionItems: true,
  };
}

function normalizeSettings(candidate: JsonValue | null): ComboDemoSettings {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createDefaultSettings();
  }

  const record = candidate as {
    readonly titlePrefix?: JsonValue;
    readonly defaultTag?: JsonValue;
    readonly includeActionItems?: JsonValue;
  };

  return {
    titlePrefix: typeof record.titlePrefix === 'string' && record.titlePrefix.trim().length > 0
      ? record.titlePrefix.trim()
      : TITLE_PREFIX_VARIANTS[0],
    defaultTag: typeof record.defaultTag === 'string' && record.defaultTag.trim().length > 0
      ? record.defaultTag.trim()
      : TAG_VARIANTS[0],
    includeActionItems: typeof record.includeActionItems === 'boolean'
      ? record.includeActionItems
      : true,
  };
}

function getNextVariant(currentValue: string, variants: readonly string[]): string {
  const currentIndex = variants.indexOf(currentValue);

  if (currentIndex === -1) {
    return variants[0] ?? '';
  }

  return variants[(currentIndex + 1) % variants.length] ?? variants[0] ?? '';
}

class ComboPreviewModal extends Modal {
  public constructor(
    app: Plugin['app'],
    title: string,
    description: string,
  ) {
    super(app);
    this.setTitle(title);
    this.setContent(description);
  }
}

export default class CommandModalSettingComboDemoPlugin extends Plugin {
  public settings: ComboDemoSettings = createDefaultSettings();
  public lastInsertedTitle = '暂无插入记录';
  public lastInsertedPreview: string | null = null;

  public override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData<ComboDemoSettings>());

    this.addRibbonIcon('sparkles', DEMO_TITLE, () => {
      this.openPreviewModal();
    }, { location: 'activityBar' });

    this.addSettingTab(new CommandModalSettingComboDemoTab<this>(this.app, this));

    this.addCommand({
      id: PREFIX_COMMAND_ID,
      name: '整理助手演示：切换标题前缀',
      callback: async () => {
        await this.cycleTitlePrefix();
      },
    });

    this.addCommand({
      id: TAG_COMMAND_ID,
      name: '整理助手演示：切换默认标签',
      callback: async () => {
        await this.cycleDefaultTag();
      },
    });

    this.addCommand({
      id: ACTION_COMMAND_ID,
      name: '整理助手演示：切换行动项开关',
      callback: async () => {
        await this.toggleActionItems();
      },
    });

    this.addCommand({
      id: INSERT_COMMAND_ID,
      name: '整理助手演示：插入整理卡片',
      callback: async () => {
        await this.insertReviewCard();
      },
    });

    this.addCommand({
      id: PREVIEW_COMMAND_ID,
      name: '整理助手演示：打开当前配置预览',
      callback: () => {
        this.openPreviewModal();
      },
    });

    this.addCommand({
      id: RESET_COMMAND_ID,
      name: '整理助手演示：恢复默认配置',
      callback: async () => {
        await this.resetDefaults();
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

  public getSettingsSummary(): string {
    return `前缀：${this.settings.titlePrefix}；标签：${this.settings.defaultTag}；行动项：${this.settings.includeActionItems ? '开启' : '关闭'}`;
  }

  private async cycleTitlePrefix(): Promise<void> {
    this.settings = {
      ...this.settings,
      titlePrefix: getNextVariant(this.settings.titlePrefix, TITLE_PREFIX_VARIANTS),
    };
    await this.persistSettings('标题前缀已切换');
  }

  private async cycleDefaultTag(): Promise<void> {
    this.settings = {
      ...this.settings,
      defaultTag: getNextVariant(this.settings.defaultTag, TAG_VARIANTS),
    };
    await this.persistSettings('默认标签已切换');
  }

  private async toggleActionItems(): Promise<void> {
    this.settings = {
      ...this.settings,
      includeActionItems: !this.settings.includeActionItems,
    };
    await this.persistSettings('行动项开关已切换');
  }

  private async resetDefaults(): Promise<void> {
    this.settings = createDefaultSettings();
    await this.persistSettings('已恢复默认配置');
  }

  private async persistSettings(prefix: string): Promise<void> {
    await this.saveData(this.settings);
    new Notice(`${prefix}：${this.getSettingsSummary()}`, 2600);
  }

  private async insertReviewCard(): Promise<void> {
    const activeEditor = await this.getActiveEditor();

    if (activeEditor === null) {
      return;
    }

    const snippet = this.buildSnippet(activeEditor.file);
    const editor = activeEditor.editor;
    const selectionText = editor.getSelection();
    const cursor = editor.getCursor();
    const prefix = selectionText.length === 0 && cursor.ch > 0 ? '\n\n' : '';

    editor.replaceSelection(`${prefix}${snippet}\n`);
    editor.focus();

    this.lastInsertedTitle = `${this.settings.titlePrefix}卡片`;
    this.lastInsertedPreview = snippet.split('\n').slice(0, 6).join(' / ');

    new Notice(`${DEMO_TITLE}：已插入整理卡片。`, 2400);
    this.openPreviewModal();
  }

  private openPreviewModal(): void {
    const previewModal = new ComboPreviewModal(
      this.app,
      `${DEMO_TITLE}预览`,
      this.createPreviewDescription(),
    );
    previewModal.open();
  }

  private createPreviewDescription(): string {
    const latestInserted = this.lastInsertedPreview ?? '暂无插入记录。';

    return [
      `当前配置：${this.getSettingsSummary()}`,
      '',
      `最近一次插入：${this.lastInsertedTitle}`,
      latestInserted,
      '',
      '你可以先切换配置，再执行“插入整理卡片”，直接观察当前文档内容变化。',
    ].join('\n');
  }

  private buildSnippet(file: TFile | null): string {
    const dateLabel = this.formatDate(new Date());
    const fileName = file?.basename ?? '当前笔记';
    const sections = [
      `## ${this.settings.titlePrefix} - ${dateLabel}`,
      '',
      `标签：${this.settings.defaultTag}`,
      `文件：${fileName}`,
      '',
      '### 要点',
      '- ',
    ];

    if (this.settings.includeActionItems) {
      sections.push(
        '',
        '### 下一步',
        '- [ ] ',
      );
    }

    return sections.join('\n');
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

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
