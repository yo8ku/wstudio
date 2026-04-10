/**
 * Demo plugin entry used to verify Bases view registration and value-oriented
 * APIs with visible report files.
 */

import {
  BasesEntry,
  BasesEntryGroup,
  BasesQueryResult,
  BasesView,
  BasesViewConfig,
  BooleanValue,
  DateValue,
  DurationValue,
  FileValue,
  ListValue,
  Notice,
  NullValue,
  NumberValue,
  ObjectValue,
  Plugin,
  QueryController,
  RegExpValue,
  RelativeDateValue,
  StringValue,
  TagValue,
  UrlValue,
  Value,
  normalizePath,
  parsePropertyId,
  type BasesPropertyId,
  type FrontMatterCache,
  type MutableJsonObject,
  type PluginFailureContext,
  type TFile,
  type ViewOption,
} from '@note-studio/plugin';

const DEMO_TITLE = 'Bases 总览演示';
const DEMO_FOLDER_PATH = normalizePath('plugin-api-demo/bases-overview');
const NOTE_A_PATH = normalizePath(`${DEMO_FOLDER_PATH}/note-a.md`);
const NOTE_B_PATH = normalizePath(`${DEMO_FOLDER_PATH}/note-b.md`);
const OVERVIEW_REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/bases-overview-report.md`);
const VALUES_REPORT_PATH = normalizePath(`${DEMO_FOLDER_PATH}/bases-values-report.md`);
const DEMO_VIEW_ID = 'overview';

interface BasesViewSnapshot {
  readonly registrationName: string;
  readonly icon: string;
  readonly textContent: string;
  readonly dataset: Readonly<Record<string, string>>;
  readonly domSnapshot: readonly string[];
  readonly optionSummary: readonly string[];
}

interface BasesBridge {
  renderBasesViewSnapshot(pluginId: string, viewId: string): Promise<BasesViewSnapshot | null>;
}

interface BasesBridgeOwner {
  readonly __wstudioPluginHostBasesBridge?: BasesBridge;
}

function stringifyList(values: readonly string[]): string {
  return values.length === 0 ? '无' : values.join(' | ');
}

async function ensureDemoFolder(app: Plugin['app']): Promise<void> {
  const folder = app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

  if (folder !== null) {
    return;
  }

  await app.vault.createFolder(DEMO_FOLDER_PATH);
}

async function ensureDemoNotes(app: Plugin['app']): Promise<readonly [TFile, TFile]> {
  await ensureDemoFolder(app);
  const noteA = await ensureNote(app, NOTE_A_PATH, [
    '# Alpha Note',
    '',
    'status: draft',
    'score: 95',
  ].join('\n'));
  const noteB = await ensureNote(app, NOTE_B_PATH, [
    '# Beta Note',
    '',
    'status: reviewed',
    'score: 88',
  ].join('\n'));
  return [noteA, noteB] as const;
}

async function ensureNote(app: Plugin['app'], path: string, content: string): Promise<TFile> {
  const existingFile = app.vault.getFileByPath(path);

  if (existingFile !== null) {
    return existingFile;
  }

  return app.vault.create(path, content);
}

class DemoBasesOverviewView extends BasesView {
  public type = 'wstudio-demo-bases-overview';

  public constructor(
    controller: QueryController,
    containerEl: HTMLElement,
  ) {
    super(controller, containerEl);
  }

  public override async onload(): Promise<void> {
    const [noteA, noteB] = await ensureDemoNotes(this.app);
    const properties: readonly BasesPropertyId[] = [
      'note.title',
      'note.status',
      'formula.score',
    ];
    const firstEntry = new BasesEntry(noteA, {
      'note.title': new StringValue('Alpha Note'),
      'note.status': new TagValue('draft'),
      'formula.score': new NumberValue(95),
    });
    const secondEntry = new BasesEntry(noteB, {
      'note.title': new StringValue('Beta Note'),
      'note.status': new TagValue('reviewed'),
      'formula.score': new NumberValue(88),
    });

    this.config = new BasesViewConfig('演示数据总览', {
      order: [...properties],
      sort: [
        {
          property: 'note.status',
          direction: 'ASC',
        },
      ],
      focusProperty: 'note.title',
      'displayName:note.title': '标题',
      'displayName:note.status': '状态',
      'displayName:formula.score': '评分',
    });
    this.allProperties = [...properties];
    this.data = new BasesQueryResult(
      [firstEntry, secondEntry],
      [...properties],
      [
        new BasesEntryGroup([firstEntry], new StringValue('进行中')),
        new BasesEntryGroup([secondEntry], new StringValue('已完成')),
      ],
    );

    await this.createFileForView('Bases Overview Demo', (frontmatter: MutableJsonObject) => {
      frontmatter.kind = 'bases-demo';
      frontmatter.view = this.config.name;
      frontmatter.total = this.data.data.length;
    });

    this.containerEl.dataset.viewLoaded = 'true';
  }

  public override onDataUpdated(): void {
    this.containerEl.replaceChildren();
    const headingEl = document.createElement('h1');
    headingEl.textContent = this.config.name;
    this.containerEl.append(headingEl);

    const propertiesEl = document.createElement('p');
    propertiesEl.textContent = `属性：${this.data.properties.map((propertyId) => this.config.getDisplayName(propertyId)).join('、')}`;
    this.containerEl.append(propertiesEl);

    const summaryValue = this.data.getSummaryValue(this.controller, this.data.data, 'note.title', 'count');
    const summaryEl = document.createElement('p');
    summaryEl.textContent = `条目数：${summaryValue.toString()}`;
    this.containerEl.append(summaryEl);

    const groupListEl = document.createElement('ul');

    for (const group of this.data.groupedData) {
      const itemEl = document.createElement('li');
      itemEl.textContent = `${group.hasKey() ? group.key?.toString() ?? '无' : '无分组'}:${group.entries.length}`;
      groupListEl.append(itemEl);
    }

    this.containerEl.append(groupListEl);
    this.containerEl.dataset.entryCount = String(this.data.data.length);
    this.containerEl.dataset.groupCount = String(this.data.groupedData.length);
    this.containerEl.dataset.properties = stringifyList(this.data.properties);
    this.containerEl.dataset.summaryCount = summaryValue.toString();
  }

  public override onunload(): void {
    return undefined;
  }
}

export default class BasesOverviewDemoPlugin extends Plugin {
  private registerSuccess = false;

  public override onload(): void {
    this.recordTrace('plugin.onload');
    this.registerSuccess = this.registerBasesView(DEMO_VIEW_ID, {
      name: '演示数据视图',
      icon: 'book-open',
      factory: (controller, containerEl) => {
        return new DemoBasesOverviewView(controller, containerEl);
      },
      options: (): readonly ViewOption[] => [
        {
          type: 'text',
          key: 'titlePrefix',
          displayName: '标题前缀',
          default: 'Demo',
        },
        {
          type: 'toggle',
          key: 'showScores',
          displayName: '显示评分',
          default: true,
        },
        {
          type: 'slider',
          key: 'limit',
          displayName: '条目数量',
          default: 10,
          min: 1,
          max: 20,
        },
        {
          type: 'group',
          displayName: '进阶设置',
          items: [
            {
              type: 'text',
              key: 'groupLabel',
              displayName: '分组标题',
              default: '状态',
            },
            {
              type: 'toggle',
              key: 'showGroupCount',
              displayName: '显示分组计数',
              default: true,
            },
          ],
        },
      ],
    });

    this.addRibbonIcon('book-open', DEMO_TITLE, () => {
      void this.generateAndOpenReports();
    }, { location: 'activityBar' });

    this.addCommand({
      id: 'generate-open-bases-overview-report',
      name: 'Bases 总览演示：生成并打开报告',
      callback: () => {
        void this.generateAndOpenReports();
      },
    });

    this.addCommand({
      id: 'cleanup-bases-overview-demo',
      name: 'Bases 总览演示：清理测试目录',
      callback: () => {
        void this.cleanupDemoFolder();
      },
    });
  }

  public override onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public override onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public override onunload(): void {
    this.recordTrace('plugin.onunload');
  }

  public override onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed operation=${failure.operation}`);
    this.showNotice(`在 ${failure.operation} 阶段出现异常。`, 2600);
  }

  private async generateAndOpenReports(): Promise<void> {
    await ensureDemoNotes(this.app);
    const overviewReport = await this.buildOverviewReport();
    const valuesReport = await this.buildValuesReport();
    const valuesFile = await this.upsertMarkdownFile(VALUES_REPORT_PATH, valuesReport);
    const overviewFile = await this.upsertMarkdownFile(OVERVIEW_REPORT_PATH, overviewReport);
    await this.openFileInWorkspace(valuesFile);
    await this.openFileInWorkspace(overviewFile);
    this.showNotice(`已生成并打开 ${overviewFile.path}。`, 3200);
  }

  private async buildOverviewReport(): Promise<string> {
    const bridge = this.getBasesBridge();
    const snapshot = bridge === null
      ? null
      : await bridge.renderBasesViewSnapshot(this.manifest.id, DEMO_VIEW_ID);

    return [
      '# Bases Overview Report',
      '',
      `registerSuccess=${String(this.registerSuccess)}`,
      `registrationFound=${String(snapshot !== null)}`,
      `registrationName=${snapshot?.registrationName ?? '无'}`,
      `icon=${snapshot?.icon ?? '无'}`,
      `textContent=${snapshot?.textContent ?? '无'}`,
      `dataset.viewLoaded=${snapshot?.dataset.viewLoaded ?? '无'}`,
      `dataset.entryCount=${snapshot?.dataset.entryCount ?? '无'}`,
      `dataset.groupCount=${snapshot?.dataset.groupCount ?? '无'}`,
      `dataset.properties=${snapshot?.dataset.properties ?? '无'}`,
      `dataset.summaryCount=${snapshot?.dataset.summaryCount ?? '无'}`,
      `dataset.lastCreatedFile=${snapshot?.dataset.lastCreatedFile ?? '无'}`,
      `dataset.lastCreatedFrontmatter=${snapshot?.dataset.lastCreatedFrontmatter ?? '无'}`,
      `optionSummary=${stringifyList(snapshot?.optionSummary ?? [])}`,
      '',
      '## DOM Snapshot',
      ...(snapshot?.domSnapshot ?? ['无']),
    ].join('\n');
  }

  private async buildValuesReport(): Promise<string> {
    const [noteA] = await ensureDemoNotes(this.app);
    const booleanValue = new BooleanValue(true);
    const numberValue = new NumberValue(42);
    const stringValue = new StringValue('Alpha Note');
    const dateValue = new DateValue('2024-01-02T03:04:05Z');
    const durationValue = DurationValue.parseFromString('P1DT2H');
    const fileValue = new FileValue(noteA);
    const listValue = new ListValue(['alpha', 'beta', 3]);
    const objectValue = new ObjectValue({
      title: 'Alpha',
      count: 2,
    });
    const tagValue = new TagValue('bases');
    const urlValue = new UrlValue('https://example.com');
    const regexpValue = new RegExpValue(/demo/i);
    const relativeDateValue = new RelativeDateValue('2024-01-02T03:04:05Z');
    const properties: readonly BasesPropertyId[] = [
      'note.title',
      'note.status',
      'formula.score',
    ];
    const config = new BasesViewConfig('值验证', {
      order: [...properties],
      sort: [
        {
          property: 'formula.score',
          direction: 'DESC',
        },
      ],
      'displayName:note.title': '标题',
      'displayName:note.status': '状态',
      'displayName:formula.score': '评分',
      focusProperty: 'note.status',
    });
    const entries = [
      new BasesEntry(noteA, {
        'note.title': stringValue,
        'note.status': tagValue,
        'formula.score': numberValue,
      }),
      new BasesEntry(noteA, {
        'note.title': new StringValue('Beta Note'),
        'note.status': new TagValue('reviewed'),
        'formula.score': new NumberValue(88),
      }),
    ];
    const queryResult = new BasesQueryResult(entries, [...properties], [
      new BasesEntryGroup(entries, new StringValue('全部条目')),
    ]);
    const summaryCount = queryResult.getSummaryValue(new QueryController(this.app), entries, 'note.title', 'count');
    const parsedProperty = parsePropertyId('note.title');

    return [
      '# Bases Values Report',
      '',
      `booleanValue=${booleanValue.toString()}`,
      `numberValue=${numberValue.toString()}`,
      `stringValue=${stringValue.toString()}`,
      `dateValue=${dateValue.toString()}`,
      `dateOnly=${dateValue.dateOnly().toString()}`,
      `durationMilliseconds=${durationValue?.getMilliseconds() ?? '无'}`,
      `fileValue=${fileValue.toString()}`,
      `listValue=${listValue.toString()}`,
      `listLength=${String(listValue.length())}`,
      `listIncludesAlpha=${String(listValue.includes(new StringValue('ALPHA')))}`,
      `objectValue=${objectValue.toString()}`,
      `objectTitle=${objectValue.get('title')?.toString() ?? '无'}`,
      `nullValue=${NullValue.value.toString()}`,
      `tagValue=${tagValue.toString()}`,
      `urlValue=${urlValue.toString()}`,
      `regexpValue=${regexpValue.toString()}`,
      `relativeDateValue=${relativeDateValue.toString()}`,
      `valueEquals=${String(Value.equals(new StringValue('same'), new StringValue('same')))}`,
      `valueLooseEquals=${String(Value.looseEquals(new StringValue('Alpha'), new StringValue(' alpha ')))}`,
      `parsedProperty=${parsedProperty?.type ?? '无'}.${parsedProperty?.name ?? '无'}`,
      `configOrder=${stringifyList(config.getOrder())}`,
      `configSort=${stringifyList(config.getSort().map((item) => `${item.property}:${item.direction}`))}`,
      `configDisplayName=${config.getDisplayName('note.title')}`,
      `configEvaluatedFormula=${config.getEvaluatedFormula(new DemoBasesOverviewView(new QueryController(this.app), document.createElement('div')), 'focusProperty').toString()}`,
      `summaryCount=${summaryCount.toString()}`,
    ].join('\n');
  }

  private getBasesBridge(): BasesBridge | null {
    const owner = globalThis as typeof globalThis & BasesBridgeOwner;
    return owner.__wstudioPluginHostBasesBridge ?? null;
  }

  private async upsertMarkdownFile(path: string, content: string): Promise<TFile> {
    await ensureDemoFolder(this.app);
    const existingFile = this.app.vault.getFileByPath(path);

    if (existingFile === null) {
      return this.app.vault.create(path, content);
    }

    await this.app.vault.modify(existingFile, content);
    return this.requireFile(path);
  }

  private requireFile(path: string): TFile {
    const file = this.app.vault.getFileByPath(path);

    if (file === null) {
      throw new Error(`Expected demo file "${path}" to exist.`);
    }

    return file;
  }

  private async openFileInWorkspace(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async cleanupDemoFolder(): Promise<void> {
    const abstractFile = this.app.vault.getAbstractFileByPath(DEMO_FOLDER_PATH);

    if (abstractFile !== null) {
      await this.app.vault.delete(abstractFile, true);
    }

    this.showNotice('已清理 bases-overview 测试目录。', 2800);
  }

  private showNotice(message: string, timeout = 2400): void {
    void timeout;
    new Notice(`${DEMO_TITLE}：${message}`);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-bases-overview] ${message}`);
  }
}
