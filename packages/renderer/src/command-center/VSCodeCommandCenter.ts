/**
 * VS Code 风格的命令中心
 * 
 * 功能：
 * - 多级菜单支持 (>, @, #, :)
 * - 动态前缀切换
 * - 最近使用记录 (MRU)
 * - 命令分类和分组
 * - 模糊搜索
 * - 快捷键显示
 * - 键盘导航
 */

import type { Command, CommandMode, CommandItem, CommandHistory } from './CommandTypes';
import { themeManager } from '@note-studio/core';

const HISTORY_KEY = 'vscode-command-center-history';
const MAX_HISTORY = 20;

export class VSCodeCommandCenter {
  private container: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private list: HTMLElement | null = null;
  private statusBar: HTMLElement | null = null;
  private iconElement: HTMLElement | null = null;
  
  private commands: Map<string, Command> = new Map();
  private modes: Map<string, CommandMode> = new Map();
  private currentMode: CommandMode | null = null;
  private items: CommandItem[] = [];
  private filteredItems: CommandItem[] = [];
  private selectedIndex: number = 0;
  private history: CommandHistory[] = [];
  private isVisible: boolean = false;
  
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private inputHandler: (() => void) | null = null;
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private themeChangeHandler: ((theme?: any) => void) | null = null;

  constructor() {
    this.loadHistory();
    this.registerDefaultModes();
    this.setupThemeListener();
  }
  
  /**
   * 监听主题变化，确保命令中心能正确应用新主题
   */
  private setupThemeListener(): void {
    this.themeChangeHandler = (theme: any) => {
      console.log('[CommandCenter] 收到主题变化事件', {
        isVisible: this.isVisible,
        hasContainer: !!this.container,
        theme: theme?.name || theme
      });
      
      // 无论是否可见都刷新UI，这样下次打开时会使用新主题
      if (this.container) {
        console.log('[CommandCenter] 开始重新挂载面板');
        
        // 等待 CSS 变量应用完成后，重新挂载整个面板
        requestAnimationFrame(() => {
          this.refreshUI();
        });
      }
    };
    
    console.log('[CommandCenter] 设置主题监听器');
    themeManager.on('theme-changed', this.themeChangeHandler);
  }
  
  /**
   * 刷新UI以应用新主题
   * 通过完全重新挂载面板来确保所有 CSS 变量都被重新读取
   */
  private refreshUI(): void {
    if (!this.container) return;
    
    // 保存当前状态
    const currentQuery = this.input?.value || '';
    const currentSelectedIndex = this.selectedIndex;
    
    // 先移除旧的事件监听器
    this.removeEventListeners();
    
    // 移除旧的面板 DOM（保留容器）
    const oldWidget = this.container.querySelector('.command-center-widget');
    if (oldWidget) {
      oldWidget.remove();
    }
    
    // 重新创建 widget HTML
    this.container.innerHTML = `
      <div class="command-center-widget">
        <div class="command-center-header">
          <div class="command-center-input-container">
            <input 
              type="text" 
              class="command-center-input" 
              placeholder="输入命令或搜索..."
              spellcheck="false"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="command-center-list-container">
          <div class="command-center-list"></div>
        </div>
        <div class="command-center-status-bar">
          <span class="status-mode"></span>
          <span class="status-count"></span>
        </div>
      </div>
    `;
    
    // 重新获取元素引用
    this.input = this.container.querySelector('.command-center-input');
    this.list = this.container.querySelector('.command-center-list');
    this.statusBar = this.container.querySelector('.command-center-status-bar');
    this.iconElement = this.container.querySelector('.command-center-icon');
    
    // 恢复状态
    if (this.input) {
      this.input.value = currentQuery;
      this.input.focus();
    }
    
    this.selectedIndex = currentSelectedIndex;
    
    // 重新绑定事件监听器
    this.attachEvents();
    
    // 重新渲染内容
    this.renderList();
    this.updateStatusBar();
    
    console.log('[CommandCenter] 面板已重新挂载，主题已更新');
  }
  
  /**
   * 移除所有事件监听器
   */
  private removeEventListeners(): void {
    if (this.input && this.inputHandler) {
      this.input.removeEventListener('input', this.inputHandler);
    }
    if (this.input && this.keydownHandler) {
      this.input.removeEventListener('keydown', this.keydownHandler);
    }
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
  }

  // ============ 注册方法 ============

  registerCommand(command: Command): void {
    this.commands.set(command.id, command);
  }

  registerCommands(commands: Command[]): void {
    commands.forEach(cmd => this.registerCommand(cmd));
  }

  registerMode(mode: CommandMode): void {
    this.modes.set(mode.prefix, mode);
  }

  // ============ 显示/隐藏 ============

  async show(initialMode: string = '>'): Promise<void> {
    if (this.isVisible) return;

    console.log('[CommandCenter] 显示命令面板');
    this.createDOM();
    this.isVisible = true;

    const mode = this.modes.get(initialMode);
    if (mode) {
      await this.switchMode(mode);
      if (this.input) {
        this.input.value = initialMode;
      }
    }

    this.attachEvents();
    
    setTimeout(() => {
      this.input?.focus();
      if (this.input && this.input.value) {
        const pos = this.input.value.length;
        this.input.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  async hide(confirmed: boolean = false): Promise<void> {
    if (!this.isVisible) return;
    
    // ⭐ 只有在"取消"（非确认）时才调用 onCancel 回调
    if (!confirmed && this.currentMode?.onCancel) {
      console.log('[CommandCenter] 调用模式的 onCancel 回调:', this.currentMode.name);
      await this.currentMode.onCancel();
    }
    
    this.cleanup();
    this.isVisible = false;
  }

  toggle(initialMode?: string): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(initialMode);
    }
  }

  // ============ 默认模式注册 ============

  private registerDefaultModes(): void {
    // 命令模式
    this.registerMode({
      prefix: '>',
      name: 'Commands',
      placeholder: '输入命令名称...',
      icon: '⌘',
      provider: (query) => this.getCommandItems(query)
    });

    // 行号跳转
    this.registerMode({
      prefix: ':',
      name: 'Go to Line',
      placeholder: '输入行号...',
      icon: ':',
      provider: (query) => this.getLineItems(query)
    });
  }

  // ============ 命令提供者 ============

  private async getCommandItems(query: string): Promise<CommandItem[]> {
    const items: CommandItem[] = [];
    const lowerQuery = query.toLowerCase();

    // 获取最近使用的命令
    const recentCommands = this.getRecentCommands();
    const recentItems: CommandItem[] = [];
    const otherItems: CommandItem[] = [];
    
    for (const [id, command] of this.commands) {
      // 检查上下文条件
      if (command.when && !command.when()) continue;

      const matchLabel = command.label.toLowerCase().includes(lowerQuery);
      const matchCategory = command.category?.toLowerCase().includes(lowerQuery);
      const matchDescription = command.description?.toLowerCase().includes(lowerQuery);

      if (!query || matchLabel || matchCategory || matchDescription) {
        const recentIndex = recentCommands.findIndex(h => h.commandId === id);
        const isRecent = recentIndex !== -1;

        const item: CommandItem = {
          id,
          label: command.label,
          displayId: command.displayId,
          description: command.description,
          detail: command.detail,
          icon: command.icon || (isRecent ? '🕐' : '⚡'),
          keybinding: command.keybinding,
          category: command.category,
          value: command,
          alwaysShow: isRecent && !query
        };

        if (isRecent) {
          recentItems.push({ ...item, sortIndex: recentIndex } as any);
        } else {
          otherItems.push(item);
        }
      }
    }

    // 最近使用的命令按使用顺序排序
    recentItems.sort((a: any, b: any) => a.sortIndex - b.sortIndex);
    recentItems.forEach((item: any) => delete item.sortIndex);

    // 为第一个最近使用的命令添加标记
    if (recentItems.length > 0 && !query) {
      (recentItems[0] as any).isFirstRecent = true;
    }

    // 其他命令按名称排序
    otherItems.sort((a, b) => a.label.localeCompare(b.label));

    // 组合结果：只在没有搜索且有最近命令时添加分割线
    if (!query && recentItems.length > 0 && otherItems.length > 0) {
      return [
        ...recentItems,
        {
          id: '__separator__',
          label: '',
          isSeparator: true
        },
        ...otherItems
      ];
    }

    // 有搜索时，最近使用的仍排在前面，但不显示分割线
    return [...recentItems, ...otherItems];
  }

  private async getLineItems(query: string): Promise<CommandItem[]> {
    const match = query.match(/^(\d+)(?::(\d+))?$/);
    if (!match) {
      return [{
        id: 'line-help',
        label: '输入行号 (例如: 42 或 42:10)',
        description: '',
        icon: 'ℹ️',
        value: null
      }];
    }

    const line = parseInt(match[1]);
    const column = match[2] ? parseInt(match[2]) : 1;

    return [{
      id: 'goto-line',
      label: `跳转到第 ${line} 行${column > 1 ? `, 第 ${column} 列` : ''}`,
      description: '',
      icon: '➡️',
      value: { line, column }
    }];
  }

  // ============ 模式切换 ============

  private async switchMode(mode: CommandMode): Promise<void> {
    this.currentMode = mode;
    
    if (this.input) {
      this.input.placeholder = mode.placeholder;
    }
    
    if (this.iconElement) {
      this.iconElement.textContent = mode.icon || '>';
    }
    
    await this.updateItems();
    this.updateStatusBar();
  }

  // ============ 输入处理 ============

  private async handleInput(): Promise<void> {
    if (!this.input) return;

    const value = this.input.value;
    
    // 检查是否切换模式
    const firstChar = value.charAt(0);
    if (this.modes.has(firstChar) && this.currentMode?.prefix !== firstChar) {
      const mode = this.modes.get(firstChar);
      if (mode) {
        await this.switchMode(mode);
      }
    }

    // 更新项目列表
    await this.updateItems();
  }

  private async updateItems(): Promise<void> {
    if (!this.currentMode || !this.input) {
      this.filteredItems = [];
      this.renderList();
      return;
    }

    const value = this.input.value;
    const query = value.startsWith(this.currentMode.prefix)
      ? value.slice(this.currentMode.prefix.length).trim()
      : value.trim();

    this.filteredItems = await this.currentMode.provider(query);
    
    // 对于主题模式且无搜索查询时，自动定位到当前主题
    const shouldAutoScrollToTheme = this.currentMode.prefix === 'theme:' && query === '';
    if (shouldAutoScrollToTheme) {
      const currentThemeIndex = this.filteredItems.findIndex(item => 
        !item.isSeparator && item.alwaysShow && item.icon === '✓'
      );
      if (currentThemeIndex !== -1) {
        this.selectedIndex = currentThemeIndex;
      } else {
        // 确保初始选中的不是分割线
        this.selectedIndex = 0;
        while (this.filteredItems[this.selectedIndex]?.isSeparator && this.selectedIndex < this.filteredItems.length) {
          this.selectedIndex++;
        }
      }
    } else {
      // 确保初始选中的不是分割线
      this.selectedIndex = 0;
      while (this.filteredItems[this.selectedIndex]?.isSeparator && this.selectedIndex < this.filteredItems.length) {
        this.selectedIndex++;
      }
    }
    
    this.renderList();
    this.updateStatusBar();
    
    // 如果需要自动定位到当前主题，立即居中滚动（无动画）
    if (shouldAutoScrollToTheme) {
      this.scrollToSelected(true, true);
    }
  }

  // ============ 渲染 ============

  private renderList(): void {
    if (!this.list) return;

    if (this.filteredItems.length === 0) {
      this.list.innerHTML = `
        <div class="command-item-empty">
          <span class="empty-icon">🔍</span>
          <span class="empty-text">未找到匹配项</span>
        </div>
      `;
      return;
    }

    this.list.innerHTML = '';
    
    this.filteredItems.forEach((item, index) => {
      // 如果是分割线，渲染分割线元素
      if (item.isSeparator) {
        const separatorEl = document.createElement('div');
        separatorEl.className = 'command-item-separator';
        // 如果分隔线有 label，显示在右侧
        if (item.label) {
          separatorEl.setAttribute('data-label', item.label);
        }
        this.list?.appendChild(separatorEl);
        return;
      }

      const itemEl = document.createElement('div');
      // 当前主题使用 alwaysShow 标记
      const isCurrentTheme = item.alwaysShow && item.icon === '✓';
      itemEl.className = `command-item${index === this.selectedIndex ? ' selected' : ''}${isCurrentTheme ? ' current-theme' : ''}`;
      itemEl.dataset.index = index.toString();
      
      const isFirstRecent = (item as any).isFirstRecent;
      
      // 优先使用 displayId，否则使用 id
      const displayIdContent = item.displayId !== undefined ? item.displayId : item.id;
      // 判断是否为主题 ID - 检查所有可能的主题 ID 特征
      const isThemeId = displayIdContent && (
        displayIdContent.includes('-vscode-') || 
        displayIdContent.includes('theme-') || 
        displayIdContent.startsWith('ayu-') || 
        displayIdContent.startsWith('winteriscoming-') || 
        displayIdContent.startsWith('github-') ||
        displayIdContent.startsWith('theme:') ||
        displayIdContent.includes('monokai-pro-') ||
        displayIdContent.includes('night-owl-') ||
        displayIdContent.includes('tokyo-night-') ||
        // 图标主题特征
        displayIdContent.includes(' Icons') ||
        displayIdContent.includes(' icon-theme') ||
        displayIdContent === 'material-icon-theme' ||
        displayIdContent === 'ayu' ||
        // 通用规则：ID 中包含主题扩展特征
        (displayIdContent.match(/-/g) || []).length >= 3 // ID 中有 3 个或更多连字符的视为主题 ID
      );
      const shouldShowId = displayIdContent && displayIdContent !== '__separator__' && !displayIdContent.startsWith('line-') && !displayIdContent.startsWith('goto-') && !isThemeId;
      
      // 判断是否为主题/图标相关的 detail（不显示"当前主题"等描述）
      const isThemeOrIconDetail = item.detail && (
        item.detail === '当前主题' || 
        item.category?.includes('主题') || 
        item.category?.includes('图标') ||
        this.currentMode?.prefix === 'icontheme:'
      );
      
      itemEl.innerHTML = `
        <div class="command-item-content">
          <div class="command-item-label-row">
            <span class="command-item-label">${this.escapeHtml(item.label)}</span>
            <div class="command-item-right">
              ${item.keybinding ? `<span class="command-item-keybinding">${this.escapeHtml(item.keybinding)}</span>` : ''}
              ${isFirstRecent ? '<span class="command-item-recent-badge">最近使用</span>' : ''}
            </div>
          </div>
          ${shouldShowId ? `<div class="command-item-id">${this.escapeHtml(displayIdContent)}</div>` : ''}
          ${item.detail && !isThemeOrIconDetail ? `<div class="command-item-detail">${this.escapeHtml(item.detail)}</div>` : ''}
        </div>
      `;
      
      this.list?.appendChild(itemEl);
    });
  }

  private updateStatusBar(): void {
    if (!this.statusBar) return;

    const modeEl = this.statusBar.querySelector('.status-mode');
    const countEl = this.statusBar.querySelector('.status-count');

    if (modeEl && this.currentMode) {
      modeEl.textContent = this.currentMode.name;
    }

    if (countEl) {
      // 排除分割线
      const actualItemsCount = this.filteredItems.filter(item => !item.isSeparator).length;
      countEl.textContent = `${actualItemsCount} 项`;
    }
  }

  // ============ 事件处理 ============

  private attachEvents(): void {
    if (!this.container || !this.input) return;

    // 输入事件
    this.inputHandler = () => this.handleInput();
    this.input.addEventListener('input', this.inputHandler);

    // 键盘事件
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.hide();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectPrevious();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.executeSelected();
      }
    };
    this.input.addEventListener('keydown', this.keydownHandler);

    // 点击外部区域关闭 (VS Code 风格)
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const widget = this.container?.querySelector('.command-center-widget');
      // 如果点击的不在命令面板内部，则关闭
      if (widget && !widget.contains(target)) {
        this.hide();
      }
    };
    // 延迟添加监听器，避免立即触发
    setTimeout(() => {
      document.addEventListener('click', this.clickHandler!, true);
    }, 100);

    // 点击项目
    this.list?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const itemEl = target.closest('.command-item') as HTMLElement;
      if (itemEl && itemEl.dataset.index) {
        e.stopPropagation(); // 阻止事件冒泡到外部点击处理器
        const index = parseInt(itemEl.dataset.index);
        this.selectedIndex = index;
        this.executeSelected();
      }
    });
  }

  private selectNext(): void {
    if (this.filteredItems.length === 0) return;
    
    let nextIndex = (this.selectedIndex + 1) % this.filteredItems.length;
    // 跳过分割线
    while (this.filteredItems[nextIndex]?.isSeparator) {
      nextIndex = (nextIndex + 1) % this.filteredItems.length;
    }
    this.selectedIndex = nextIndex;
    this.renderList();
    this.scrollToSelected();
    this.previewSelected();
  }

  private selectPrevious(): void {
    if (this.filteredItems.length === 0) return;
    
    let prevIndex = (this.selectedIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    // 跳过分割线
    while (this.filteredItems[prevIndex]?.isSeparator) {
      prevIndex = (prevIndex - 1 + this.filteredItems.length) % this.filteredItems.length;
    }
    this.selectedIndex = prevIndex;
    this.renderList();
    this.scrollToSelected();
    this.previewSelected();
  }

  private scrollToSelected(instant = false, center = false): void {
    if (!this.list) return;
    const selected = this.list.querySelector('.command-item.selected');
    if (selected) {
      selected.scrollIntoView({ 
        block: center ? 'center' : 'nearest', 
        behavior: instant ? 'instant' : 'smooth'
      });
    }
  }

  private async previewSelected(): Promise<void> {
    const item = this.filteredItems[this.selectedIndex];
    if (!item || item.isSeparator) return;

    // 如果有预览回调，执行它
    if (typeof item.onPreview === 'function') {
      try {
        await item.onPreview();
      } catch (error) {
        console.error('[CommandCenter] Preview failed:', error);
      }
    }
  }

  private async executeSelected(): Promise<void> {
    const item = this.filteredItems[this.selectedIndex];
    if (!item || !item.value || item.isSeparator) return;

    // 如果是命令，执行它
    if (item.value && typeof item.value.execute === 'function') {
      this.addToHistory(item.id);
      // ⭐ 传入 true 表示这是"确认"操作，不会触发 onCancel
      await this.hide(true);
      await item.value.execute();
    }
  }

  // ============ 历史记录 ============

  private loadHistory(): void {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      if (data) {
        this.history = JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load command history:', e);
      this.history = [];
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch (e) {
      console.error('Failed to save command history:', e);
    }
  }

  private addToHistory(commandId: string): void {
    const existing = this.history.find(h => h.commandId === commandId);
    if (existing) {
      existing.timestamp = Date.now();
      existing.count++;
    } else {
      this.history.push({
        commandId,
        timestamp: Date.now(),
        count: 1
      });
    }

    // 保留最近的记录
    this.history.sort((a, b) => b.timestamp - a.timestamp);
    this.history = this.history.slice(0, MAX_HISTORY);
    this.saveHistory();
  }

  private getRecentCommands(): CommandHistory[] {
    return this.history.slice(0, 5);
  }

  // ============ DOM 创建和清理 ============

  private createDOM(): void {
    this.container = document.createElement('div');
    this.container.className = 'vscode-command-center';
    this.container.innerHTML = `
      <div class="command-center-widget">
        <div class="command-center-header">
          <div class="command-center-input-container">
            <input 
              type="text" 
              class="command-center-input" 
              placeholder="输入命令或搜索..."
              spellcheck="false"
              autocomplete="off"
            />
          </div>
        </div>
        <div class="command-center-list-container">
          <div class="command-center-list"></div>
        </div>
        <div class="command-center-status-bar">
          <span class="status-mode"></span>
          <span class="status-count"></span>
        </div>
      </div>
    `;

    document.body.appendChild(this.container);

    this.input = this.container.querySelector('.command-center-input');
    this.list = this.container.querySelector('.command-center-list');
    this.statusBar = this.container.querySelector('.command-center-status-bar');
    this.iconElement = this.container.querySelector('.command-center-icon');
  }

  private cleanup(): void {
    if (this.input && this.inputHandler) {
      this.input.removeEventListener('input', this.inputHandler);
    }
    if (this.input && this.keydownHandler) {
      this.input.removeEventListener('keydown', this.keydownHandler);
    }
    
    // 移除全局点击事件监听
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
    
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    this.input = null;
    this.list = null;
    this.statusBar = null;
    this.iconElement = null;
    this.keydownHandler = null;
    this.inputHandler = null;
    this.clickHandler = null;
  }

  // ============ 工具方法 ============

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============ 公共API ============

  public dispose(): void {
    this.hide();
    this.commands.clear();
    this.modes.clear();
    
    // 移除主题变化监听器
    if (this.themeChangeHandler) {
      themeManager.off('theme-changed', this.themeChangeHandler);
      this.themeChangeHandler = null;
    }
  }
}

