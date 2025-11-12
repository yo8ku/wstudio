/**
 * 颜色主题命令提供器
 * 功能：
 * - 为命令中心提供颜色主题相关命令
 * - 注册主题切换、预览、导入、删除等功能
 * - 支持主题搜索和分类显示
 */

import type { VSCodeCommandCenter } from './VSCodeCommandCenter';
import type { Command, CommandItem } from './CommandTypes';
import { useThemeStore } from '../stores/themeStore';
import type { ThemeInfo } from '@note-studio/shared';
import { THEME_CHANNELS } from '@note-studio/shared';

export class ThemeCommandProvider {
  private commandCenter: VSCodeCommandCenter;
  private previewThemeId: string | null = null;
  private originalThemeId: string | null = null;

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerThemeCommands();
  }

  /**
   * 注册颜色主题相关命令
   */
  private registerThemeCommands(): void {
    const commands: Command[] = [];

    // ============ 核心主题命令 ============

    // 首选项: 颜色主题
    commands.push({
      id: 'workbench.action.selectTheme',
      label: '首选项: 颜色主题',
      displayId: 'Preferences: Color Theme',
      description: '选择颜色主题',
      category: '首选项',
      icon: 'palette',
      execute: async () => {
        await this.showThemeQuickPick();
      }
    });

    // 创建自定义主题
    commands.push({
      id: 'workbench.action.createCustomTheme',
      label: '首选项: 创建自定义主题',
      displayId: '', // 不显示ID
      description: '创建一个新的自定义主题配置文件',
      category: '首选项',
      icon: 'palette',
      execute: async () => {
        await this.createCustomTheme();
      }
    });

    // 批量注册命令
    this.commandCenter.registerCommands(commands);

    console.log(`[ThemeCommandProvider] 已注册 ${commands.length} 个颜色主题命令`);
  }

  /**
   * 显示主题快速选择
   */
  private async showThemeQuickPick(): Promise<void> {
    // 保存当前主题，用于取消时恢复
    const currentTheme = useThemeStore.getState().currentTheme;
    this.originalThemeId = currentTheme?.id || null;
    this.previewThemeId = null;

    // 创建自定义模式用于主题选择
    this.commandCenter.registerMode({
      prefix: 'theme:',
      name: 'Select Color Theme',
      placeholder: '选择颜色主题...',
      icon: 'palette',
      provider: async (query: string) => {
        return this.getThemeItems(query);
      },
      onCancel: async () => {
        // 如果用户取消且进行了预览，恢复原始主题
        if (this.previewThemeId && this.originalThemeId && this.previewThemeId !== this.originalThemeId) {
          console.log(`[ThemeCommandProvider] 取消预览，恢复原始主题: ${this.originalThemeId}`);
          await useThemeStore.getState().setTheme(this.originalThemeId);
        }
        this.previewThemeId = null;
        this.originalThemeId = null;
      }
    });

    // 显示命令中心并切换到主题模式
    await this.commandCenter.show('theme:');
  }

  /**
   * 获取主题列表
   */
  private async getThemeItems(query: string): Promise<CommandItem[]> {
    const items: CommandItem[] = [];
    const lowerQuery = query.toLowerCase();
    const { themeList, currentTheme } = useThemeStore.getState();

    // 按类型分组主题
    const lightThemes = themeList.filter(t => t.type === 'light');
    const darkThemes = themeList.filter(t => t.type === 'dark');
    const contrastThemes = themeList.filter(t => t.type === 'hc' || t.type === 'hcLight');

    // 添加浅色主题
    if (lightThemes.length > 0) {
      // 添加分组标题
      if (!query) {
        items.push({
          id: '__light_separator__',
          label: '浅色主题',
          isSeparator: true
        });
      }

      for (const theme of lightThemes) {
        if (this.matchTheme(theme, lowerQuery)) {
          items.push(this.createThemeItem(theme, currentTheme?.id));
        }
      }
    }

    // 添加深色主题
    if (darkThemes.length > 0) {
      // 添加分组标题
      if (!query) {
        items.push({
          id: '__dark_separator__',
          label: '深色主题',
          isSeparator: true
        });
      }

      for (const theme of darkThemes) {
        if (this.matchTheme(theme, lowerQuery)) {
          items.push(this.createThemeItem(theme, currentTheme?.id));
        }
      }
    }

    // 添加高对比度主题
    if (contrastThemes.length > 0) {
      // 添加分组标题
      if (!query) {
        items.push({
          id: '__contrast_separator__',
          label: '高对比度主题',
          isSeparator: true
        });
      }

      for (const theme of contrastThemes) {
        if (this.matchTheme(theme, lowerQuery)) {
          items.push(this.createThemeItem(theme, currentTheme?.id));
        }
      }
    }

    return items;
  }

  /**
   * 匹配主题
   */
  private matchTheme(theme: ThemeInfo, query: string): boolean {
    if (!query) return true;
    
    return (
      theme.name.toLowerCase().includes(query) ||
      theme.id.toLowerCase().includes(query) ||
      (theme.description?.toLowerCase().includes(query) || false)
    );
  }

  /**
   * 创建主题项
   */
  private createThemeItem(theme: ThemeInfo, currentThemeId?: string): CommandItem {
    const isCurrent = currentThemeId === theme.id;
    
    return {
      id: theme.id,
      label: theme.name,
      description: theme.description,
      displayId: '', // 不显示ID
      icon: isCurrent ? '✓' : undefined,
      alwaysShow: isCurrent,
      onPreview: async () => {
        // 预览主题（不关闭命令面板）
        console.log(`[ThemeCommandProvider] 预览主题: ${theme.id}`);
        this.previewThemeId = theme.id;
        await useThemeStore.getState().setTheme(theme.id);
      },
      value: {
        execute: async () => {
          // 确认应用主题（关闭命令面板）
          console.log(`[ThemeCommandProvider] 应用主题: ${theme.id}`);
          await useThemeStore.getState().setTheme(theme.id);
          // 清除预览标记，表示用户已确认
          this.previewThemeId = null;
          this.originalThemeId = null;
        }
      }
    };
  }

  /**
   * 创建自定义主题（实际上是选择要覆盖的内置主题）
   */
  private async createCustomTheme(): Promise<void> {
    console.log('[ThemeCommandProvider] 开始选择要自定义的基础主题');

    try {
      // 步骤1：让用户选择要自定义的基础主题
      const { themeList, currentTheme } = useThemeStore.getState();
      
      // 创建主题选择模式
      this.commandCenter.registerMode({
        prefix: 'customize-theme:',
        name: 'Select Base Theme to Customize',
        placeholder: '选择要自定义颜色的基础主题...',
        icon: 'palette',
        provider: async (query: string) => {
          const items: CommandItem[] = [];
          const lowerQuery = query.toLowerCase();
          
          // 只显示内置主题（非用户主题）
          const builtinThemes = themeList.filter(t => t.source === 'builtin');
          
          for (const theme of builtinThemes) {
            if (this.matchTheme(theme, lowerQuery)) {
              items.push({
                id: theme.id,
                label: theme.name,
                description: theme.type === 'light' ? '浅色主题' : '深色主题',
                icon: currentTheme?.id === theme.id ? 'check' : 'circle-outline',
                value: {
                  execute: async () => {
                    await this.openThemeOverrideEditor(theme);
                  }
                }
              });
            }
          }
          
          return items;
        }
      });
      
      await this.commandCenter.show('customize-theme:');
    } catch (error) {
      console.error('[ThemeCommandProvider] 创建自定义主题失败:', error);
    }
  }

  /**
   * 打开主题覆盖编辑器
   */
  private async openThemeOverrideEditor(baseTheme: ThemeInfo): Promise<void> {
    try {
      console.log('[ThemeCommandProvider] 选择基础主题:', baseTheme.name, baseTheme.id);
      
      // 获取该主题的覆盖文件
      const overrideResult = await window.electron?.ipcRenderer.invoke(
        THEME_CHANNELS.GET_THEME_OVERRIDE,
        baseTheme.id
      );
      
      let configContent: string;
      
      if (overrideResult?.success && overrideResult.colors && Object.keys(overrideResult.colors).length > 0) {
        // 已有覆盖，加载现有内容
        console.log('[ThemeCommandProvider] 找到已存在的覆盖文件，颜色数:', Object.keys(overrideResult.colors).length);
        const overrideConfig = {
          colors: overrideResult.colors
        };
        configContent = JSON.stringify(overrideConfig, null, 2);
      } else {
        // 创建新的覆盖配置
        console.log('[ThemeCommandProvider] 创建新的颜色覆盖文件');
        configContent = this.createEmptyOverride();
      }
      
      // 触发打开编辑器
      const themeConfigPath = `theme-override://${baseTheme.id}.json`;
      
      window.dispatchEvent(
        new CustomEvent('open-editor-tab', {
          detail: {
            path: themeConfigPath,
            content: configContent,
            language: 'jsonc',
            title: `${baseTheme.name} - 颜色覆盖`,
          },
        })
      );
      
      console.log('[ThemeCommandProvider] 已打开主题覆盖编辑器:', baseTheme.name);
    } catch (error) {
      console.error('[ThemeCommandProvider] 打开主题覆盖编辑器失败:', error);
    }
  }

  /**
   * 创建空的颜色覆盖配置
   */
  private createEmptyOverride(): string {
    const overrideConfig = {
      // 颜色覆盖
      // 这里只需要定义你想要修改的颜色
      // 未定义的颜色将使用基础主题的默认值
      colors: {
        // 示例：修改编辑器背景色
        // "editor.background": "#1e1e1e",
        
        // 更多颜色请参考：https://code.visualstudio.com/api/references/theme-color
      }
    };
    
    return JSON.stringify(overrideConfig, null, 2);
  }

  /**
   * 刷新命令（重新注册）
   */
  public refresh(): void {
    // 如果需要动态更新命令，可以在这里重新注册
    console.log('[ThemeCommandProvider] 刷新命令');
  }
}

