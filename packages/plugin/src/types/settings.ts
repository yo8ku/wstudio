/**
 * Settings tab registration contract.
 */

import type { Disposable } from './disposable';
import type { SettingTab } from '../core/SettingTab';

export interface SettingsRegistry {
  registerSettingTab(pluginId: string, settingTab: SettingTab): Disposable;
}
