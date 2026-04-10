/**
 * Settings tab for the settings persistence demo plugin.
 */

import {
  PluginSettingTab,
  Setting,
  type TextComponent,
  type ToggleComponent,
} from '@note-studio/plugin';
import type SettingsPersistenceDemoPlugin from './main';

export class SettingsPersistenceDemoTab<TPlugin extends SettingsPersistenceDemoPlugin>
  extends PluginSettingTab<TPlugin> {
  public display(): void {
    this.containerEl.replaceChildren();

    const titleEl = document.createElement('h2');
    titleEl.textContent = '设置持久化演示';
    this.containerEl.append(titleEl);

    new Setting(this.containerEl)
      .setName('当前文本设置')
      .setDesc(`当前值：${this.plugin.settings.message}`)
      .addText((text: TextComponent) => {
        text
          .setValue(this.plugin.settings.message)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('当前开关设置')
      .setDesc(`当前状态：${this.plugin.settings.enabled ? '开启' : '关闭'}`)
      .addToggle((toggle: ToggleComponent) => {
        toggle
          .setValue(this.plugin.settings.enabled)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('如何修改')
      .setDesc('当前宿主设置页显示的是插件设置摘要。请通过命令中心执行“设置演示：切换文本 / 切换开关”，再回到这里确认回读结果。');
  }
}
