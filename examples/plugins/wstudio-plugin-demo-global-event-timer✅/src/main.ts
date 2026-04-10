/**
 * Demo plugin entry used to verify global DOM events and interval cleanup behavior.
 */

import { Notice, Plugin, type PluginFailureContext } from '@note-studio/plugin';

const DEMO_TITLE = '全局事件与定时器演示';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-global-event-timer-snapshot';
const RESET_COUNTERS_COMMAND_ID = 'reset-global-event-timer-counters';
const INTERVAL_MS = 3000;

interface DemoCounters {
  readonly clicks: number;
  readonly intervals: number;
}

function createInitialCounters(): DemoCounters {
  return {
    clicks: 0,
    intervals: 0,
  };
}

function createSessionId(): string {
  const timestamp = Date.now().toString(36);
  return `session-${timestamp}`;
}

export default class GlobalEventTimerDemoPlugin extends Plugin {
  private counters: DemoCounters = createInitialCounters();
  private readonly sessionId = createSessionId();
  private readonly trace: string[] = [];

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('clock', '显示全局事件与定时器快照', () => {
      this.showSnapshotNotice();
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '全局事件与定时器演示：显示快照',
      callback: () => {
        this.showSnapshotNotice();
      },
    });

    this.addCommand({
      id: RESET_COUNTERS_COMMAND_ID,
      name: '全局事件与定时器演示：重置计数',
      callback: () => {
        this.resetCounters();
      },
    });

    this.registerDomEvent(document, 'click', () => {
      this.counters = {
        ...this.counters,
        clicks: this.counters.clicks + 1,
      };
      this.recordTrace(`click#${this.counters.clicks}`);
    });

    this.registerInterval(
      setInterval(() => {
        this.counters = {
          ...this.counters,
          intervals: this.counters.intervals + 1,
        };
        this.recordTrace(`interval#${this.counters.intervals}`);
      }, INTERVAL_MS),
    );

    new Notice(`已注册全局点击监听与定时器。当前会话：${this.sessionId}`, 2200);
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace(`plugin.onDisable clicks=${this.counters.clicks} intervals=${this.counters.intervals}`);
  }

  public onunload(): void {
    this.recordTrace(`plugin.onunload clicks=${this.counters.clicks} intervals=${this.counters.intervals}`);
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}在 ${failure.operation} 阶段失败。`, 2500);
  }

  private showSnapshotNotice(): void {
    new Notice(`全局事件快照：${this.createSnapshotMessage()}`, 3500);
  }

  private resetCounters(): void {
    this.counters = createInitialCounters();
    this.recordTrace('counters.reset');
    new Notice('点击计数与定时器计数已重置。', 1800);
  }

  private createSnapshotMessage(): string {
    const recentTrace = this.trace.slice(-4).join(' -> ');

    return [
      `session:${this.sessionId}`,
      `click:${this.counters.clicks}`,
      `interval:${this.counters.intervals}`,
      `recent:${recentTrace.length > 0 ? recentTrace : 'none'}`,
    ].join(' | ');
  }

  private recordTrace(message: string): void {
    const entry = `[demo-global-event-timer][${this.sessionId}] ${message}`;
    this.trace.push(message);
    console.log(entry);
  }
}
