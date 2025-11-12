/**
 * 插件系统 - UI类型定义
 * 定义UI系统的接口、组件类型等
 */

/**
 * UI组件类型
 */
export enum UIComponentType {
  /** 侧边栏 */
  Sidebar = 'sidebar',
  /** 面板 */
  Panel = 'panel',
  /** 状态栏 */
  StatusBar = 'statusbar',
  /** 菜单 */
  Menu = 'menu',
  /** 工具栏 */
  Toolbar = 'toolbar',
  /** 对话框 */
  Dialog = 'dialog',
  /** 通知 */
  Notification = 'notification',
  /** Webview */
  Webview = 'webview',
}

/**
 * UI组件位置
 */
export enum UIPosition {
  /** 左侧 */
  Left = 'left',
  /** 右侧 */
  Right = 'right',
  /** 顶部 */
  Top = 'top',
  /** 底部 */
  Bottom = 'bottom',
  /** 中心 */
  Center = 'center',
}

/**
 * UI组件定义
 */
export interface UIComponent {
  /** 组件ID */
  id: string;
  /** 组件类型 */
  type: UIComponentType;
  /** 组件标题 */
  title: string;
  /** 组件图标 */
  icon?: string;
  /** 组件位置 */
  position?: UIPosition;
  /** 组件内容 */
  content?: string | HTMLElement;
  /** 组件优先级 */
  priority?: number;
}

/**
 * 菜单项定义
 */
export interface MenuItem {
  /** 菜单项ID */
  id: string;
  /** 菜单项标题 */
  label: string;
  /** 菜单项命令 */
  command?: string;
  /** 菜单项快捷键 */
  keybinding?: string;
  /** 菜单项图标 */
  icon?: string;
  /** 子菜单 */
  submenu?: MenuItem[];
  /** 分隔符 */
  separator?: boolean;
  /** 显示条件 */
  when?: string;
  /** 菜单组 */
  group?: string;
  /** 排序优先级 */
  order?: number;
}

/**
 * 状态栏项定义
 */
export interface StatusBarItem {
  /** 状态栏项ID */
  id: string;
  /** 状态栏项文本 */
  text: string;
  /** 状态栏项图标 */
  icon?: string;
  /** 状态栏项提示 */
  tooltip?: string;
  /** 状态栏项命令 */
  command?: string;
  /** 状态栏项位置 */
  alignment?: 'left' | 'right';
  /** 状态栏项优先级 */
  priority?: number;
}

/**
 * 通知类型
 */
export enum NotificationType {
  /** 信息 */
  Info = 'info',
  /** 警告 */
  Warning = 'warning',
  /** 错误 */
  Error = 'error',
  /** 成功 */
  Success = 'success',
}

/**
 * 通知定义
 */
export interface Notification {
  /** 通知类型 */
  type: NotificationType;
  /** 通知消息 */
  message: string;
  /** 通知操作 */
  actions?: NotificationAction[];
  /** 自动关闭时间(ms) */
  duration?: number;
}

/**
 * 通知操作
 */
export interface NotificationAction {
  /** 操作标签 */
  label: string;
  /** 操作处理器 */
  handler: () => void;
}

/**
 * 可释放资源接口（UI组件）
 */
export interface UIDisposable {
  dispose(): void;
}

/**
 * UI注册器接口
 */
export interface UIRegistry {
  /** 注册UI组件 */
  registerComponent(component: UIComponent): void;
  /** 取消注册UI组件 */
  unregisterComponent(componentId: string): void;
  /** 注册菜单项 */
  registerMenuItem(item: MenuItem): UIDisposable;
  /** 注册状态栏项 */
  registerStatusBarItem(item: StatusBarItem): StatusBarItem & UIDisposable;
  /** 显示通知 */
  showNotification(notification: Notification): void;
}

