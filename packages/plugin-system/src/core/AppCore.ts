/**
 * 插件系统 - 应用核心
 * 整合所有系统，提供统一的插件系统入口
 */

import { PluginManager } from './PluginManager';
import { EventSystem } from '../systems/EventSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { UISystem } from '../systems/UISystem';
import { StorageSystem } from '../systems/StorageSystem';

export class AppCore {
  private pluginManager: PluginManager;
  private eventSystem: EventSystem;
  private commandSystem: CommandSystem;
  private uiSystem: UISystem;
  private storageSystem: StorageSystem;

  constructor() {
    // 初始化各个系统
    this.eventSystem = new EventSystem();
    this.commandSystem = new CommandSystem();
    this.uiSystem = new UISystem();
    this.storageSystem = new StorageSystem();

    // 初始化插件管理器
    this.pluginManager = new PluginManager(
      this.eventSystem,
      this.commandSystem,
      this.uiSystem,
      this.storageSystem
    );
  }

  /**
   * 获取插件管理器
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * 获取事件系统
   */
  getEventSystem(): EventSystem {
    return this.eventSystem;
  }

  /**
   * 获取命令系统
   */
  getCommandSystem(): CommandSystem {
    return this.commandSystem;
  }

  /**
   * 获取UI系统
   */
  getUISystem(): UISystem {
    return this.uiSystem;
  }

  /**
   * 获取存储系统
   */
  getStorageSystem(): StorageSystem {
    return this.storageSystem;
  }

  /**
   * 初始化应用核心
   */
  async initialize(): Promise<void> {
    // TODO: 实现初始化逻辑
  }

  /**
   * 销毁应用核心
   */
  async dispose(): Promise<void> {
    // TODO: 实现销毁逻辑
  }
}

