/**
 * 主题命令提供者
 * 
 * 功能：
 * - 为命令中心提供主题相关命令
 * - 注册主题切换、预览等功能
 * - 支持主题分类显示
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command, CommandItem } from './CommandTypes';
import type { ITheme } from '../types/electron';

export class ThemeCommandProvider {
  private commandCenter: VSCodeCommandCenter;
  private allThemes: ITheme[] = [];
  private currentTheme: ITheme | null = null;
  private isInitialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  private originalThemeBeforePreview: ITheme | null = null; // 保存预览前的原始主题

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    // 立即开始初始化，但不阻塞构造函数
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    console.log('[ThemeCommandProvider] 开始初始化...');
    try {
      await this.loadThemes();
      this.registerThemeCommands();
      this.isInitialized = true;
      console.log('[ThemeCommandProvider] 初始化完成');
    } catch (error) {
      console.error('[ThemeCommandProvider] 初始化失败:', error);
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
   * 加载所有主题
   */
  private async loadThemes(): Promise<void> {
    try {
      const response = await window.electronAPI?.theme.list();
      if (response?.success && response.data) {
        this.allThemes = response.data;
        console.log(`[ThemeCommandProvider] 成功加载 ${this.allThemes.length} 个主题`);
        
        // 统计各类型主题数量
        const darkCount = this.allThemes.filter(t => t.type === 'dark').length;
        const lightCount = this.allThemes.filter(t => t.type === 'light').length;
        const hcCount = this.allThemes.filter(t => t.type === 'hc').length;
        console.log(`[ThemeCommandProvider] 深色: ${darkCount}, 浅色: ${lightCount}, 高对比度: ${hcCount}`);
      }

      const currentResponse = await window.electronAPI?.theme.getCurrent();
      if (currentResponse?.success && currentResponse.data) {
        this.currentTheme = currentResponse.data;
        console.log(`[ThemeCommandProvider] 当前主题: ${this.currentTheme.name}`);
      }
    } catch (error) {
      console.error('[ThemeCommandProvider] Failed to load themes:', error);
      this.allThemes = [];
    }
  }

  /**
   * 注册主题相关命令
   */
  private registerThemeCommands(): void {
    const commands: Command[] = [];

    // ============ 核心主题命令 ============

    // 首选项: 配色主题
    commands.push({
      id: 'workbench.action.selectTheme',
      label: '首选项: 配色主题',
      displayId: 'Preferences: Color Theme',
      description: '选择配色主题',
      category: '首选项',
      icon: '🎨',
      keybinding: 'Ctrl+K Ctrl+T',
      execute: async () => {
        await this.showThemeQuickPick();
      }
    });

    // 注意：不再将每个主题注册为独立命令
    // 主题选择通过 "首选项: 配色主题" 命令打开专用的主题选择模式

    // 批量注册核心命令
    this.commandCenter.registerCommands(commands);

    console.log(`[ThemeCommandProvider] 已注册 ${commands.length} 个核心主题命令，主题总数: ${this.allThemes.length}`);
  }

  /**
   * 显示主题快速选择
   */
  private async showThemeQuickPick(): Promise<void> {
    // 确保初始化完成
    await this.ensureInitialized();
    
    // ⭐ 保存当前主题（用于取消时恢复）
    this.originalThemeBeforePreview = this.currentTheme;
    console.log('[ThemeCommandProvider] 保存原始主题:', this.originalThemeBeforePreview?.name);
    
    // 创建自定义模式用于主题选择
    this.commandCenter.registerMode({
      prefix: 'theme:',
      name: 'Select Color Theme',
      placeholder: '选择配色主题...',
      icon: '🎨',
      provider: async (query: string) => {
        // 每次查询时确保数据已加载
        await this.ensureInitialized();
        return this.getThemeItems(query);
      },
      onCancel: async () => {
        // ⭐ 取消时恢复原始主题
        if (this.originalThemeBeforePreview) {
          console.log('[ThemeCommandProvider] 取消预览，恢复主题:', this.originalThemeBeforePreview.name);
          await window.electronAPI?.theme.apply(this.originalThemeBeforePreview.id);
        }
        this.originalThemeBeforePreview = null;
      }
    });

    // 显示命令中心并切换到主题模式
    await this.commandCenter.show('theme:');
  }

  /**
   * 获取主题列表项
   */
  private async getThemeItems(query: string): Promise<CommandItem[]> {
    const items: CommandItem[] = [];
    const lowerQuery = query.toLowerCase();

    // 按类型分组
    const groups = [
      { type: 'dark', label: '深色主题', icon: '🌙' },
      { type: 'light', label: '浅色主题', icon: '☀️' },
      { type: 'hc', label: '高对比度主题', icon: '⚡' }
    ];

    for (const group of groups) {
      // 过滤并排序该组的主题
      const themes = this.allThemes
        .filter(t => t.type === group.type)
        .sort((a, b) => a.name.localeCompare(b.name));
      
      if (themes.length === 0) continue;

      // 添加分组标题（仅在有搜索结果时）
      let hasMatchInGroup = false;
      const groupThemes: CommandItem[] = [];

      for (const theme of themes) {
        const matchName = theme.name.toLowerCase().includes(lowerQuery);
        
        if (!query || matchName) {
          hasMatchInGroup = true;
          const isCurrent = this.currentTheme?.id === theme.id;
          
          groupThemes.push({
            id: theme.id,
            label: theme.name,
            // 不显示 detail，改用特殊 class 标记当前主题
            icon: isCurrent ? '✓' : undefined,
            category: group.label,
            alwaysShow: isCurrent, // 标记为当前主题，用于渲染时应用特殊样式
            onPreview: async () => {
              // 预览主题（不关闭命令面板）
              await window.electronAPI?.theme.apply(theme.id);
            },
            value: {
              execute: async () => {
                // ⭐ 确认应用主题（关闭命令面板）
                console.log('[ThemeCommandProvider] 确认应用主题:', theme.name);
                await window.electronAPI?.theme.apply(theme.id);
                // 清除原始主题记录（表示用户已确认）
                this.originalThemeBeforePreview = null;
              }
            }
          });
        }
      }

      // 如果该组有匹配项，添加分组和主题
      if (hasMatchInGroup && groupThemes.length > 0) {
        // 不是第一组时，添加分隔线，右侧显示分组名称
        if (items.length > 0) {
          items.push({
            id: `__separator_${group.type}__`,
            label: group.label, // 在分隔线右侧显示分组名称
            isSeparator: true,
            value: { execute: async () => {} }
          });
        }

        // 添加该组的所有主题
        items.push(...groupThemes);
      }
    }

    return items;
  }

  /**
   * 刷新主题列表
   */
  public async refresh(): Promise<void> {
    await this.loadThemes();
    this.registerThemeCommands();
  }
}
















