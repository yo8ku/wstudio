/**
 * 终端服务（主进程）
 * 功能：管理 PTY 进程，处理终端相关的 IPC 请求
 */

import * as pty from 'node-pty';
import * as os from 'os';
import { BrowserWindow } from 'electron';

export interface TerminalOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

interface TerminalInstance {
  id: string;
  ptyProcess: pty.IPty;
  shell: string;
}

export class TerminalService {
  private terminals: Map<string, TerminalInstance> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow?: BrowserWindow) {
    if (mainWindow) {
      this.mainWindow = mainWindow;
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 检测系统默认 Shell
   */
  private detectDefaultShell(): string {
    const platform = os.platform();
    
    if (platform === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    } else if (platform === 'darwin') {
      return process.env.SHELL || '/bin/zsh';
    } else {
      return process.env.SHELL || '/bin/bash';
    }
  }

  /**
   * 创建新终端
   */
  public createTerminal(options: TerminalOptions = {}): string {
    const id = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const shell = options.shell || this.detectDefaultShell();
    const platform = os.platform();
    const isWindows = platform === 'win32';
    
    try {
      // 准备环境变量，启用 ANSI 颜色支持
      const env = {
        ...process.env,
        ...options.env,
        // 强制启用 ANSI 颜色（Windows）
        FORCE_COLOR: '1',
        // PowerShell 使用 UTF-8 编码
        PYTHONIOENCODING: 'utf-8',
        // 确保终端类型支持颜色
        TERM: 'xterm-256color',
        // Windows 10+ 原生支持 ANSI
        ANSICON: '1',
      } as { [key: string]: string };
      
      // 准备 Shell 参数（禁止版权信息）
      const shellArgs: string[] = [];
      if (shell.toLowerCase().includes('powershell')) {
        // PowerShell: -NoLogo 禁止版权信息
        shellArgs.push('-NoLogo');
      }
      
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: options.cwd || process.env.HOME || process.env.USERPROFILE || os.homedir(),
        env,
        useConpty: isWindows,
        // Windows ConPTY 配置
        conptyInheritCursor: isWindows,
      });

      // PTY 输出 -> 渲染进程
      ptyProcess.onData((data: string) => {
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('terminal:data', id, data);
          }
        } catch (error) {
          // 忽略 EPIPE 等管道错误（终端已关闭）
          console.debug(`[TerminalService] 数据发送失败 (终端可能已关闭): ${id}`, error);
        }
      });

      // PTY 退出
      ptyProcess.onExit((e: { exitCode: number; signal?: number }) => {
        console.log(`[TerminalService] PTY 进程退出: id=${id}, code=${e.exitCode}, signal=${e.signal}`);
        try {
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('terminal:exit', id, e.exitCode);
          }
        } catch (error) {
          console.debug(`[TerminalService] 退出通知发送失败: ${id}`, error);
        }
        this.terminals.delete(id);
      });

      this.terminals.set(id, { id, ptyProcess, shell });
      console.log(`[TerminalService] 创建终端成功: id=${id}, shell=${shell}`);
      
      return id;
    } catch (error) {
      console.error(`[TerminalService] 创建终端失败:`, error);
      throw error;
    }
  }

  /**
   * 写入数据到终端
   */
  public writeToTerminal(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.ptyProcess.write(data);
      } catch (error) {
        // 忽略 EPIPE 等管道错误（终端已关闭）
        console.debug(`[TerminalService] 数据写入失败 (终端可能已关闭): ${id}`, error);
        // 清理已失效的终端
        this.terminals.delete(id);
      }
    } else {
      console.warn(`[TerminalService] 终端不存在: ${id}`);
    }
  }

  /**
   * 调整终端大小
   */
  public resizeTerminal(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.ptyProcess.resize(cols, rows);
      } catch (error) {
        // 忽略调整大小错误（终端可能已关闭）
        console.debug(`[TerminalService] 调整大小失败 (终端可能已关闭): ${id}`, error);
        // 清理已失效的终端
        this.terminals.delete(id);
      }
    }
  }

  /**
   * 销毁终端
   */
  public destroyTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      try {
        terminal.ptyProcess.kill();
      } catch (error) {
        // 忽略销毁错误（进程可能已退出）
        console.debug(`[TerminalService] 销毁终端时出错 (进程可能已退出): ${id}`, error);
      }
      this.terminals.delete(id);
      console.log(`[TerminalService] 终端已销毁: ${id}`);
    }
  }

  /**
   * 获取所有终端 ID
   */
  public getAllTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * 销毁所有终端
   */
  public destroyAll(): void {
    this.terminals.forEach((terminal) => {
      try {
        terminal.ptyProcess.kill();
      } catch (error) {
        // 忽略销毁错误（进程可能已退出）
        console.debug(`[TerminalService] 销毁终端时出错: ${terminal.id}`, error);
      }
    });
    this.terminals.clear();
    console.log(`[TerminalService] 所有终端已销毁`);
  }
}

