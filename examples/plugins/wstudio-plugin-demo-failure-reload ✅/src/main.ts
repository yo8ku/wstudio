import {
  Notice,
  Plugin,
  type JsonObject,
  type JsonValue,
  type PluginFailureContext,
  type StatusBarItem,
  type TFile,
} from '@note-studio/plugin';

const DEMO_TITLE = '故障重载实验室';
const REPORT_FOLDER_PATH = 'plugin-api-demo/failure-reload';
const REPORT_FILE_PATH = `${REPORT_FOLDER_PATH}/failure-reload-report.md`;
const OPEN_REPORT_COMMAND_ID = 'failure-reload-open-report';
const ARM_FAILURE_COMMAND_ID = 'failure-reload-arm-failure-once';
const RESET_STATE_COMMAND_ID = 'failure-reload-reset-state';

type DemoPhase = 'healthy' | 'armed' | 'failed-once' | 'recovered';

interface FailureReloadDemoState extends JsonObject {
  readonly armedFailure: boolean;
  readonly loadCount: number;
  readonly cleanupCount: number;
  readonly recoveryCount: number;
  readonly lastPhase: DemoPhase;
  readonly lastHealthyAt: string | null;
  readonly lastCleanupAt: string | null;
  readonly lastFailureAt: string | null;
  readonly lastFailureMessage: string | null;
}

function createDefaultState(): FailureReloadDemoState {
  return {
    armedFailure: false,
    loadCount: 0,
    cleanupCount: 0,
    recoveryCount: 0,
    lastPhase: 'healthy',
    lastHealthyAt: null,
    lastCleanupAt: null,
    lastFailureAt: null,
    lastFailureMessage: null,
  };
}

function normalizeState(candidate: JsonValue | null): FailureReloadDemoState {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createDefaultState();
  }

  const record = candidate as Record<string, JsonValue | undefined>;
  const phase = record.lastPhase;

  return {
    armedFailure: typeof record.armedFailure === 'boolean' ? record.armedFailure : false,
    loadCount: typeof record.loadCount === 'number' ? record.loadCount : 0,
    cleanupCount: typeof record.cleanupCount === 'number' ? record.cleanupCount : 0,
    recoveryCount: typeof record.recoveryCount === 'number' ? record.recoveryCount : 0,
    lastPhase:
      phase === 'healthy' || phase === 'armed' || phase === 'failed-once' || phase === 'recovered'
        ? phase
        : 'healthy',
    lastHealthyAt: typeof record.lastHealthyAt === 'string' ? record.lastHealthyAt : null,
    lastCleanupAt: typeof record.lastCleanupAt === 'string' ? record.lastCleanupAt : null,
    lastFailureAt: typeof record.lastFailureAt === 'string' ? record.lastFailureAt : null,
    lastFailureMessage: typeof record.lastFailureMessage === 'string' ? record.lastFailureMessage : null,
  };
}

export default class FailureReloadDemoPlugin extends Plugin {
  private state: FailureReloadDemoState = createDefaultState();
  private statusBarItem: StatusBarItem | null = null;
  private cleanupRecorded = false;

  public override async onload(): Promise<void> {
    this.state = normalizeState(await this.loadData<FailureReloadDemoState>());

    if (this.state.armedFailure) {
      await this.triggerArmedFailure();
      return;
    }

    const recovered = this.state.lastPhase === 'failed-once';
    this.state = {
      ...this.state,
      armedFailure: false,
      loadCount: this.state.loadCount + 1,
      recoveryCount: recovered ? this.state.recoveryCount + 1 : this.state.recoveryCount,
      lastHealthyAt: this.formatDateTime(new Date()),
      lastPhase: recovered ? 'recovered' : 'healthy',
    };

    await this.persistState();
    this.registerUi();
    this.updateStatusBar();
  }

  public override async onEnable(): Promise<void> {
    return undefined;
  }

  public override async onDisable(): Promise<void> {
    await this.recordCleanup();
  }

  public override onunload(): void {
    return undefined;
  }

  public override onFailed(failure: PluginFailureContext): void {
    new Notice(`${DEMO_TITLE}：${failure.error.message}`, 2600);
  }

  private registerUi(): void {
    this.addRibbonIcon(
      'beaker',
      DEMO_TITLE,
      () => {
        void this.openReportFile();
      },
      { location: 'activityBar' },
    );

    const statusBarItem = this.addStatusBarItem() as StatusBarItem;
    this.statusBarItem = statusBarItem;
    statusBarItem.title = DEMO_TITLE;
    statusBarItem.addEventListener('click', () => {
      void this.openReportFile();
    });
    statusBarItem.show();

    this.addCommand({
      id: OPEN_REPORT_COMMAND_ID,
      name: '故障重载实验室：打开状态报告',
      callback: async () => {
        await this.openReportFile();
      },
    });

    this.addCommand({
      id: ARM_FAILURE_COMMAND_ID,
      name: '故障重载实验室：下次重载触发一次故障',
      callback: async () => {
        await this.armFailureForNextReload();
      },
    });

    this.addCommand({
      id: RESET_STATE_COMMAND_ID,
      name: '故障重载实验室：重置实验状态',
      callback: async () => {
        await this.resetState();
      },
    });
  }

  private async armFailureForNextReload(): Promise<void> {
    this.state = {
      ...this.state,
      armedFailure: true,
      lastPhase: 'armed',
      lastFailureMessage: null,
    };
    await this.persistState();
    this.updateStatusBar();
    await this.openReportFile();
  }

  private async resetState(): Promise<void> {
    const preservedLoadCount = this.state.loadCount;
    const preservedCleanupCount = this.state.cleanupCount;
    const preservedRecoveryCount = this.state.recoveryCount;

    this.state = {
      ...createDefaultState(),
      loadCount: preservedLoadCount,
      cleanupCount: preservedCleanupCount,
      recoveryCount: preservedRecoveryCount,
      lastPhase: 'healthy',
    };
    await this.persistState();
    this.updateStatusBar();
    await this.openReportFile();
  }

  private async triggerArmedFailure(): Promise<void> {
    const failureMessage = '故障注入模式已触发：本次重载将故意失败。再次执行“重新加载插件”后应自动恢复。';
    this.state = {
      ...this.state,
      armedFailure: false,
      lastPhase: 'failed-once',
      lastFailureAt: this.formatDateTime(new Date()),
      lastFailureMessage: failureMessage,
    };
    await this.persistState();
    throw new Error(failureMessage);
  }

  private updateStatusBar(): void {
    if (this.statusBarItem === null) {
      return;
    }

    this.statusBarItem.setText(this.getStatusText());
  }

  private getStatusText(): string {
    if (this.state.armedFailure) {
      return '故障实验：已布防';
    }

    if (this.state.lastPhase === 'recovered') {
      return '故障实验：已恢复';
    }

    return '故障实验：正常';
  }

  private async recordCleanup(): Promise<void> {
    if (this.cleanupRecorded) {
      return;
    }

    this.cleanupRecorded = true;
    this.state = {
      ...this.state,
      cleanupCount: this.state.cleanupCount + 1,
      lastCleanupAt: this.formatDateTime(new Date()),
    };
    await this.persistState();
  }

  private async persistState(): Promise<void> {
    await this.saveData(this.state);
    await this.ensureReportFile();
  }

  private async ensureReportFile(): Promise<TFile> {
    await this.app.vault.createFolder(REPORT_FOLDER_PATH).catch(() => undefined);
    const content = this.buildReportContent();
    const existing = this.app.vault.getFileByPath(REPORT_FILE_PATH);

    if (existing !== null) {
      await this.app.vault.modify(existing, content);
      return existing;
    }

    return this.app.vault.create(REPORT_FILE_PATH, content);
  }

  private async openReportFile(): Promise<void> {
    const file = await this.ensureReportFile();
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.openFile(file, { active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private buildReportContent(): string {
    const nextAction = this.state.armedFailure
      ? '下一次执行“重新加载插件”时会故意失败一次。'
      : (
          this.state.lastPhase === 'failed-once'
            ? '请再次执行“重新加载插件”，插件将自动恢复。'
            : '当前处于健康状态，可以点击活动栏入口打开本报告。'
        );

    return [
      '# Failure Reload Report',
      '',
      `currentPhase=${this.state.lastPhase}`,
      `armedFailure=${String(this.state.armedFailure)}`,
      `statusText=${this.getStatusText()}`,
      `loadCount=${String(this.state.loadCount)}`,
      `cleanupCount=${String(this.state.cleanupCount)}`,
      `recoveryCount=${String(this.state.recoveryCount)}`,
      `lastHealthyAt=${this.state.lastHealthyAt ?? '无'}`,
      `lastCleanupAt=${this.state.lastCleanupAt ?? '无'}`,
      `lastFailureAt=${this.state.lastFailureAt ?? '无'}`,
      `lastFailureMessage=${this.state.lastFailureMessage ?? '无'}`,
      `nextAction=${nextAction}`,
      '',
      '## Visible Checks',
      '- 活动栏入口：健康或恢复后应可见，失败后应消失',
      '- 状态栏文字：正常 / 已布防 / 已恢复 会跟着变化',
      '- 扩展页：失败后应显示未启用原因',
    ].join('\n');
  }

  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hour = `${date.getHours()}`.padStart(2, '0');
    const minute = `${date.getMinutes()}`.padStart(2, '0');
    const second = `${date.getSeconds()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }
}
