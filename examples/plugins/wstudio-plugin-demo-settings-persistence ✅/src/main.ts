/**
 * Demo plugin entry used to verify settings tab registration and persisted plugin data.
 */

import {
  Notice,
  Plugin,
  type JsonObject,
  type JsonValue,
  type PluginFailureContext,
} from '@note-studio/plugin';
import { SettingsPersistenceDemoTab } from './settings';

const DEMO_TITLE = '设置持久化演示';
const TOGGLE_TEXT_COMMAND_ID = 'settings-persistence-cycle-text';
const TOGGLE_ENABLED_COMMAND_ID = 'settings-persistence-toggle-enabled';
const SHOW_SNAPSHOT_COMMAND_ID = 'settings-persistence-show-snapshot';
const RESET_DEFAULTS_COMMAND_ID = 'settings-persistence-reset-defaults';

const MESSAGE_VARIANTS = [
  '默认欢迎语',
  '第二条持久化配置',
  '第三条持久化配置',
] as const;

export interface SettingsPersistenceDemoData extends JsonObject {
  readonly enabled: boolean;
  readonly message: string;
}

function createDefaultSettings(): SettingsPersistenceDemoData {
  return {
    enabled: true,
    message: MESSAGE_VARIANTS[0],
  };
}

function normalizeSettings(candidate: JsonValue | null): SettingsPersistenceDemoData {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createDefaultSettings();
  }

  const record = candidate as {
    readonly enabled?: JsonValue;
    readonly message?: JsonValue;
  };

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    message:
      typeof record.message === 'string' && record.message.trim().length > 0
        ? record.message.trim()
        : MESSAGE_VARIANTS[0],
  };
}

function getNextMessage(current: string): string {
  const index = MESSAGE_VARIANTS.indexOf(
    current as (typeof MESSAGE_VARIANTS)[number],
  );

  if (index === -1) {
    return MESSAGE_VARIANTS[0];
  }

  return MESSAGE_VARIANTS[(index + 1) % MESSAGE_VARIANTS.length];
}

export default class SettingsPersistenceDemoPlugin extends Plugin {
  public settings: SettingsPersistenceDemoData = createDefaultSettings();

  public async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData<SettingsPersistenceDemoData>());
    this.recordTrace(`plugin.onload ${this.createSnapshot()}`);

    this.addSettingTab(new SettingsPersistenceDemoTab<this>(this.app, this));

    this.addCommand({
      id: TOGGLE_TEXT_COMMAND_ID,
      name: '设置演示：切换文本',
      callback: async () => {
        await this.cycleMessage();
      },
    });

    this.addCommand({
      id: TOGGLE_ENABLED_COMMAND_ID,
      name: '设置演示：切换开关',
      callback: async () => {
        await this.toggleEnabled();
      },
    });

    this.addCommand({
      id: SHOW_SNAPSHOT_COMMAND_ID,
      name: '设置演示：显示快照',
      callback: () => {
        this.showSnapshotNotice();
      },
    });

    this.addCommand({
      id: RESET_DEFAULTS_COMMAND_ID,
      name: '设置演示：重置默认值',
      callback: async () => {
        await this.resetDefaults();
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace(`plugin.onDisable ${this.createSnapshot()}`);
  }

  public onunload(): void {
    this.recordTrace(`plugin.onunload ${this.createSnapshot()}`);
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}在 ${failure.operation} 阶段失败。`, 2500);
  }

  public getSettingsSummary(): string {
    return `文本：${this.settings.message}；开关：${this.settings.enabled ? '开启' : '关闭'}`;
  }

  private async cycleMessage(): Promise<void> {
    this.settings = {
      ...this.settings,
      message: getNextMessage(this.settings.message),
    };
    await this.persistSettings('文本已切换');
  }

  private async toggleEnabled(): Promise<void> {
    this.settings = {
      ...this.settings,
      enabled: !this.settings.enabled,
    };
    await this.persistSettings('开关状态已切换');
  }

  private async resetDefaults(): Promise<void> {
    this.settings = createDefaultSettings();
    await this.persistSettings('已恢复默认设置');
  }

  private async persistSettings(prefix: string): Promise<void> {
    await this.saveData(this.settings);
    this.recordTrace(`settings.saved ${this.createSnapshot()}`);
    new Notice(`${prefix}：${this.getSettingsSummary()}`, 2500);
  }

  private showSnapshotNotice(): void {
    new Notice(`设置快照：${this.getSettingsSummary()}`, 3000);
  }

  private createSnapshot(): string {
    return `message="${this.settings.message}" enabled=${this.settings.enabled}`;
  }

  private recordTrace(message: string): void {
    console.log(`[demo-settings-persistence] ${message}`);
  }
}
