/**
 * Demo plugin entry used to verify plugin lifecycle hooks and component tree behavior.
 */

import { Component, Notice, Plugin, type PluginFailureContext } from '@note-studio/plugin';

const DEMO_TITLE = '生命周期基础演示';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-lifecycle-snapshot';
const REMOVE_CHILD_COMMAND_ID = 'remove-lifecycle-child';
const REATTACH_CHILD_COMMAND_ID = 'reattach-lifecycle-child';

interface LifecycleCounters {
  readonly childLoads: number;
  readonly childUnloads: number;
  readonly onDisable: number;
  readonly onEnable: number;
  readonly onload: number;
  readonly onunload: number;
}

function createInitialCounters(): LifecycleCounters {
  return {
    childLoads: 0,
    childUnloads: 0,
    onDisable: 0,
    onEnable: 0,
    onload: 0,
    onunload: 0,
  };
}

class LifecycleTraceComponent extends Component {
  public constructor(
    private readonly label: string,
    private readonly onTrace: (message: string) => void,
    private readonly onLoadChange: (loaded: boolean) => void,
  ) {
    super();
  }

  public onload(): void {
    this.onLoadChange(true);
    this.onTrace(`${this.label}.onload`);
  }

  public onunload(): void {
    this.onLoadChange(false);
    this.onTrace(`${this.label}.onunload`);
  }
}

export default class LifecycleBasicDemoPlugin extends Plugin {
  private counters: LifecycleCounters = createInitialCounters();
  private lifecycleChild: LifecycleTraceComponent | null = null;
  private readonly trace: string[] = [];

  public onload(): void {
    this.counters = {
      ...this.counters,
      onload: this.counters.onload + 1,
    };
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('beaker', '显示生命周期快照', () => {
      this.showSnapshotNotice();
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '生命周期演示：显示快照',
      callback: () => {
        this.showSnapshotNotice();
      },
    });

    this.addCommand({
      id: REMOVE_CHILD_COMMAND_ID,
      name: '生命周期演示：移除子组件',
      callback: () => {
        this.detachLifecycleChild();
      },
    });

    this.addCommand({
      id: REATTACH_CHILD_COMMAND_ID,
      name: '生命周期演示：重新挂载子组件',
      callback: () => {
        this.attachLifecycleChild();
      },
    });
  }

  public onEnable(): void {
    this.counters = {
      ...this.counters,
      onEnable: this.counters.onEnable + 1,
    };
    this.recordTrace('plugin.onEnable');
    this.attachLifecycleChild();
  }

  public onDisable(): void {
    this.counters = {
      ...this.counters,
      onDisable: this.counters.onDisable + 1,
    };
    this.recordTrace('plugin.onDisable');
  }

  public onunload(): void {
    this.counters = {
      ...this.counters,
      onunload: this.counters.onunload + 1,
    };
    this.recordTrace('plugin.onunload');
    this.lifecycleChild = null;
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}在 ${failure.operation} 阶段失败。`, 2500);
  }

  private attachLifecycleChild(): void {
    if (this.lifecycleChild !== null) {
      this.recordTrace('child.attach.skipped');
      new Notice('子组件已经处于挂载状态。', 1800);
      return;
    }

    const lifecycleChild = new LifecycleTraceComponent(
      'lifecycle-child',
      (message) => {
        this.recordTrace(message);
      },
      (loaded) => {
        this.counters = loaded
          ? {
              ...this.counters,
              childLoads: this.counters.childLoads + 1,
            }
          : {
              ...this.counters,
              childUnloads: this.counters.childUnloads + 1,
            };
      },
    );

    this.lifecycleChild = lifecycleChild;
    this.addChild(lifecycleChild);
    this.recordTrace('child.attach.requested');
    new Notice('已请求重新挂载子组件。', 1800);
  }

  private detachLifecycleChild(): void {
    if (this.lifecycleChild === null) {
      this.recordTrace('child.detach.skipped');
      new Notice('子组件当前已经是移除状态。', 1800);
      return;
    }

    const lifecycleChild = this.lifecycleChild;
    this.lifecycleChild = null;
    this.removeChild(lifecycleChild);
    this.recordTrace('child.detach.requested');
    new Notice('已请求移除子组件。', 1800);
  }

  private showSnapshotNotice(): void {
    new Notice(`生命周期快照：${this.createSnapshotMessage()}`, 3500);
  }

  private createSnapshotMessage(): string {
    const recentTrace = this.trace.slice(-4).join(' -> ');

    return [
      `load:${this.counters.onload}`,
      `enable:${this.counters.onEnable}`,
      `disable:${this.counters.onDisable}`,
      `unload:${this.counters.onunload}`,
      `childLoad:${this.counters.childLoads}`,
      `childUnload:${this.counters.childUnloads}`,
      `childAttached:${this.lifecycleChild === null ? 'no' : 'yes'}`,
      `recent:${recentTrace.length > 0 ? recentTrace : 'none'}`,
    ].join(' | ');
  }

  private recordTrace(message: string): void {
    const entry = `[demo-lifecycle-basic] ${message}`;
    this.trace.push(message);
    console.log(entry);
  }
}
