/**
 * Demo plugin entry used to verify command center, notice, and modal behavior.
 */

import {
  Modal,
  Notice,
  Plugin,
  type App,
  type PluginFailureContext,
} from '@note-studio/plugin';

const DEMO_TITLE = '命令、通知与模态框演示';
const SHOW_NOTICE_COMMAND_ID = 'show-command-notice-demo';
const OPEN_MODAL_COMMAND_ID = 'open-command-modal-demo';
const SHOW_SNAPSHOT_COMMAND_ID = 'show-command-modal-snapshot';

interface DemoCounters {
  readonly modalOpens: number;
  readonly notices: number;
}

function createInitialCounters(): DemoCounters {
  return {
    modalOpens: 0,
    notices: 0,
  };
}

class CommandDemoModal extends Modal {
  public constructor(
    app: App,
    private readonly sequence: number,
  ) {
    super(app);
    this.setTitle(`命令模态框 #${sequence}`);
    this.setContent(`这是第 ${sequence} 次通过命令中心打开模态框。`);
  }

  public override onOpen(): void {
    console.log(`[demo-command-notice-modal] modal.open#${this.sequence}`);
  }

  public override onClose(): void {
    console.log(`[demo-command-notice-modal] modal.close#${this.sequence}`);
  }
}

export default class CommandNoticeModalDemoPlugin extends Plugin {
  private counters: DemoCounters = createInitialCounters();

  public onload(): void {
    this.recordTrace('plugin.onload');

    this.addCommand({
      id: SHOW_NOTICE_COMMAND_ID,
      name: '命令演示：显示通知',
      callback: () => {
        this.showNoticeOnly();
      },
    });

    this.addCommand({
      id: OPEN_MODAL_COMMAND_ID,
      name: '命令演示：打开模态框',
      callback: () => {
        this.openDemoModal();
      },
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '命令演示：显示快照',
      callback: () => {
        this.showSnapshotNotice();
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace(this.createSnapshot('plugin.onDisable'));
  }

  public onunload(): void {
    this.recordTrace(this.createSnapshot('plugin.onunload'));
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}在 ${failure.operation} 阶段失败。`, 2500);
  }

  private showNoticeOnly(): void {
    this.counters = {
      ...this.counters,
      notices: this.counters.notices + 1,
    };
    this.recordTrace(`notice.show#${this.counters.notices}`);
    new Notice(`命令通知已触发，第 ${this.counters.notices} 次。`, 2200);
  }

  private openDemoModal(): void {
    this.counters = {
      modalOpens: this.counters.modalOpens + 1,
      notices: this.counters.notices + 1,
    };

    this.recordTrace(`modal.command#${this.counters.modalOpens}`);
    new Notice(`即将打开模态框，第 ${this.counters.modalOpens} 次。`, 2000);
    new CommandDemoModal(this.app, this.counters.modalOpens).open();
  }

  private showSnapshotNotice(): void {
    new Notice(`命令快照：${this.createSnapshot('snapshot')}`, 3000);
  }

  private createSnapshot(prefix: string): string {
    return `${prefix} notice=${this.counters.notices} modal=${this.counters.modalOpens}`;
  }

  private recordTrace(message: string): void {
    console.log(`[demo-command-notice-modal] ${message}`);
  }
}
