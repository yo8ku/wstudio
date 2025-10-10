/**
 * 快捷键管理器
 * 功能：统一管理应用程序的键盘快捷键
 * 描述：提供快捷键注册、注销和事件处理功能
 */

export interface ShortcutHandler {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: (event: KeyboardEvent) => void;
  description?: string;
}

export class KeyboardShortcutManager {
  private shortcuts: Map<string, ShortcutHandler> = new Map();
  private boundHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * 注册快捷键
   */
  register(shortcut: ShortcutHandler): void {
    const key = this.generateKey(shortcut);
    this.shortcuts.set(key, shortcut);
    console.log(`[KeyboardShortcutManager] 注册快捷键: ${key} - ${shortcut.description || shortcut.id}`);
  }

  /**
   * 注销快捷键
   */
  unregister(id: string): void {
    for (const [key, shortcut] of this.shortcuts.entries()) {
      if (shortcut.id === id) {
        this.shortcuts.delete(key);
        console.log(`[KeyboardShortcutManager] 注销快捷键: ${id}`);
        break;
      }
    }
  }

  /**
   * 生成快捷键唯一标识
   */
  private generateKey(shortcut: ShortcutHandler): string {
    const parts: string[] = [];
    if (shortcut.ctrl) parts.push('ctrl');
    if (shortcut.shift) parts.push('shift');
    if (shortcut.alt) parts.push('alt');
    if (shortcut.meta) parts.push('meta');
    parts.push(shortcut.key.toLowerCase());
    return parts.join('+');
  }

  /**
   * 匹配快捷键
   */
  private matchShortcut(event: KeyboardEvent, shortcut: ShortcutHandler): boolean {
    const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
    const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey); // macOS 使用 metaKey
    const shiftMatch = !!shortcut.shift === event.shiftKey;
    const altMatch = !!shortcut.alt === event.altKey;

    return keyMatch && ctrlMatch && shiftMatch && altMatch;
  }

  /**
   * 处理键盘事件
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    for (const shortcut of this.shortcuts.values()) {
      if (this.matchShortcut(event, shortcut)) {
        event.preventDefault();
        event.stopPropagation();
        console.log(`[KeyboardShortcutManager] 触发快捷键: ${shortcut.id}`);
        shortcut.handler(event);
        break;
      }
    }
  };

  /**
   * 启动监听
   */
  start(): void {
    if (this.boundHandler) {
      console.warn('[KeyboardShortcutManager] 已经在监听中');
      return;
    }

    this.boundHandler = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', this.boundHandler, true);
    console.log('[KeyboardShortcutManager] 开始监听快捷键');
  }

  /**
   * 停止监听
   */
  stop(): void {
    if (this.boundHandler) {
      window.removeEventListener('keydown', this.boundHandler, true);
      this.boundHandler = null;
      console.log('[KeyboardShortcutManager] 停止监听快捷键');
    }
  }

  /**
   * 获取所有已注册的快捷键
   */
  getShortcuts(): ShortcutHandler[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * 清空所有快捷键
   */
  clear(): void {
    this.shortcuts.clear();
    console.log('[KeyboardShortcutManager] 清空所有快捷键');
  }

  /**
   * 销毁管理器
   */
  dispose(): void {
    this.stop();
    this.clear();
    console.log('[KeyboardShortcutManager] 快捷键管理器已销毁');
  }
}

// 导出单例实例
export const shortcutManager = new KeyboardShortcutManager();











































