/**
 * 主题类型定义
 * 定义主题系统的核心数据结构
 */

/**
 * 主题类型
 */
export type ThemeType = 'dark' | 'light' | 'hc';

/**
 * Token 颜色设置
 */
export interface ITokenColorSettings {
  foreground?: string;
  background?: string;
  fontStyle?: string;
}

/**
 * Token 颜色配置
 */
export interface ITokenColors {
  name?: string;
  scope: string | string[];
  settings: ITokenColorSettings;
}

/**
 * 主题颜色映射
 * 使用 VSCode 的颜色键名
 */
export interface IThemeColors {
  // 编辑器颜色
  'editor.background'?: string;
  'editor.foreground'?: string;
  'editor.lineHighlightBackground'?: string;
  'editor.selectionBackground'?: string;
  'editor.selectionHighlightBackground'?: string;
  'editor.inactiveSelectionBackground'?: string;
  'editor.wordHighlightBackground'?: string;
  'editor.wordHighlightStrongBackground'?: string;
  'editor.findMatchBackground'?: string;
  'editor.findMatchHighlightBackground'?: string;
  'editor.hoverHighlightBackground'?: string;
  'editor.lineHighlightBorder'?: string;
  'editor.rangeHighlightBackground'?: string;
  'editor.rangeHighlightBorder'?: string;

  // 编辑器光标和行号
  'editorCursor.foreground'?: string;
  'editorCursor.background'?: string;
  'editorLineNumber.foreground'?: string;
  'editorLineNumber.activeForeground'?: string;

  // 编辑器空白字符
  'editorWhitespace.foreground'?: string;
  'editorIndentGuide.background'?: string;
  'editorIndentGuide.activeBackground'?: string;

  // 编辑器装订线
  'editorGutter.background'?: string;
  'editorGutter.modifiedBackground'?: string;
  'editorGutter.addedBackground'?: string;
  'editorGutter.deletedBackground'?: string;

  // 侧边栏
  'sideBar.background'?: string;
  'sideBar.foreground'?: string;
  'sideBar.border'?: string;
  'sideBarTitle.foreground'?: string;
  'sideBarSectionHeader.background'?: string;
  'sideBarSectionHeader.foreground'?: string;
  'sideBarSectionHeader.border'?: string;

  // 活动栏
  'activityBar.background'?: string;
  'activityBar.foreground'?: string;
  'activityBar.border'?: string;
  'activityBar.activeBorder'?: string;
  'activityBar.inactiveForeground'?: string;
  'activityBarBadge.background'?: string;
  'activityBarBadge.foreground'?: string;

  // 状态栏
  'statusBar.background'?: string;
  'statusBar.foreground'?: string;
  'statusBar.border'?: string;
  'statusBar.debuggingBackground'?: string;
  'statusBar.debuggingForeground'?: string;
  'statusBar.noFolderBackground'?: string;
  'statusBar.noFolderForeground'?: string;

  // 标题栏
  'titleBar.activeBackground'?: string;
  'titleBar.activeForeground'?: string;
  'titleBar.inactiveBackground'?: string;
  'titleBar.inactiveForeground'?: string;
  'titleBar.border'?: string;

  // 按钮
  'button.background'?: string;
  'button.foreground'?: string;
  'button.hoverBackground'?: string;

  // 输入框
  'input.background'?: string;
  'input.foreground'?: string;
  'input.border'?: string;
  'input.placeholderForeground'?: string;
  'inputOption.activeBorder'?: string;
  'inputValidation.errorBackground'?: string;
  'inputValidation.errorForeground'?: string;
  'inputValidation.errorBorder'?: string;
  'inputValidation.infoBackground'?: string;
  'inputValidation.infoForeground'?: string;
  'inputValidation.infoBorder'?: string;
  'inputValidation.warningBackground'?: string;
  'inputValidation.warningForeground'?: string;
  'inputValidation.warningBorder'?: string;

  // 下拉框
  'dropdown.background'?: string;
  'dropdown.foreground'?: string;
  'dropdown.border'?: string;

  // 列表和树
  'list.activeSelectionBackground'?: string;
  'list.activeSelectionForeground'?: string;
  'list.inactiveSelectionBackground'?: string;
  'list.inactiveSelectionForeground'?: string;
  'list.hoverBackground'?: string;
  'list.hoverForeground'?: string;
  'list.focusBackground'?: string;
  'list.focusForeground'?: string;
  'list.highlightForeground'?: string;

  // 面板
  'panel.background'?: string;
  'panel.border'?: string;
  'panelTitle.activeBorder'?: string;
  'panelTitle.activeForeground'?: string;
  'panelTitle.inactiveForeground'?: string;

  // 通知
  'notificationCenter.border'?: string;
  'notificationCenterHeader.foreground'?: string;
  'notificationCenterHeader.background'?: string;
  'notificationToast.border'?: string;
  'notifications.foreground'?: string;
  'notifications.background'?: string;
  'notifications.border'?: string;

  // 滚动条
  'scrollbar.shadow'?: string;
  'scrollbarSlider.background'?: string;
  'scrollbarSlider.hoverBackground'?: string;
  'scrollbarSlider.activeBackground'?: string;

  // Badge
  'badge.background'?: string;
  'badge.foreground'?: string;

  // 进度条
  'progressBar.background'?: string;

  // 其他
  'focusBorder'?: string;
  'foreground'?: string;
  'widget.shadow'?: string;
  'selection.background'?: string;
  'descriptionForeground'?: string;
  'errorForeground'?: string;

  // 允许其他自定义颜色
  [key: string]: string | undefined;
}

/**
 * 主题接口
 */
export interface ITheme {
  /** 主题唯一标识 */
  id: string;
  /** 主题显示名称 */
  label: string;
  /** 主题类型 */
  type: ThemeType;
  /** 主题颜色配置 */
  colors: IThemeColors;
  /** Token 颜色配置 */
  tokenColors: ITokenColors[];
  /** 主题描述 */
  description?: string;
  /** 主题作者 */
  author?: string;
  /** 主题来源（扩展ID） */
  extensionId?: string;
}

/**
 * 主题事件类型
 */
export interface IThemeEvents {
  'theme-registered': (theme: ITheme) => void;
  'theme-changed': (theme: ITheme) => void;
  'theme-unregistered': (themeId: string) => void;
}

