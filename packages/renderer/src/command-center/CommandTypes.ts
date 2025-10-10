/**
 * 命令中心类型定义
 * 
 * 功能：
 * - 定义命令、模式、历史记录等核心类型
 * - 支持多级菜单和动态前缀切换
 */

export interface Command {
  id: string;
  label: string;
  displayId?: string; // 用于显示的友好 ID，如 "Preferences: Color Theme"
  description?: string;
  detail?: string;
  icon?: string;
  category?: string;
  keybinding?: string;
  execute: () => void | Promise<void>;
  when?: () => boolean;
}

export interface CommandMode {
  prefix: string;
  name: string;
  placeholder: string;
  icon?: string;
  provider: (query: string) => Promise<CommandItem[]> | CommandItem[];
  onCancel?: () => void | Promise<void>; // 取消时的回调（ESC 或点击外部时触发）
}

export interface CommandItem {
  id: string;
  label: string;
  displayId?: string; // 用于显示的友好 ID，如 "Preferences: Color Theme"
  description?: string;
  detail?: string;
  icon?: string;
  keybinding?: string;
  value?: any;
  alwaysShow?: boolean;
  category?: string;
  isSeparator?: boolean; // 用于显示分割线
  onPreview?: () => void | Promise<void>; // 预览回调（导航时触发）
}

export interface CommandHistory {
  commandId: string;
  timestamp: number;
  count: number;
}

