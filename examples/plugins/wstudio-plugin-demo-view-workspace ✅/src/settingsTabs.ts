import { PluginSettingTab } from '@note-studio/plugin';
import type DemoViewWorkspacePlugin from './main';

interface DemoViewWorkspaceSettingTabOptions {
  readonly title: string;
  readonly description: string;
  readonly verificationHint: string;
}

export class DemoViewWorkspaceSettingTab<TPlugin extends DemoViewWorkspacePlugin>
  extends PluginSettingTab<TPlugin> {
  public constructor(
    app: TPlugin['app'],
    plugin: TPlugin,
    _options: DemoViewWorkspaceSettingTabOptions,
  ) {
    super(app, plugin);
  }

  public display(): void {
    return undefined;
  }
}
