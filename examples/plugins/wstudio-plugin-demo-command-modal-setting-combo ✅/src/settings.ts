import {
  PluginSettingTab,
  Setting,
  type TextComponent,
  type ToggleComponent,
} from '@note-studio/plugin';
import type CommandModalSettingComboDemoPlugin from './main';

export class CommandModalSettingComboDemoTab<TPlugin extends CommandModalSettingComboDemoPlugin>
  extends PluginSettingTab<TPlugin> {
  public display(): void {
    this.containerEl.replaceChildren();

    const titleEl = document.createElement('h2');
    titleEl.textContent = '笔记整理助手演示';
    this.containerEl.append(titleEl);

    new Setting(this.containerEl)
      .setName('当前标题前缀')
      .setDesc(`当前值：${this.plugin.settings.titlePrefix}`)
      .addText((text: TextComponent) => {
        text
          .setValue(this.plugin.settings.titlePrefix)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('当前默认标签')
      .setDesc(`当前值：${this.plugin.settings.defaultTag}`)
      .addText((text: TextComponent) => {
        text
          .setValue(this.plugin.settings.defaultTag)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('是否包含行动项')
      .setDesc(`当前状态：${this.plugin.settings.includeActionItems ? '开启' : '关闭'}`)
      .addToggle((toggle: ToggleComponent) => {
        toggle
          .setValue(this.plugin.settings.includeActionItems)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('最近一次插入结果')
      .setDesc(this.plugin.lastInsertedPreview === null ? '暂无插入记录。' : this.plugin.lastInsertedPreview)
      .addText((text: TextComponent) => {
        text
          .setValue(this.plugin.lastInsertedTitle)
          .setDisabled(true);
      });

    new Setting(this.containerEl)
      .setName('如何修改')
      .setDesc('当前宿主设置页显示的是插件设置摘要。请通过命令中心执行“整理助手演示：切换标题前缀 / 切换默认标签 / 切换行动项开关”，再回到这里确认结果。');
  }
}
