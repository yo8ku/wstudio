/**
 * 主题上下文
 * 管理全局主题状态和应用
 * 
 * 设计原则：应用主题完全由主题插件控制
 * - 所有颜色从主题插件的 colors 配置中提取
 * - defaultColors 仅作为最后的回退选项
 * - 遵循 VSCode 主题规范的颜色键映射
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ITheme } from '../types/electron';

/**
 * 应用主题颜色接口
 * 从 VSCode 主题 colors 映射到应用 CSS 变量
 */
interface ThemeColors {
  // 基础颜色
  background: string;
  foreground: string;
  
  // 侧边栏
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarBorder: string;
  
  // 活动栏
  activityBarBackground: string;
  activityBarForeground: string;
  activityBarBorder: string;
  
  // 状态栏
  statusBarBackground: string;
  statusBarForeground: string;
  statusBarBorder: string;
  
  // 标题栏
  titleBarBackground: string;
  titleBarForeground: string;
  titleBarBorder: string;
  titleBarHoverBackground: string;
  
  // 编辑器
  editorBackground: string;
  editorForeground: string;
  editorGroupBorder: string;
  editorLineHighlight: string;
  editorSelection: string;
  editorCursor: string;
  editorLineNumber: string;
  
  // 面板
  panelBackground: string;
  panelForeground: string;
  panelBorder: string;
  
  // 边框
  borderColor: string;
  contrastBorder: string;
  tabBorder: string;
  
  // 标签页
  tabActiveBackground: string;
  tabInactiveBackground: string;
  tabUnfocusedActiveBackground: string;
  tabUnfocusedInactiveBackground: string;
  tabActiveForeground: string;
  tabInactiveForeground: string;
  tabUnfocusedActiveForeground: string;
  tabUnfocusedInactiveForeground: string;
  tabActiveBorder: string;
  tabActiveBorderTop: string;
  tabUnfocusedActiveBorder: string;
  tabUnfocusedActiveBorderTop: string;
  editorGroupHeaderTabsBackground: string;
  
  // 输入控件
  inputBackground: string;
  inputForeground: string;
  inputBorder: string;
  inputPlaceholder: string;
  
  // 按钮
  buttonBackground: string;
  buttonForeground: string;
  buttonHoverBackground: string;
  buttonBorder: string;
  
  // 工具栏
  toolbarHoverBackground: string;
  toolbarActiveBackground: string;
  
  // 滚动条
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
  
  // 菜单
  menuBackground: string;
  menuForeground: string;
  menuBorder: string;
  menuSelectionBackground: string;
  menuSelectionForeground: string;
  menuSeparator: string;
  
  // 列表/树
  listActiveBackground: string;
  listActiveForeground: string;
  listHoverBackground: string;
  listHoverForeground: string;
  listFocusBackground: string;
  listFocusForeground: string;
  
  // Git 装饰
  gitModified: string;
  gitAdded: string;
  gitDeleted: string;
  gitUntracked: string;
  gitConflict: string;
  gitIgnored: string;
  
  // 终端
  terminalBackground: string;
  terminalForeground: string;
  terminalCursor: string;
  terminalSelection: string;
  // ANSI 颜色
  terminalAnsiBlack: string;
  terminalAnsiRed: string;
  terminalAnsiGreen: string;
  terminalAnsiYellow: string;
  terminalAnsiBlue: string;
  terminalAnsiMagenta: string;
  terminalAnsiCyan: string;
  terminalAnsiWhite: string;
  terminalAnsiBrightBlack: string;
  terminalAnsiBrightRed: string;
  terminalAnsiBrightGreen: string;
  terminalAnsiBrightYellow: string;
  terminalAnsiBrightBlue: string;
  terminalAnsiBrightMagenta: string;
  terminalAnsiBrightCyan: string;
  terminalAnsiBrightWhite: string;
  
  // 焦点边框
  focusBorder: string;
  
  // 徽章
  badgeBackground: string;
  badgeForeground: string;
  
  // 通知
  notificationBackground: string;
  notificationForeground: string;
  notificationBorder: string;
  
  // Diff 编辑器
  diffInserted: string;
  diffRemoved: string;
  diffModified: string;
}

interface ThemeContextType {
  theme: ITheme | null;
  colors: ThemeColors;
  applyTheme: (themeId: string) => Promise<void>;
}

/**
 * 默认颜色（VS Code Dark+ 主题风格）
 * 仅作为最后的回退选项，正常情况下应从主题插件获取所有颜色
 */
const defaultColors: ThemeColors = {
  // 基础颜色
  background: '#1e1e1e',
  foreground: '#cccccc',
  
  // 侧边栏
  sidebarBackground: '#252526',
  sidebarForeground: '#cccccc',
  sidebarBorder: 'transparent',
  
  // 活动栏
  activityBarBackground: '#333333',
  activityBarForeground: '#ffffff',
  activityBarBorder: 'transparent',
  
  // 状态栏
  statusBarBackground: '#007acc',
  statusBarForeground: '#ffffff',
  statusBarBorder: 'transparent',
  
  // 标题栏
  titleBarBackground: '#323233',
  titleBarForeground: '#cccccc',
  titleBarBorder: 'transparent',
  titleBarHoverBackground: '#404040',
  
  // 编辑器
  editorBackground: '#1e1e1e',
  editorForeground: '#d4d4d4',
  editorGroupBorder: 'transparent',
  editorLineHighlight: '#2a2d2e',
  editorSelection: '#264f78',
  editorCursor: '#aeafad',
  editorLineNumber: '#858585',
  
  // 面板
  panelBackground: '#1e1e1e',
  panelForeground: '#cccccc',
  panelBorder: 'transparent',
  
  // 边框
  borderColor: 'transparent',
  contrastBorder: 'transparent',
  tabBorder: 'transparent',
  
  // 标签页
  tabActiveBackground: '#1e1e1e',
  tabInactiveBackground: '#2d2d2d',
  tabUnfocusedActiveBackground: '#1e1e1e',
  tabUnfocusedInactiveBackground: '#2d2d2d',
  tabActiveForeground: '#ffffff',
  tabInactiveForeground: '#969696',
  tabUnfocusedActiveForeground: '#cccccc',
  tabUnfocusedInactiveForeground: '#808080',
  tabActiveBorder: 'transparent',
  tabActiveBorderTop: '#007acc',
  tabUnfocusedActiveBorder: 'transparent',
  tabUnfocusedActiveBorderTop: 'transparent',
  editorGroupHeaderTabsBackground: '#252526',
  
  // 输入控件
  inputBackground: '#3c3c3c',
  inputForeground: '#cccccc',
  inputBorder: '#3c3c3c',
  inputPlaceholder: '#a6a6a6',
  
  // 按钮
  buttonBackground: '#0e639c',
  buttonForeground: '#ffffff',
  buttonHoverBackground: '#1177bb',
  buttonBorder: 'transparent',
  
  // 滚动条
  scrollbarTrack: 'transparent',
  scrollbarThumb: '#79797966',
  scrollbarThumbHover: '#646464b3',
  
  // 菜单
  menuBackground: '#252526',
  menuForeground: '#cccccc',
  menuBorder: '#454545',
  menuSelectionBackground: '#094771',
  menuSelectionForeground: '#ffffff',
  menuSeparator: '#454545',
  
  // 列表/树
  listActiveBackground: '#094771',
  listActiveForeground: '#ffffff',
  listHoverBackground: '#2a2d2e',
  listHoverForeground: '#cccccc',
  listFocusBackground: '#062f4a',
  listFocusForeground: '#ffffff',
  
  // Git 装饰
  gitModified: '#e2c08d',
  gitAdded: '#81b88b',
  gitDeleted: '#c74e39',
  gitUntracked: '#73c991',
  gitConflict: '#e4676b',
  gitIgnored: '#8c8c8c',
  
  // 终端
  terminalBackground: '#1e1e1e',
  terminalForeground: '#cccccc',
  terminalCursor: '#ffffff',
  terminalSelection: '#264f78',
  terminalAnsiBlack: '#000000',
  terminalAnsiRed: '#cd3131',
  terminalAnsiGreen: '#0dbc79',
  terminalAnsiYellow: '#e5e510',
  terminalAnsiBlue: '#2472c8',
  terminalAnsiMagenta: '#bc3fbc',
  terminalAnsiCyan: '#11a8cd',
  terminalAnsiWhite: '#e5e5e5',
  terminalAnsiBrightBlack: '#666666',
  terminalAnsiBrightRed: '#f14c4c',
  terminalAnsiBrightGreen: '#23d18b',
  terminalAnsiBrightYellow: '#f5f543',
  terminalAnsiBrightBlue: '#3b8eea',
  terminalAnsiBrightMagenta: '#d670d6',
  terminalAnsiBrightCyan: '#29b8db',
  terminalAnsiBrightWhite: '#e5e5e5',
  
  // 焦点边框
  focusBorder: '#007fd4',
  
  // 徽章
  badgeBackground: '#007acc',
  badgeForeground: '#ffffff',
  
  // 通知
  notificationBackground: '#252526',
  notificationForeground: '#cccccc',
  notificationBorder: '#454545',
  
  // Diff 编辑器
  diffInserted: '#9bb95533',
  diffRemoved: '#ff000033',
  diffModified: '#948b3033',
};

const ThemeContext = createContext<ThemeContextType>({
  theme: null,
  colors: defaultColors,
  applyTheme: async () => {},
});

export const useTheme = () => useContext(ThemeContext);

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<ITheme | null>(null);
  const [colors, setColors] = useState<ThemeColors>(defaultColors);

  /**
   * 从主题数据提取颜色
   * 完全遵循 VSCode 主题规范的颜色键
   */
  const extractColors = (themeData: ITheme): ThemeColors => {
    const tc = themeData.colors || {};
    
    // 辅助函数：获取颜色，支持回退链
    const getColor = (key: string, ...fallbacks: string[]): string => {
      if (tc[key]) return tc[key];
      for (const fallback of fallbacks) {
        if (tc[fallback]) return tc[fallback];
      }
      // 最后返回 transparent 作为默认值，避免使用硬编码的 defaultColors
      return 'transparent';
    };
    
    // 特殊处理：关键颜色必须有值，不能为 transparent
    const getCriticalColor = (key: string, ...fallbacks: string[]): string => {
      if (tc[key]) return tc[key];
      for (const fallback of fallbacks) {
        if (tc[fallback]) return tc[fallback];
      }
      // 如果是深色主题，使用浅色作为默认前景色；如果是浅色主题，使用深色
      if (themeData.type === 'light') {
        return '#000000';
      }
      return '#cccccc';
    };
    
    // 首先获取基础背景和前景色
    const baseBackground = getColor('editor.background') || (themeData.type === 'light' ? '#ffffff' : '#1e1e1e');
    const baseForeground = getCriticalColor('editor.foreground', 'foreground', 'terminal.foreground', 'activityBar.foreground');
    
    // 用于获取前景色，带有 baseForeground 作为最终回退
    const getForegroundColor = (key: string, ...fallbacks: string[]): string => {
      if (tc[key]) return tc[key];
      for (const fallback of fallbacks) {
        if (tc[fallback]) return tc[fallback];
      }
      return baseForeground;
    };
    
    const colors: ThemeColors = {
      // 基础颜色
      background: baseBackground,
      foreground: baseForeground,
      
      // 侧边栏
      sidebarBackground: getColor('sideBar.background', 'editor.background') || baseBackground,
      sidebarForeground: getForegroundColor('sideBar.foreground', 'foreground'),
      sidebarBorder: getColor('sideBar.border', 'contrastBorder'),
      
      // 活动栏
      activityBarBackground: getColor('activityBar.background', 'sideBar.background'),
      activityBarForeground: getForegroundColor('activityBar.foreground'),
      activityBarBorder: getColor('activityBar.border', 'contrastBorder'),
      
      // 状态栏
      statusBarBackground: getColor('statusBar.background'),
      statusBarForeground: getForegroundColor('statusBar.foreground'),
      statusBarBorder: getColor('statusBar.border', 'contrastBorder'),
      
      // 标题栏
      titleBarBackground: getColor('titleBar.activeBackground', 'activityBar.background'),
      titleBarForeground: getForegroundColor('titleBar.activeForeground'),
      titleBarBorder: getColor('titleBar.border', 'contrastBorder'),
      titleBarHoverBackground: getColor('titleBar.activeBackground'), // 需要手动调亮
      
      // 编辑器
      editorBackground: baseBackground,
      editorForeground: baseForeground,
      editorGroupBorder: getColor('editorGroup.border', 'panel.border', 'contrastBorder'),
      editorLineHighlight: getColor('editor.lineHighlightBackground'),
      editorSelection: getColor('editor.selectionBackground'),
      editorCursor: getForegroundColor('editorCursor.foreground'),
      editorLineNumber: getColor('editorLineNumber.foreground'),
      
      // 面板
      panelBackground: getColor('panel.background', 'editor.background') || baseBackground,
      panelForeground: getForegroundColor('panel.foreground'),
      panelBorder: getColor('panel.border', 'contrastBorder'),
      
      // 边框
      borderColor: getColor('panel.border', 'editorGroup.border', 'contrastBorder'),
      contrastBorder: getColor('contrastBorder'),
      tabBorder: getColor('tab.border', 'panel.border'),
      
      // 标签页
      tabActiveBackground: getColor('tab.activeBackground', 'editor.background') || baseBackground,
      tabInactiveBackground: getColor('tab.inactiveBackground', 'editorGroupHeader.tabsBackground', 'editor.background'),
      tabUnfocusedActiveBackground: getColor('tab.unfocusedActiveBackground', 'tab.activeBackground', 'editor.background'),
      tabUnfocusedInactiveBackground: getColor('tab.unfocusedInactiveBackground', 'tab.inactiveBackground', 'editorGroupHeader.tabsBackground'),
      tabActiveForeground: getForegroundColor('tab.activeForeground'),
      tabInactiveForeground: getForegroundColor('tab.inactiveForeground', 'tab.unfocusedInactiveForeground'),
      tabUnfocusedActiveForeground: getForegroundColor('tab.unfocusedActiveForeground', 'tab.activeForeground'),
      tabUnfocusedInactiveForeground: getForegroundColor('tab.unfocusedInactiveForeground', 'tab.inactiveForeground'),
      tabActiveBorder: getColor('tab.activeBorder'),
      tabActiveBorderTop: getColor('tab.activeBorderTop', 'tab.activeBorder'),
      tabUnfocusedActiveBorder: getColor('tab.unfocusedActiveBorder', 'tab.activeBorder'),
      tabUnfocusedActiveBorderTop: getColor('tab.unfocusedActiveBorderTop', 'tab.unfocusedActiveBorder', 'tab.activeBorderTop'),
      editorGroupHeaderTabsBackground: getColor('editorGroupHeader.tabsBackground', 'editor.background') || baseBackground,
      
      // 输入控件
      inputBackground: getColor('input.background'),
      inputForeground: getForegroundColor('input.foreground', 'foreground'),
      inputBorder: getColor('input.border', 'focusBorder'),
      inputPlaceholder: getColor('input.placeholderForeground'),
      
      // 按钮
      buttonBackground: getColor('button.background'),
      buttonForeground: getForegroundColor('button.foreground'),
      buttonHoverBackground: getColor('button.hoverBackground', 'button.background'),
      buttonBorder: getColor('button.border', 'contrastBorder'),
      
      // 工具栏
      toolbarHoverBackground: getColor('toolbar.hoverBackground', 'list.hoverBackground'),
      toolbarActiveBackground: getColor('toolbar.activeBackground', 'list.activeSelectionBackground'),
      
      // 滚动条
      scrollbarTrack: getColor('scrollbarSlider.background'),
      scrollbarThumb: getColor('scrollbarSlider.activeBackground', 'scrollbarSlider.hoverBackground'),
      scrollbarThumbHover: getColor('scrollbarSlider.hoverBackground', 'scrollbarSlider.activeBackground'),
      
      // 菜单
      menuBackground: getColor('menu.background', 'dropdown.background', 'editorWidget.background'),
      menuForeground: getForegroundColor('menu.foreground', 'dropdown.foreground', 'foreground'),
      menuBorder: getColor('menu.border', 'dropdown.border', 'widget.border'),
      menuSelectionBackground: getColor('menu.selectionBackground', 'list.activeSelectionBackground'),
      menuSelectionForeground: getForegroundColor('menu.selectionForeground', 'list.activeSelectionForeground'),
      menuSeparator: getColor('menu.separatorBackground', 'dropdown.border'),
      
      // 列表/树
      listActiveBackground: getColor('list.activeSelectionBackground'),
      listActiveForeground: getForegroundColor('list.activeSelectionForeground', 'foreground'),
      listHoverBackground: getColor('list.hoverBackground'),
      listHoverForeground: getForegroundColor('list.hoverForeground', 'foreground'),
      listFocusBackground: getColor('list.focusBackground', 'list.activeSelectionBackground'),
      listFocusForeground: getForegroundColor('list.focusForeground', 'list.activeSelectionForeground'),
      
      // Git 装饰
      gitModified: getColor('gitDecoration.modifiedResourceForeground'),
      gitAdded: getColor('gitDecoration.addedResourceForeground'),
      gitDeleted: getColor('gitDecoration.deletedResourceForeground'),
      gitUntracked: getColor('gitDecoration.untrackedResourceForeground'),
      gitConflict: getColor('gitDecoration.conflictingResourceForeground'),
      gitIgnored: getColor('gitDecoration.ignoredResourceForeground'),
      
      // 终端
      terminalBackground: getColor('terminal.background', 'panel.background', 'editor.background') || baseBackground,
      terminalForeground: getForegroundColor('terminal.foreground', 'panel.foreground'),
      terminalCursor: getForegroundColor('terminalCursor.foreground'),
      terminalSelection: getColor('terminal.selectionBackground'),
      terminalAnsiBlack: getColor('terminal.ansiBlack'),
      terminalAnsiRed: getColor('terminal.ansiRed'),
      terminalAnsiGreen: getColor('terminal.ansiGreen'),
      terminalAnsiYellow: getColor('terminal.ansiYellow'),
      terminalAnsiBlue: getColor('terminal.ansiBlue'),
      terminalAnsiMagenta: getColor('terminal.ansiMagenta'),
      terminalAnsiCyan: getColor('terminal.ansiCyan'),
      terminalAnsiWhite: getColor('terminal.ansiWhite'),
      terminalAnsiBrightBlack: getColor('terminal.ansiBrightBlack'),
      terminalAnsiBrightRed: getColor('terminal.ansiBrightRed'),
      terminalAnsiBrightGreen: getColor('terminal.ansiBrightGreen'),
      terminalAnsiBrightYellow: getColor('terminal.ansiBrightYellow'),
      terminalAnsiBrightBlue: getColor('terminal.ansiBrightBlue'),
      terminalAnsiBrightMagenta: getColor('terminal.ansiBrightMagenta'),
      terminalAnsiBrightCyan: getColor('terminal.ansiBrightCyan'),
      terminalAnsiBrightWhite: getColor('terminal.ansiBrightWhite'),
      
      // 焦点边框
      focusBorder: getColor('focusBorder'),
      
      // 徽章
      badgeBackground: getColor('badge.background', 'activityBarBadge.background'),
      badgeForeground: getForegroundColor('badge.foreground', 'activityBarBadge.foreground'),
      
      // 通知
      notificationBackground: getColor('notificationCenter.background', 'editor.background') || baseBackground,
      notificationForeground: getForegroundColor('notificationCenter.foreground', 'foreground'),
      notificationBorder: getColor('notificationCenter.border', 'contrastBorder'),
      
      // Diff 编辑器
      diffInserted: getColor('diffEditor.insertedTextBackground'),
      diffRemoved: getColor('diffEditor.removedTextBackground'),
      diffModified: getColor('diffEditor.modifiedTextBackground'),
    };
    
    return colors;
  };

  /**
   * 应用主题颜色到 CSS 变量
   * 将提取的颜色映射到应用的 CSS 变量
   */
  const applyThemeColors = (themeColors: ThemeColors, themeData?: ITheme) => {
    const root = document.documentElement;
    
    console.log('[ThemeContext] ==========  开始应用主题颜色 ==========');
    console.log('[ThemeContext] 主题名称:', themeData?.name);
    console.log('[ThemeContext] 主题背景色:', themeColors.background);
    console.log('[ThemeContext] 主题前景色:', themeColors.foreground);
    
    // 基础颜色
    root.style.setProperty('--app-bg', themeColors.background);
    root.style.setProperty('--app-fg', themeColors.foreground);
    
    // ⭐ 清除所有旧的 vscode-* 变量（避免上一个主题的变量污染）
    const existingStyles = root.style;
    const varsToRemove: string[] = [];
    for (let i = 0; i < existingStyles.length; i++) {
      const propName = existingStyles[i];
      if (propName.startsWith('--vscode-')) {
        varsToRemove.push(propName);
      }
    }
    console.log('[ThemeContext] 清除', varsToRemove.length, '个旧的 vscode-* 变量');
    varsToRemove.forEach(varName => root.style.removeProperty(varName));
    
    // ⭐ 应用新主题的 VSCode 变量格式 (用于命令面板等组件)
    const currentTheme = themeData || theme;
    if (currentTheme?.colors) {
      console.log('[ThemeContext] 应用 vscode-* 变量，共', Object.keys(currentTheme.colors).length, '个');
      
      // 重点检查命令面板相关的变量
      const quickInputBg = currentTheme.colors['quickInput.background'];
      const editorBg = currentTheme.colors['editor.background'];
      console.log('[ThemeContext] quickInput.background =', quickInputBg);
      console.log('[ThemeContext] editor.background =', editorBg);
      
      Object.entries(currentTheme.colors).forEach(([key, value]) => {
        if (value) {
          const cssVar = `--vscode-${key.replace(/\./g, '-')}`;
          root.style.setProperty(cssVar, value);
        }
      });
      
      // 验证是否成功应用
      const appliedBg = root.style.getPropertyValue('--vscode-quickInput-background');
      console.log('[ThemeContext] 应用后读取 --vscode-quickInput-background =', appliedBg);
    } else {
      console.warn('[ThemeContext] 无法应用 vscode-* 变量：主题数据不可用');
    }
    
    // 侧边栏
    root.style.setProperty('--sidebar-bg', themeColors.sidebarBackground);
    root.style.setProperty('--sidebar-fg', themeColors.sidebarForeground);
    root.style.setProperty('--sidebar-border', themeColors.sidebarBorder);
    
    // 活动栏
    root.style.setProperty('--activitybar-bg', themeColors.activityBarBackground);
    root.style.setProperty('--activitybar-fg', themeColors.activityBarForeground);
    root.style.setProperty('--activitybar-border', themeColors.activityBarBorder);
    
    // 状态栏
    root.style.setProperty('--statusbar-bg', themeColors.statusBarBackground);
    root.style.setProperty('--statusbar-fg', themeColors.statusBarForeground);
    root.style.setProperty('--statusbar-border', themeColors.statusBarBorder);
    
    // 标题栏
    root.style.setProperty('--titlebar-bg', themeColors.titleBarBackground);
    root.style.setProperty('--titlebar-fg', themeColors.titleBarForeground);
    root.style.setProperty('--titlebar-border', themeColors.titleBarBorder);
    root.style.setProperty('--titlebar-hover', lightenColor(themeColors.titleBarBackground, 0.1));
    root.style.setProperty('--titlebar-close-hover', '#e81123');
    
    // 编辑器
    root.style.setProperty('--editor-bg', themeColors.editorBackground);
    root.style.setProperty('--editor-fg', themeColors.editorForeground);
    root.style.setProperty('--editor-group-border', themeColors.editorGroupBorder);
    root.style.setProperty('--editor-line-highlight', themeColors.editorLineHighlight);
    root.style.setProperty('--editor-selection', themeColors.editorSelection);
    root.style.setProperty('--editor-cursor', themeColors.editorCursor);
    root.style.setProperty('--editor-line-number', themeColors.editorLineNumber);
    
    // 面板
    root.style.setProperty('--panel-bg', themeColors.panelBackground);
    root.style.setProperty('--panel-fg', themeColors.panelForeground);
    root.style.setProperty('--panel-border', themeColors.panelBorder);
    
    // 边框
    root.style.setProperty('--border-color', themeColors.borderColor);
    root.style.setProperty('--contrast-border', themeColors.contrastBorder);
    root.style.setProperty('--tab-border', themeColors.tabBorder);
    
    // 标签页
    root.style.setProperty('--tab-active-bg', themeColors.tabActiveBackground);
    root.style.setProperty('--tab-inactive-bg', themeColors.tabInactiveBackground);
    root.style.setProperty('--tab-unfocused-active-bg', themeColors.tabUnfocusedActiveBackground);
    root.style.setProperty('--tab-unfocused-inactive-bg', themeColors.tabUnfocusedInactiveBackground);
    root.style.setProperty('--tab-active-fg', themeColors.tabActiveForeground);
    root.style.setProperty('--tab-inactive-fg', themeColors.tabInactiveForeground);
    root.style.setProperty('--tab-unfocused-active-fg', themeColors.tabUnfocusedActiveForeground);
    root.style.setProperty('--tab-unfocused-inactive-fg', themeColors.tabUnfocusedInactiveForeground);
    root.style.setProperty('--tab-active-border', themeColors.tabActiveBorder);
    root.style.setProperty('--tab-active-border-top', themeColors.tabActiveBorderTop);
    root.style.setProperty('--tab-unfocused-active-border', themeColors.tabUnfocusedActiveBorder);
    root.style.setProperty('--tab-unfocused-active-border-top', themeColors.tabUnfocusedActiveBorderTop);
    root.style.setProperty('--editor-group-header-tabs-bg', themeColors.editorGroupHeaderTabsBackground);
    
    // 输入控件
    root.style.setProperty('--input-bg', themeColors.inputBackground);
    root.style.setProperty('--input-fg', themeColors.inputForeground);
    root.style.setProperty('--input-border', themeColors.inputBorder);
    root.style.setProperty('--input-placeholder', themeColors.inputPlaceholder);
    
    // 按钮
    root.style.setProperty('--button-bg', themeColors.buttonBackground);
    root.style.setProperty('--button-fg', themeColors.buttonForeground);
    root.style.setProperty('--button-hover-bg', themeColors.buttonHoverBackground);
    root.style.setProperty('--button-border', themeColors.buttonBorder);
    
    // 工具栏
    root.style.setProperty('--toolbar-hover-bg', themeColors.toolbarHoverBackground);
    root.style.setProperty('--toolbar-active-bg', themeColors.toolbarActiveBackground);
    
    // 滚动条
    root.style.setProperty('--scrollbar-track', themeColors.scrollbarTrack);
    root.style.setProperty('--scrollbar-thumb', themeColors.scrollbarThumb);
    root.style.setProperty('--scrollbar-thumb-hover', themeColors.scrollbarThumbHover);
    
    // 菜单
    root.style.setProperty('--menu-bg', themeColors.menuBackground);
    root.style.setProperty('--menu-fg', themeColors.menuForeground);
    root.style.setProperty('--menu-border', themeColors.menuBorder);
    root.style.setProperty('--menu-selection-bg', themeColors.menuSelectionBackground);
    root.style.setProperty('--menu-selection-fg', themeColors.menuSelectionForeground);
    root.style.setProperty('--menu-separator', themeColors.menuSeparator);
    
    // 列表/树
    root.style.setProperty('--list-active-bg', themeColors.listActiveBackground);
    root.style.setProperty('--list-active-fg', themeColors.listActiveForeground);
    root.style.setProperty('--list-hover-bg', themeColors.listHoverBackground);
    root.style.setProperty('--list-hover-fg', themeColors.listHoverForeground);
    root.style.setProperty('--list-focus-bg', themeColors.listFocusBackground);
    root.style.setProperty('--list-focus-fg', themeColors.listFocusForeground);
    
    // Git 装饰
    root.style.setProperty('--git-modified', themeColors.gitModified);
    root.style.setProperty('--git-added', themeColors.gitAdded);
    root.style.setProperty('--git-deleted', themeColors.gitDeleted);
    root.style.setProperty('--git-untracked', themeColors.gitUntracked);
    root.style.setProperty('--git-conflict', themeColors.gitConflict);
    root.style.setProperty('--git-ignored', themeColors.gitIgnored);
    
    // 终端
    root.style.setProperty('--terminal-bg', themeColors.terminalBackground);
    root.style.setProperty('--terminal-fg', themeColors.terminalForeground);
    root.style.setProperty('--terminal-cursor', themeColors.terminalCursor);
    root.style.setProperty('--terminal-selection', themeColors.terminalSelection);
    root.style.setProperty('--terminal-ansi-black', themeColors.terminalAnsiBlack);
    root.style.setProperty('--terminal-ansi-red', themeColors.terminalAnsiRed);
    root.style.setProperty('--terminal-ansi-green', themeColors.terminalAnsiGreen);
    root.style.setProperty('--terminal-ansi-yellow', themeColors.terminalAnsiYellow);
    root.style.setProperty('--terminal-ansi-blue', themeColors.terminalAnsiBlue);
    root.style.setProperty('--terminal-ansi-magenta', themeColors.terminalAnsiMagenta);
    root.style.setProperty('--terminal-ansi-cyan', themeColors.terminalAnsiCyan);
    root.style.setProperty('--terminal-ansi-white', themeColors.terminalAnsiWhite);
    root.style.setProperty('--terminal-ansi-bright-black', themeColors.terminalAnsiBrightBlack);
    root.style.setProperty('--terminal-ansi-bright-red', themeColors.terminalAnsiBrightRed);
    root.style.setProperty('--terminal-ansi-bright-green', themeColors.terminalAnsiBrightGreen);
    root.style.setProperty('--terminal-ansi-bright-yellow', themeColors.terminalAnsiBrightYellow);
    root.style.setProperty('--terminal-ansi-bright-blue', themeColors.terminalAnsiBrightBlue);
    root.style.setProperty('--terminal-ansi-bright-magenta', themeColors.terminalAnsiBrightMagenta);
    root.style.setProperty('--terminal-ansi-bright-cyan', themeColors.terminalAnsiBrightCyan);
    root.style.setProperty('--terminal-ansi-bright-white', themeColors.terminalAnsiBrightWhite);
    
    // 焦点边框
    root.style.setProperty('--focus-border', themeColors.focusBorder);
    
    // 徽章
    root.style.setProperty('--badge-bg', themeColors.badgeBackground);
    root.style.setProperty('--badge-fg', themeColors.badgeForeground);
    
    // 通知
    root.style.setProperty('--notification-bg', themeColors.notificationBackground);
    root.style.setProperty('--notification-fg', themeColors.notificationForeground);
    root.style.setProperty('--notification-border', themeColors.notificationBorder);
    
    // Diff 编辑器
    root.style.setProperty('--diff-inserted', themeColors.diffInserted);
    root.style.setProperty('--diff-removed', themeColors.diffRemoved);
    root.style.setProperty('--diff-modified', themeColors.diffModified);
    
    // VSCode 兼容变量（用于 Explorer 组件）
    root.style.setProperty('--vscode-sideBar-background', themeColors.sidebarBackground);
    root.style.setProperty('--vscode-sideBar-foreground', themeColors.sidebarForeground);
    root.style.setProperty('--vscode-sideBar-border', themeColors.sidebarBorder);
    root.style.setProperty('--vscode-list-hoverBackground', themeColors.listHoverBackground);
    root.style.setProperty('--vscode-list-hoverForeground', themeColors.listHoverForeground);
    root.style.setProperty('--vscode-list-activeSelectionBackground', themeColors.listActiveBackground);
    root.style.setProperty('--vscode-list-activeSelectionForeground', themeColors.listActiveForeground);
    root.style.setProperty('--vscode-list-focusBackground', themeColors.listFocusBackground);
    root.style.setProperty('--vscode-list-focusForeground', themeColors.listFocusForeground);
    root.style.setProperty('--vscode-scrollbarSlider-background', themeColors.scrollbarThumb);
    root.style.setProperty('--vscode-scrollbarSlider-hoverBackground', themeColors.scrollbarThumbHover);
    root.style.setProperty('--vscode-scrollbarSlider-activeBackground', themeColors.scrollbarThumbHover);
    root.style.setProperty('--vscode-icon-foreground', themeColors.foreground);
    root.style.setProperty('--vscode-foreground', themeColors.foreground);
    root.style.setProperty('--vscode-input-background', themeColors.inputBackground);
    root.style.setProperty('--vscode-input-foreground', themeColors.inputForeground);
    root.style.setProperty('--vscode-input-border', themeColors.inputBorder);
    root.style.setProperty('--vscode-focusBorder', themeColors.focusBorder);
    
    // 编辑器区域变量
    root.style.setProperty('--vscode-editor-background', themeColors.editorBackground);
    root.style.setProperty('--vscode-editor-foreground', themeColors.editorForeground);
    root.style.setProperty('--vscode-editorGroup-border', themeColors.editorGroupBorder);
    root.style.setProperty('--vscode-editorWidget-foreground', themeColors.foreground);
    
    // 标签栏变量
    root.style.setProperty('--vscode-editorGroupHeader-tabsBackground', themeColors.editorGroupHeaderTabsBackground);
    root.style.setProperty('--vscode-editorGroupHeader-tabsBorder', themeColors.tabBorder);
    root.style.setProperty('--vscode-tab-activeBackground', themeColors.tabActiveBackground);
    root.style.setProperty('--vscode-tab-activeForeground', themeColors.tabActiveForeground);
    root.style.setProperty('--vscode-tab-inactiveBackground', themeColors.tabInactiveBackground);
    root.style.setProperty('--vscode-tab-inactiveForeground', themeColors.tabInactiveForeground);
    root.style.setProperty('--vscode-tab-hoverBackground', themeColors.listHoverBackground);
    root.style.setProperty('--vscode-tab-hoverForeground', themeColors.listHoverForeground);
    root.style.setProperty('--vscode-tab-activeBorderTop', themeColors.tabActiveBorderTop);
    root.style.setProperty('--vscode-tab-unfocusedActiveBorderTop', themeColors.tabUnfocusedActiveBorderTop);
    
    // 面包屑变量
    root.style.setProperty('--vscode-breadcrumb-background', themeColors.editorBackground);
    root.style.setProperty('--vscode-breadcrumb-foreground', themeColors.foreground);
    root.style.setProperty('--vscode-breadcrumb-border', themeColors.tabBorder);
    
    // 面板变量
    root.style.setProperty('--vscode-panel-background', themeColors.panelBackground);
    root.style.setProperty('--vscode-panel-border', themeColors.panelBorder);
  };

  /**
   * 颜色调亮工具函数
   */
  const lightenColor = (color: string, amount: number): string => {
    if (color === 'transparent' || !color) return color;
    
    // 简单的颜色调亮（可以使用更复杂的算法）
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.floor((num >> 16) * (1 + amount)));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) * (1 + amount)));
    const b = Math.min(255, Math.floor((num & 0x0000FF) * (1 + amount)));
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  };

  // 监听主题变化事件
  useEffect(() => {
    const handleThemeChange = (_event: any, themeData: ITheme) => {
      console.log('[ThemeContext] 主题变化:', themeData.name);
      setTheme(themeData);
      const newColors = extractColors(themeData);
      setColors(newColors);
      applyThemeColors(newColors, themeData); // 传入 themeData
      
      // ⭐ 背景图片功能已禁用
      // setTimeout(() => {
      //   if ((window as any).backgroundCover) {
      //     const config = (window as any).backgroundCover.getConfig();
      //     if (config.imagePath) {
      //       console.log('[ThemeContext] 主题加载后重新应用背景图片');
      //       (window as any).backgroundCover.applyBackground();
      //     }
      //   }
      // }, 50);
    };

    // 注册 IPC 监听器
    (window as any).electron?.ipcRenderer.on('theme:changed', handleThemeChange);

    // 获取当前主题
    (window as any).electron?.ipcRenderer.invoke('theme:current').then((response: any) => {
      if (response?.success && response.data) {
        handleThemeChange(null, response.data);
      }
    });

    return () => {
      (window as any).electron?.ipcRenderer.removeListener('theme:changed', handleThemeChange);
    };
  }, []);

  // 应用主题
  const applyTheme = async (themeId: string) => {
    try {
      const result = await (window as any).electronAPI?.theme.apply(themeId);
      if (result?.success) {
        console.log('[ThemeContext] 应用主题成功:', themeId);
      }
    } catch (error) {
      console.error('[ThemeContext] 应用主题失败:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, colors, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};