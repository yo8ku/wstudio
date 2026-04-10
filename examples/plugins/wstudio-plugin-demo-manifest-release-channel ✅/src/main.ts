/**
 * Demo plugin entry used to verify manifest releaseChannel behavior in extension UIs.
 */

import { Notice, Plugin, type PluginFailureContext } from '@note-studio/plugin';

const DEMO_TITLE = 'Manifest 渠道演示';
const SHOW_GUIDE_COMMAND_ID = 'manifest-release-channel-show-guide';

export default class ManifestReleaseChannelDemoPlugin extends Plugin {
  public onload(): void {
    this.recordTrace('plugin.onload');

    this.addRibbonIcon('beaker', '显示渠道测试说明', () => {
      this.showGuide();
    }, { location: 'activityBar' });

    this.addCommand({
      id: SHOW_GUIDE_COMMAND_ID,
      name: '渠道演示：显示当前测试说明',
      callback: () => {
        this.showGuide();
      },
    });
  }

  public onEnable(): void {
    this.recordTrace('plugin.onEnable');
  }

  public onDisable(): void {
    this.recordTrace('plugin.onDisable');
  }

  public onunload(): void {
    this.recordTrace('plugin.onunload');
  }

  public onFailed(failure: PluginFailureContext): void {
    this.recordTrace(`plugin.onFailed:${failure.operation}`);
    new Notice(`${DEMO_TITLE}在 ${failure.operation} 阶段失败。`, 2500);
  }

  private showGuide(): void {
    this.recordTrace('guide.notice');
    new Notice('请打开扩展 UI，确认当前插件标签显示为“测试插件”或“正式插件”。', 3200);
  }

  private recordTrace(message: string): void {
    console.log(`[demo-manifest-release-channel] ${message}`);
  }
}
