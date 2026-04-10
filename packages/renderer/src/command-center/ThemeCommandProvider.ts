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
import {
  DEFAULT_WORKBENCH_FILE_ICON_THEME_ID,
  THEME_CHANNELS,
  type ThemeInfo,
  type WorkbenchFileIconThemeEntry,
} from '@note-studio/shared';
import { translate } from '../i18n';
import { workbenchContributionService } from '../services/WorkbenchContributionService';
import { OPEN_COLOR_THEME_PICKER_EVENT, OPEN_FILE_ICON_THEME_PICKER_EVENT } from './ThemeCommandEvents';

const SELECT_THEME_COMMAND_ID = 'workbench.action.selectTheme';
const CREATE_CUSTOM_THEME_COMMAND_ID = 'workbench.action.createCustomTheme';
const SELECT_FILE_ICON_THEME_COMMAND_ID = 'workbench.action.selectFileIconTheme';
const COLOR_THEME_MODE_PREFIX = 'theme:';
const CUSTOMIZE_THEME_MODE_PREFIX = 'customize-theme:';
const FILE_ICON_THEME_MODE_PREFIX = 'file-icon-theme:';

export class ThemeCommandProvider {
  private readonly commandCenter: VSCodeCommandCenter;
  private previewThemeId: string | null = null;
  private originalThemeId: string | null = null;
  private previewFileIconThemeId: string | null = null;
  private originalFileIconThemeId: string | null = null;
  private readonly colorThemePickerListener = (): void => {
    void this.showThemeQuickPick();
  };
  private readonly fileIconThemePickerListener = (): void => {
    void this.showFileIconThemeQuickPick();
  };

  constructor(commandCenter: VSCodeCommandCenter) {
    this.commandCenter = commandCenter;
    this.registerThemeCommands();
    window.addEventListener(OPEN_COLOR_THEME_PICKER_EVENT, this.colorThemePickerListener);
    window.addEventListener(OPEN_FILE_ICON_THEME_PICKER_EVENT, this.fileIconThemePickerListener);
  }

  private translateText(
    key: string,
    defaultValue: string,
    values?: Record<string, string>,
  ): string {
    return translate(key, values ? { defaultValue, ...values } : { defaultValue });
  }

  /**
   * 注册颜色主题相关命令
   */
  private registerThemeCommands(): void {
    const commands: Command[] = [];

    // ============ 核心主题命令 ============

    // 首选项: 颜色主题
    commands.push({
      id: SELECT_THEME_COMMAND_ID,
      label: this.translateText('commandCenter.themeCommands.selectTheme.label', '首选项: 颜色主题'),
      displayId: 'Preferences: Color Theme',
      description: this.translateText('commandCenter.themeCommands.selectTheme.description', '选择颜色主题'),
      category: this.translateText('commandCenter.preferencesCategory', '首选项'),
      icon: 'palette',
      execute: async () => {
        await this.showThemeQuickPick();
      }
    });

    commands.push({
      id: SELECT_FILE_ICON_THEME_COMMAND_ID,
      label: this.translateText(
        'commandCenter.themeCommands.selectFileIconTheme.label',
        '首选项: 文件图标主题',
      ),
      displayId: 'Preferences: File Icon Theme',
      description: this.translateText(
        'commandCenter.themeCommands.selectFileIconTheme.description',
        '选择文件图标主题',
      ),
      category: this.translateText('commandCenter.preferencesCategory', '首选项'),
      icon: 'file',
      execute: async () => {
        await this.showFileIconThemeQuickPick();
      },
    });

    // 创建自定义主题
    commands.push({
      id: CREATE_CUSTOM_THEME_COMMAND_ID,
      label: this.translateText(
        'commandCenter.themeCommands.createCustomTheme.label',
        '首选项: 创建自定义主题',
      ),
      displayId: '', // 不显示ID
      description: this.translateText(
        'commandCenter.themeCommands.createCustomTheme.description',
        '创建一个新的自定义主题配置文件',
      ),
      category: this.translateText('commandCenter.preferencesCategory', '首选项'),
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
      prefix: COLOR_THEME_MODE_PREFIX,
      name: this.translateText('commandCenter.modes.selectColorTheme', '选择颜色主题'),
      placeholder: this.translateText('commandCenter.placeholders.selectColorTheme', '选择颜色主题...'),
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
    await this.commandCenter.show(COLOR_THEME_MODE_PREFIX);
  }

  private async showFileIconThemeQuickPick(): Promise<void> {
    this.originalFileIconThemeId = await this.getActiveFileIconThemeId();
    this.previewFileIconThemeId = null;

    this.commandCenter.registerMode({
      prefix: FILE_ICON_THEME_MODE_PREFIX,
      name: this.translateText('commandCenter.modes.selectFileIconTheme', '选择文件图标主题'),
      placeholder: this.translateText(
        'commandCenter.placeholders.selectFileIconTheme',
        '选择文件图标主题...',
      ),
      icon: 'file',
      provider: async (query: string) => {
        return this.getFileIconThemeItems(query);
      },
      onCancel: async () => {
        if (
          this.previewFileIconThemeId
          && this.originalFileIconThemeId
          && this.previewFileIconThemeId !== this.originalFileIconThemeId
        ) {
          await this.setFileIconTheme(this.originalFileIconThemeId);
        }
        this.previewFileIconThemeId = null;
        this.originalFileIconThemeId = null;
      },
    });

    await this.commandCenter.show(FILE_ICON_THEME_MODE_PREFIX);
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
          label: this.translateText('commandCenter.themeCommands.groups.light', '浅色主题'),
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
          label: this.translateText('commandCenter.themeCommands.groups.dark', '深色主题'),
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
          label: this.translateText('commandCenter.themeCommands.groups.contrast', '高对比度主题'),
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

  private matchFileIconTheme(theme: WorkbenchFileIconThemeEntry, query: string): boolean {
    if (!query) {
      return true;
    }

    return (
      theme.extensionDisplayName.toLowerCase().includes(query)
      || theme.label.toLowerCase().includes(query)
      || theme.extensionId.toLowerCase().includes(query)
      || theme.id.toLowerCase().includes(query)
    );
  }

  private async getFileIconThemeItems(query: string): Promise<CommandItem[]> {
    try {
      const snapshot = await workbenchContributionService.getContributions();
      const currentThemeId = await this.getActiveFileIconThemeId();
      const lowerQuery = query.toLowerCase();
      const themes = [...snapshot.fileIconThemes]
        .filter(theme => this.matchFileIconTheme(theme, lowerQuery))
        .sort((left, right) => left.extensionDisplayName.localeCompare(right.extensionDisplayName, 'zh-CN'));

      return themes.map(theme => this.createFileIconThemeItem(theme, currentThemeId));
    } catch (error) {
      console.error('[ThemeCommandProvider] 加载文件图标主题失败:', error);
      return [];
    }
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

  private createFileIconThemeItem(
    theme: WorkbenchFileIconThemeEntry,
    currentThemeId: string,
  ): CommandItem {
    const isCurrent = currentThemeId === theme.id;

    return {
      id: theme.id,
      label: theme.extensionDisplayName,
      description: theme.label,
      detail: theme.extensionId,
      displayId: '',
      icon: isCurrent ? '✓' : undefined,
      alwaysShow: isCurrent,
      onPreview: async () => {
        if (this.previewFileIconThemeId === theme.id) {
          return;
        }

        this.previewFileIconThemeId = theme.id;
        await this.setFileIconTheme(theme.id);
      },
      value: {
        execute: async () => {
          await this.setFileIconTheme(theme.id);
          this.previewFileIconThemeId = null;
          this.originalFileIconThemeId = null;
        },
      },
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
        prefix: CUSTOMIZE_THEME_MODE_PREFIX,
        name: this.translateText('commandCenter.modes.selectBaseTheme', '选择要自定义的基础主题'),
        placeholder: this.translateText(
          'commandCenter.placeholders.selectBaseTheme',
          '选择要自定义颜色的基础主题...',
        ),
        icon: 'palette',
        provider: async (query: string) => {
          const items: CommandItem[] = [];
          const lowerQuery = query.toLowerCase();
          
          // 只显示内置主题（非用户主题）
          const builtinThemes = themeList.filter(t => t.source === 'builtin');
          
          for (const theme of builtinThemes) {
            if (this.matchTheme(theme, lowerQuery)) {
              const builtinThemeType = theme.type === 'light'
                ? this.translateText('commandCenter.themeCommands.builtinThemeType.light', '浅色主题')
                : theme.type === 'dark'
                  ? this.translateText('commandCenter.themeCommands.builtinThemeType.dark', '深色主题')
                  : this.translateText('commandCenter.themeCommands.builtinThemeType.contrast', '高对比度主题');
              items.push({
                id: theme.id,
                label: theme.name,
                description: builtinThemeType,
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
      
      await this.commandCenter.show(CUSTOMIZE_THEME_MODE_PREFIX);
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
            title: this.translateText(
              'commandCenter.themeCommands.overrideTitle',
              '{{themeName}} - 颜色覆盖',
              { themeName: baseTheme.name },
            ),
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

  public dispose(): void {
    window.removeEventListener(OPEN_COLOR_THEME_PICKER_EVENT, this.colorThemePickerListener);
    window.removeEventListener(OPEN_FILE_ICON_THEME_PICKER_EVENT, this.fileIconThemePickerListener);
    this.commandCenter.unregisterCommands([
      SELECT_THEME_COMMAND_ID,
      SELECT_FILE_ICON_THEME_COMMAND_ID,
      CREATE_CUSTOM_THEME_COMMAND_ID,
    ]);
  }

  private async getActiveFileIconThemeId(): Promise<string> {
    const response = await window.electronAPI?.settings?.get('workbench.fileIconTheme');
    const themeId = response?.success && typeof response.data === 'string'
      ? response.data.trim()
      : '';

    return themeId.length > 0 ? themeId : DEFAULT_WORKBENCH_FILE_ICON_THEME_ID;
  }

  private async setFileIconTheme(themeId: string): Promise<void> {
    const response = await window.electronAPI?.settings?.update('workbench.fileIconTheme', themeId);

    if (!response?.success) {
      throw new Error(response?.error ?? '设置文件图标主题失败');
    }
  }
}

