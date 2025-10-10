/**
 * 文件图标主题命令提供者
 * 
 * 功能：
 * - 为命令中心提供文件图标主题相关命令
 * - 注册图标主题切换、预览等功能
 * - 支持从扩展目录加载图标主题
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command, CommandItem } from './CommandTypes';

interface IconTheme {
  id: string;
  label: string;
  path: string;
  extensionId: string;
  extensionName?: string;
}

export class IconThemeCommandProvider {
  private commandCenter: VSCodeCommandCenter;
  private allIconThemes: IconTheme[] = [];
  private currentIconTheme: string | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    // 立即开始初始化，但不阻塞构造函数
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('[IconThemeCommandProvider] 开始初始化...');
    try {
      await this.loadIconThemes();
      this.registerIconThemeCommands();
      this.isInitialized = true;
      console.log('[IconThemeCommandProvider] 初始化完成');
    } catch (error) {
      console.error('[IconThemeCommandProvider] 初始化失败:', error);
      this.isInitialized = true; // 即使失败也标记为已初始化，避免阻塞
    }
  }

  /**
   * 确保初始化完成
   */
  public async ensureInitialized(): Promise<void> {
    if (!this.isInitialized && this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * 加载所有文件图标主题
   */
  private async loadIconThemes(): Promise<void> {
    try {
      // TODO: 实现从扩展系统加载图标主题
      // 目前先从 extensions 目录扫描
      const iconThemes: IconTheme[] = [];

      // Material Icon Theme
      iconThemes.push({
        id: 'material-icon-theme',
        label: 'Material Icon Theme',
        path: 'extensions/material-icon-theme/extension/dist/material-icons.json',
        extensionId: 'material-icon-theme',
        extensionName: 'Material Icon Theme'
      });

      // Ayu Icons
      iconThemes.push({
        id: 'ayu',
        label: 'Ayu',
        path: 'extensions/ayu/ayu-icons.json',
        extensionId: 'ayu',
        extensionName: 'Ayu'
      });

      this.allIconThemes = iconThemes;
      console.log(`[IconThemeCommandProvider] 成功加载 ${this.allIconThemes.length} 个文件图标主题`);

      // 加载当前图标主题设置
      // TODO: 从设置中读取当前图标主题
      this.currentIconTheme = 'material-icon-theme';
    } catch (error) {
      console.error('[IconThemeCommandProvider] Failed to load icon themes:', error);
      this.allIconThemes = [];
    }
  }

  /**
   * 注册文件图标主题相关命令
   */
  private registerIconThemeCommands(): void {
    const commands: Command[] = [];

    // ============ 核心文件图标主题命令 ============

    // 首选项: 文件图标主题
    commands.push({
      id: 'workbench.action.selectIconTheme',
      label: '首选项: 文件图标主题',
      displayId: 'Preferences: File Icon Theme',
      description: '选择文件图标主题',
      category: '首选项',
      icon: '📁',
      execute: async () => {
        await this.showIconThemeQuickPick();
      }
    });

    // 批量注册核心命令
    this.commandCenter.registerCommands(commands);

    console.log(`[IconThemeCommandProvider] 已注册 ${commands.length} 个核心文件图标主题命令，图标主题总数: ${this.allIconThemes.length}`);
  }

  /**
   * 显示文件图标主题快速选择
   */
  private async showIconThemeQuickPick(): Promise<void> {
    // 确保初始化完成
    await this.ensureInitialized();
    
    // 创建自定义模式用于图标主题选择
    this.commandCenter.registerMode({
      prefix: 'icontheme:',
      name: 'Select File Icon Theme',
      placeholder: '选择文件图标主题...',
      icon: '📁',
      provider: async (query: string) => {
        // 每次查询时确保数据已加载
        await this.ensureInitialized();
        return this.getIconThemeItems(query);
      }
    });

    // 显示命令中心并切换到图标主题模式
    await this.commandCenter.show('icontheme:');
  }

  /**
   * 获取文件图标主题列表项
   */
  private async getIconThemeItems(query: string): Promise<CommandItem[]> {
    const items: CommandItem[] = [];
    const lowerQuery = query.toLowerCase();

    // 添加 "默认图标" 选项
    const matchNone = !query || 'none'.includes(lowerQuery) || 'default'.includes(lowerQuery) || '默认'.includes(lowerQuery);
    if (matchNone) {
      const isNoneCurrent = this.currentIconTheme === null;
      items.push({
        id: '__none__',
        label: 'Default Icons',
        displayId: '', // 不显示 ID
        icon: isNoneCurrent ? '✓' : undefined,
        alwaysShow: isNoneCurrent,
        value: {
          execute: async () => {
            await this.applyIconTheme(null);
          }
        }
      });
    }

    // 不分组，直接显示所有主题
    for (const theme of this.allIconThemes) {
      const matchLabel = theme.label.toLowerCase().includes(lowerQuery);
      
      if (!query || matchLabel) {
        const isCurrent = this.currentIconTheme === theme.id;
        
        items.push({
          id: theme.id,
          label: theme.label,
          displayId: '', // 不显示 ID
          icon: isCurrent ? '✓' : undefined,
          alwaysShow: isCurrent,
          onPreview: async () => {
            // 预览图标主题（不关闭命令面板）
            await this.applyIconTheme(theme.id);
          },
          value: {
            execute: async () => {
              // 确认应用图标主题（关闭命令面板）
              await this.applyIconTheme(theme.id);
            }
          }
        });
      }
    }

    return items;
  }

  /**
   * 应用文件图标主题
   */
  private async applyIconTheme(themeId: string | null): Promise<void> {
    try {
      console.log(`[IconThemeCommandProvider] 应用文件图标主题: ${themeId || 'none'}`);
      
      this.currentIconTheme = themeId;
      
      // 通过全局事件通知 IconThemeContext 应用主题
      // IconThemeContext 会负责加载配置并更新全局状态
      const theme = this.allIconThemes.find(t => t.id === themeId);
      
      window.dispatchEvent(new CustomEvent('applyIconTheme', {
        detail: { 
          themeId, 
          themePath: theme?.path 
        }
      }));
      
      // 显示消息
      const themeName = themeId 
        ? this.allIconThemes.find(t => t.id === themeId)?.label || themeId
        : '无';
      console.log(`[IconThemeCommandProvider] ✓ 文件图标主题已切换到: ${themeName}`);
      
      // TODO: 保存到设置
      // await window.electronAPI.settings.set('workbench.iconTheme', themeId);
    } catch (error) {
      console.error('[IconThemeCommandProvider] 应用图标主题失败:', error);
    }
  }

  /**
   * 刷新图标主题列表
   */
  public async refresh(): Promise<void> {
    await this.loadIconThemes();
    this.registerIconThemeCommands();
  }
}

