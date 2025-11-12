/**
 * 插件系统 - API提供者
 * 为插件创建和提供API实例
 */

import { PluginAPI } from './PluginAPI';
import { PluginContext } from '../types/plugin';
import { EventSystem } from '../systems/EventSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { UISystem } from '../systems/UISystem';
import { StorageSystem } from '../systems/StorageSystem';

export class APIProvider {
  constructor(
    private eventSystem: EventSystem,
    private commandSystem: CommandSystem,
    private uiSystem: UISystem,
    private storageSystem: StorageSystem
  ) {}

  /**
   * 为插件创建API实例
   */
  createAPI(context: PluginContext): PluginAPI {
    // TODO: 实现API创建逻辑
    throw new Error('Method not implemented.');
  }

  /**
   * 销毁插件API实例
   */
  disposeAPI(pluginId: string): void {
    // TODO: 实现API销毁逻辑
    throw new Error('Method not implemented.');
  }
}

