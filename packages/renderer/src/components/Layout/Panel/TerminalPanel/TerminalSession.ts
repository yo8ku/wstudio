/**
 * 终端会话管理类（渲染进程）
 * 功能：封装 xterm.js 终端实例，通过 IPC 与主进程的 PTY 通信
 */

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

// 使用通过 preload.js 暴露的终端 API
const getTerminalAPI = () => window.electron?.terminal;

export interface TerminalSessionOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

export class TerminalSession {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private container: HTMLElement | null = null;
  private cursorBlinkInterval: ReturnType<typeof setInterval> | null = null;
  private isComposing: boolean = false;
  
  public id: string = '';
  public shell: string;
  
  // 命令历史
  private commandHistory: string[] = [];
  private historyIndex: number = -1;
  private currentLine: string = '';

  constructor(options: TerminalSessionOptions = {}) {
    this.shell = options.shell || 'powershell';
    
    // 创建 xterm.js 终端实例
    this.terminal = new Terminal({
      cursorBlink: false, // 禁用原生闪烁，使用自定义实现
      cursorStyle: 'block',
      fontSize: 14,
      theme: {
        background: '#00000000',
        foreground: '#cccccc',
        cursor: '#ffffff',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#ffffff',
      },
      cols: options.cols || 80,
      rows: options.rows || 24,
      scrollback: 5000, // 滚动缓冲区大小（可查看历史行数）
      // 启用右键粘贴
      rightClickSelectsWord: false,
      // 允许写入剪贴板
      allowTransparency: true,
    });

    // 加载插件
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    // 通过 IPC 创建主进程的 PTY
    this.createPtyProcess(options);

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 通过 IPC 创建主进程的 PTY 进程
   */
  private async createPtyProcess(options: TerminalSessionOptions): Promise<void> {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI) {
      console.error('[TerminalSession] terminalAPI 未定义');
      this.terminal.write('\r\n错误：无法连接到主进程\r\n');
      return;
    }

    try {
      const result = await terminalAPI.create(
        options.cols || 80,
        options.rows || 24,
        options.cwd
      );

      if (result.success) {
        this.id = result.terminalId || '';
        console.log(`[TerminalSession] 终端创建成功: ${this.id}`);
        
        // 监听主进程的 PTY 输出
        terminalAPI.onData((terminalId: string, data: string) => {
          if (terminalId === this.id) {
            this.terminal.write(data);
          }
        });

        // 监听 PTY 退出
        terminalAPI.onExit((terminalId: string, exitCode: number) => {
          if (terminalId === this.id) {
            console.log(`[TerminalSession] PTY 进程退出: code=${exitCode}`);
            this.terminal.write('\r\n\r\n[进程已退出]\r\n');
          }
        });
      } else {
        console.error(`[TerminalSession] 创建终端失败:`, result.error);
        this.terminal.write(`\r\n创建终端失败: ${result.error}\r\n`);
      }
    } catch (error) {
      console.error(`[TerminalSession] 创建终端异常:`, error);
      this.terminal.write(`\r\n创建终端异常: ${error}\r\n`);
    }
  }

  /**
   * 绑定事件
   */
  private bindEvents(): void {
    // xterm.js 输入 -> 主进程 PTY (通过 IPC)
    this.terminal.onData((data: string) => {
      const terminalAPI = getTerminalAPI();
      if (this.id && terminalAPI) {
        terminalAPI.write(this.id, data);
        
        // 记录当前行输入（用于历史记录）
        if (data === '\r') {
          // 回车键：保存命令到历史
          if (this.currentLine.trim()) {
            this.addToHistory(this.currentLine);
          }
          this.currentLine = '';
          this.historyIndex = -1;
        } else if (data === '\x7F' || data === '\b') {
          // 退格键：删除最后一个字符
          this.currentLine = this.currentLine.slice(0, -1);
        } else if (data >= ' ' && data <= '~') {
          // 可打印字符：添加到当前行
          this.currentLine += data;
        }
      }
    });

    // 处理粘贴快捷键（不拦截箭头键，让 shell 自己处理历史）
    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // 拦截 Ctrl+V / Cmd+V，手动处理粘贴
      if ((event.ctrlKey || event.metaKey) && event.key === 'v' && event.type === 'keydown') {
        event.preventDefault();
        this.handlePaste();
        return false;
      }
      
      // 让所有其他按键（包括箭头键）正常传递给 PTY
      return true;
    });
  }

  /**
   * 挂载到 DOM
   */
  public attachTo(container: HTMLElement): void {
    this.container = container;
    this.terminal.open(container);
    this.fitAddon.fit();
    
    // 在终端打开后，绑定右键粘贴事件
    this.setupContextMenuPaste();
    
    // 设置输入法编辑时隐藏光标
    this.setupIMECursorHiding();
    
    // 设置光标样式为竖线
    this.terminal.write('\x1b[6 q'); // DECSCUSR: 6 = 竖线闪烁
    
    // 启动光标闪烁
    this.startCursorBlink();
    
    // 聚焦终端
    this.terminal.focus();
    
    // 点击容器时聚焦终端
    container.addEventListener('click', () => {
      this.terminal.focus();
    });
  }

  /**
   * 启动光标闪烁
   */
  private startCursorBlink(): void {
    let visible = true;
    
    this.cursorBlinkInterval = setInterval(() => {
      // 输入法编辑时不闪烁，保持隐藏
      if (this.isComposing) {
        this.terminal.write('\x1b[?25l'); // 隐藏光标
        return;
      }
      
      visible = !visible;
      if (visible) {
        this.terminal.write('\x1b[?25h'); // 显示光标
      } else {
        this.terminal.write('\x1b[?25l'); // 隐藏光标
      }
    }, 530); // 闪烁间隔
  }

  /**
   * 设置光标透明度（已废弃）
   */
  private setCursorOpacity(_opacity: number): void {
    // 不再使用
  }

  /**
   * 设置输入法编辑时隐藏光标
   */
  private setupIMECursorHiding(): void {
    const textarea = this.container?.querySelector('.xterm-helper-textarea');
    if (!textarea || !this.container) return;
    
    // 输入法开始编辑时隐藏光标
    textarea.addEventListener('compositionstart', () => {
      this.isComposing = true;
      this.setCursorOpacity(0);
    });
    
    // 输入法结束编辑时显示光标
    textarea.addEventListener('compositionend', () => {
      this.isComposing = false;
    });
  }

  /**
   * 处理粘贴（从剪贴板读取并写入终端）
   */
  private async handlePaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const terminalAPI = getTerminalAPI();
        if (this.id && terminalAPI) {
          terminalAPI.write(this.id, text);
        }
      }
    } catch (error) {
      console.error('[TerminalSession] 粘贴失败:', error);
    }
  }

  /**
   * 设置右键智能复制/粘贴
   * - 有选中文本：复制
   * - 无选中文本：粘贴
   */
  private setupContextMenuPaste(): void {
    if (!this.container) return;

    // 监听右键点击
    this.container.addEventListener('contextmenu', (event: MouseEvent) => {
      event.preventDefault();
      
      // 检查是否有选中的文本
      const selectedText = this.terminal.getSelection();
      
      if (selectedText && selectedText.length > 0) {
        // 有选中文本：复制到剪贴板
        this.handleCopy(selectedText);
      } else {
        // 无选中文本：粘贴
        this.handlePaste();
      }
    });
  }

  /**
   * 处理复制（将选中文本写入剪贴板）
   */
  private async handleCopy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      console.log('[TerminalSession] 已复制到剪贴板');
      // 复制成功后清除选择
      this.terminal.clearSelection();
    } catch (error) {
      console.error('[TerminalSession] 复制失败:', error);
    }
  }

  /**
   * 调整大小
   */
  public resize(): void {
    if (this.container) {
      this.fitAddon.fit();
      const terminalAPI = getTerminalAPI();
      if (this.id && terminalAPI) {
        terminalAPI.resize(this.id, this.terminal.cols, this.terminal.rows);
      }
    }
  }

  /**
   * 写入数据
   */
  public write(data: string): void {
    this.terminal.write(data);
  }

  /**
   * 监听终端数据输入
   */
  public onDataInput(callback: (data: string) => void): void {
    this.terminal.onData(callback);
  }

  /**
   * 监听终端数据（包括输入和输出）
   * 返回一个 Disposable 对象，调用其 dispose() 方法可以取消监听
   */
  public onData(callback: (data: string) => void): { dispose: () => void } {
    return this.terminal.onData(callback);
  }

  /**
   * 添加命令到历史记录
   */
  private addToHistory(command: string): void {
    // 避免重复添加相同的命令
    if (this.commandHistory[this.commandHistory.length - 1] !== command) {
      this.commandHistory.push(command);
      // 限制历史记录数量（最多保留 1000 条）
      if (this.commandHistory.length > 1000) {
        this.commandHistory.shift();
      }
    }
  }

  /**
   * 浏览历史命令（上下箭头键）
   */
  private navigateHistory(direction: 'up' | 'down'): void {
    if (this.commandHistory.length === 0) return;

    if (direction === 'up') {
      // 向上箭头：向历史记录前面浏览
      if (this.historyIndex === -1) {
        this.historyIndex = this.commandHistory.length - 1;
      } else if (this.historyIndex > 0) {
        this.historyIndex--;
      }
    } else {
      // 向下箭头：向历史记录后面浏览
      if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
      } else {
        // 已经在最后，清空输入
        this.historyIndex = -1;
        this.clearCurrentLine();
        return;
      }
    }

    if (this.historyIndex >= 0) {
      const command = this.commandHistory[this.historyIndex];
      this.replaceCurrentLine(command);
    }
  }

  /**
   * 替换当前行的内容
   */
  private replaceCurrentLine(newText: string): void {
    // 清除当前行
    this.clearCurrentLine();
    
    // 写入新内容
    const terminalAPI = getTerminalAPI();
    if (this.id && terminalAPI) {
      terminalAPI.write(this.id, newText);
    }
    
    this.currentLine = newText;
  }

  /**
   * 清除当前行
   */
  private clearCurrentLine(): void {
    if (this.currentLine.length > 0) {
      const terminalAPI = getTerminalAPI();
      if (this.id && terminalAPI) {
        // 发送退格键删除当前行
        for (let i = 0; i < this.currentLine.length; i++) {
          terminalAPI.write(this.id, '\b \b');
        }
      }
    }
    this.currentLine = '';
  }

  /**
   * 获取命令历史记录
   */
  public getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  /**
   * 清除终端
   */
  public clear(): void {
    this.terminal.clear();
  }

  /**
   * 聚焦
   */
  public focus(): void {
    this.terminal.focus();
  }

  /**
   * 销毁终端
   */
  public dispose(): void {
    // 停止光标闪烁
    if (this.cursorBlinkInterval) {
      clearInterval(this.cursorBlinkInterval);
      this.cursorBlinkInterval = null;
    }
    
    const terminalAPI = getTerminalAPI();
    if (this.id && terminalAPI) {
      terminalAPI.destroy(this.id);
    }
    this.terminal.dispose();
  }

  /**
   * 获取终端实例（用于高级操作）
   */
  public getTerminal(): Terminal {
    return this.terminal;
  }
}

