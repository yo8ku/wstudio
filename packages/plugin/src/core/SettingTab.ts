/**
 * Base settings tab contracts for plugin-configurable application settings.
 */

import { SETTING_TAB_INTERNAL_ATTACH } from '../internal/runtime';
import type { App } from '../types/app';
import type { Plugin } from './Plugin';

export abstract class SettingTab {
  public readonly app: App;

  public constructor(app: App) {
    this.app = app;
  }

  public [SETTING_TAB_INTERNAL_ATTACH](_containerEl: HTMLElement): void {
    return undefined;
  }

  public abstract display(): Promise<void> | void;

  public hide(): Promise<void> | void {
    return undefined;
  }
}

export abstract class PluginSettingTab<TPlugin extends Plugin = Plugin> extends SettingTab {
  public readonly plugin: TPlugin;

  public constructor(app: App, plugin: TPlugin) {
    super(app);
    this.plugin = plugin;
  }
}
