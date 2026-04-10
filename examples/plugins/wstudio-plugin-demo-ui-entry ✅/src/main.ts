/**
 * Demo plugin entry used to verify plugin UI entry positions in activity bar, title bar, and status bar.
 */

import { Notice, Plugin, type PluginFailureContext, type StatusBarItem } from '@note-studio/plugin';

const DEMO_TITLE = '界面入口演示';
const ACTIVITY_BAR_TITLE = '界面入口演示：活动栏入口';
const TITLE_BAR_TITLE = '界面入口演示：标题栏入口';
const STATUS_BAR_TITLE = '界面入口演示：状态栏入口';

interface EntryCounters {
  readonly activityBar: number;
  readonly statusBar: number;
  readonly titleBar: number;
}

function createInitialCounters(): EntryCounters {
  return {
    activityBar: 0,
    statusBar: 0,
    titleBar: 0,
  };
}

type EntrySource = keyof EntryCounters;
type DemoStatusBarItem = HTMLElement & Pick<StatusBarItem, 'setText'>;

export default class UiEntryDemoPlugin extends Plugin {
  private counters: EntryCounters = createInitialCounters();
  private statusBarItem: DemoStatusBarItem | null = null;

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('beaker', ACTIVITY_BAR_TITLE, () => {
      this.handleEntryClick('activityBar');
    });

    this.addRibbonIcon(
      'sparkle',
      TITLE_BAR_TITLE,
      () => {
        this.handleEntryClick('titleBar');
      },
      { location: 'titleBar' },
    );

    const statusBarItem = this.addStatusBarItem() as DemoStatusBarItem;
    this.statusBarItem = statusBarItem;
    statusBarItem.setText(this.createStatusBarText());
    statusBarItem.title = STATUS_BAR_TITLE;
    this.registerDomEvent(statusBarItem, 'click', () => {
      this.handleEntryClick('statusBar');
    });

    new Notice('已注册活动栏、标题栏和状态栏入口。', 2200);
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace(this.createSnapshot('plugin.onDisable'));
  }

  public onunload(): void {
    this.recordTrace(this.createSnapshot('plugin.onunload'));
    this.statusBarItem = null;
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE} 在 ${failure.operation} 阶段失败。`, 2500);
  }

  private handleEntryClick(source: EntrySource): void {
    this.counters = {
      ...this.counters,
      [source]: this.counters[source] + 1,
    };
    this.syncStatusBarText();

    const sourceLabel = this.getSourceLabel(source);
    this.recordTrace(`${source}.click#${this.counters[source]}`);
    new Notice(`${sourceLabel}已点击：${this.createStatusBarText()}`, 2200);
  }

  private syncStatusBarText(): void {
    if (this.statusBarItem === null) {
      return;
    }

    this.statusBarItem.setText(this.createStatusBarText());
  }

  private createStatusBarText(): string {
    return `入口演示 A:${this.counters.activityBar} T:${this.counters.titleBar} S:${this.counters.statusBar}`;
  }

  private getSourceLabel(source: EntrySource): string {
    if (source === 'activityBar') {
      return '活动栏入口';
    }

    if (source === 'titleBar') {
      return '标题栏入口';
    }

    return '状态栏入口';
  }

  private createSnapshot(prefix: string): string {
    return `${prefix} ${this.createStatusBarText()}`;
  }

  private recordTrace(message: string): void {
    console.log(`[demo-ui-entry] ${message}`);
  }
}
