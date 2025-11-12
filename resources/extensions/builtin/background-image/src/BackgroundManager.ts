/**
 * 背景图片管理器
 * 负责管理背景图片的设置、更新和移除（仅配置管理，DOM 操作在渲染进程）
 */

import type { PluginAPI } from './plugin-api';
import type { BackgroundImageConfig } from './types';
import { DEFAULT_CONFIG } from './types';

export class BackgroundManager {
  private config: BackgroundImageConfig;
  private api: PluginAPI;

  constructor(api: PluginAPI) {
    this.api = api;
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 初始化背景管理器
   */
  async initialize(): Promise<void> {
    // 从 settings.json 加载配置
    await this.loadConfig();
    
    // 通知渲染进程应用背景
    if (this.config.enabled && this.config.imagePath) {
      this.notifyRenderer();
    }
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    try {
      
      // 优先从 settings.json 读取配置
      const settingsConfig = await this.api.settings.get<BackgroundImageConfig>('background-image');
      
      if (settingsConfig) {
        this.config = { ...DEFAULT_CONFIG, ...settingsConfig };
        return;
      }
      
      
      // 向后兼容：从旧的插件存储读取
      const storageConfig = await this.api.storage.get<BackgroundImageConfig>('backgroundImageConfig');
      
      if (storageConfig) {
        this.config = { ...DEFAULT_CONFIG, ...storageConfig };
        // 迁移到 settings.json
        await this.api.settings.update('background-image', this.config);
      } else {
      }
    } catch (error) {
    }
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    try {
      // 1. 保存到 settings.json
      await this.api.settings.update('background-image', this.config);
      console.log('[BackgroundManager] 配置已保存到 settings.json');
      
      // 2. 通知渲染进程应用背景
      this.notifyRenderer();
    } catch (error) {
      console.error('[BackgroundManager] 保存配置失败:', error);
    }
  }

  /**
   * 通知渲染进程更新背景
   */
  notifyRenderer(): void {
    // 转换配置，将文件路径转换为 local-file:// 协议
    const configForRenderer = {
      ...this.config,
      imagePath: this.config.imagePath ? this.convertToLocalFileUrl(this.config.imagePath) : ''
    };
    
    
    // 通过 events API 发送事件到渲染进程
    this.api.events.emit('background-image:config-updated', configForRenderer);
  }

  /**
   * 将文件系统路径转换为 local-file:// 协议 URL
   */
  private convertToLocalFileUrl(filePath: string): string {
    // 规范化路径（转换为正斜杠）
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    // Windows 路径格式: local-file://D:/path/to/file.png
    // Unix 路径格式: local-file:///path/to/file.png
    if (normalizedPath.match(/^[a-zA-Z]:/)) {
      // Windows 绝对路径
      // 分离盘符和路径
      const driveLetter = normalizedPath.substring(0, 2); // 例如 "D:"
      const pathWithoutDrive = normalizedPath.substring(2); // 例如 "/壁纸/..."
      
      // 对路径部分进行编码（保留斜杠）
      const encodedParts = pathWithoutDrive.split('/').map(part => encodeURIComponent(part));
      const encodedPath = encodedParts.join('/');
      
      return `local-file://${driveLetter}${encodedPath}`;
    } else {
      // Unix 绝对路径
      const encodedParts = normalizedPath.split('/').map(part => encodeURIComponent(part));
      const encodedPath = encodedParts.join('/');
      return `local-file://${encodedPath}`;
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): BackgroundImageConfig {
    return { ...this.config };
  }

  /**
   * 设置背景图片
   */
  async setBackgroundImage(imagePath: string): Promise<void> {
    this.config.imagePath = imagePath;
    this.config.enabled = true;
    await this.saveConfig();
  }

  /**
   * 移除背景图片
   */
  async removeBackgroundImage(): Promise<void> {
    this.config.enabled = false;
    this.config.imagePath = '';
    await this.saveConfig();
  }

  /**
   * 更新配置
   */
  async updateConfig(partialConfig: Partial<BackgroundImageConfig>): Promise<void> {
    this.config = { ...this.config, ...partialConfig };
    await this.saveConfig();
  }

  /**
   * 启用背景
   */
  async enable(): Promise<void> {
    if (!this.config.imagePath) {
      throw new Error('No background image set');
    }
    this.config.enabled = true;
    await this.saveConfig();
  }

  /**
   * 禁用背景
   */
  async disable(): Promise<void> {
    this.config.enabled = false;
    await this.saveConfig();
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理资源
    console.log('[BackgroundManager] Disposed');
  }
}
