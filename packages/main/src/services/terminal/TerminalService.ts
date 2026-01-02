/**
 * 终端服务（主进程）
 * 功能：管理 PTY 代理进程，处理终端的创建、销毁和通信
 * 描述：通过 pty-proxy 二进制工具实现真正的伪终端功能
 */

import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getShellDetector } from './ShellDetector';
import type { TerminalOptions, TerminalInstance } from './types';

/** PTY 代理命令 */
interface PtyCommand {
  type: 'create' | 'write' | 'resize' | 'close';
  shell?: string;
  cwd?: string;
  data?: string;
  cols?: number;
  rows?: number;
}

/** PTY 代理响应 */
interface PtyResponse {
  type: 'created' | 'data' | 'exit' | 'closed' | 'error';
  data?: string;
  code?: number;
  success?: boolean;
  error?: string;
}

export class TerminalService {
  private terminals: Map<string, TerminalInstance> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private shellDetector = getShellDetector();
  private proxyPath: string;

  constructor(mainWindow?: BrowserWindow) {
    if (mainWindow) {
      this.mainWindow = mainWindow;
    }
    this.proxyPath = this.getProxyPath();
  }

  /** 获取 PTY 代理路径 */
  private getProxyPath(): string {
    const platform = process.platform;
    const isDev = process.env.NODE_ENV === 'development';
    
    let basePath: string;
    if (isDev) {
      basePath = path.join(process.cwd(), 'resources', 'bin');
    } else {
      basePath = path.join(process.resourcesPath, 'bin');
    }

    const platformDir = platform === 'win32' ? 'win32' : platform === 'darwin' ? 'darwin' : 'linux';
    const exeName = platform === 'win32' ? 'pty-proxy.exe' : 'pty-proxy';
    
    return path.join(basePath, platformDir, exeName);
  }

  /** 设置主窗口 */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /** 生成终端 ID */
  private generateId(): string {
    return `terminal-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /** 创建新终端 */
  createTerminal(options: TerminalOptions = {}): string {
    const id = this.generateId();

    // 检查代理是否存在
    if (!fs.existsSync(this.proxyPath)) {
      console.error(`[TerminalService] PTY 代理不存在: ${this.proxyPath}`);
      throw new Error('PTY 代理未找到');
    }

    try {
      const proxyProcess = spawn(this.proxyPath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env }, // 继承系统环境变量
      });

      // 保存终端实例
      this.terminals.set(id, {
        id,
        process: proxyProcess,
        shell: options.shell || 'powershell.exe',
        createdAt: Date.now(),
      });

      // 监听代理输出
      let buffer = '';
      proxyProcess.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            this.handleProxyResponse(id, line.trim());
          }
        }
      });

      // 监听错误
      proxyProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[TerminalService] 代理错误: ${data.toString()}`);
      });

      // 监听退出
      proxyProcess.on('exit', (code: number | null) => {
        console.log(`[TerminalService] 代理退出: id=${id}, code=${code}`);
        this.terminals.delete(id);
      });

      // 发送创建命令
      const shellConfig = this.shellDetector.getDefaultShell();
      this.sendCommand(id, {
        type: 'create',
        shell: options.shell || shellConfig.path,
        cwd: options.cwd || this.shellDetector.getHomeDirectory(),
        cols: options.cols || 80,
        rows: options.rows || 24,
      });

      console.log(`[TerminalService] 终端创建成功: id=${id}`);
      return id;
    } catch (error) {
      console.error('[TerminalService] 创建终端失败:', error);
      throw error;
    }
  }

  /** 处理代理响应 */
  private handleProxyResponse(id: string, line: string): void {
    try {
      const response: PtyResponse = JSON.parse(line);
      
      switch (response.type) {
        case 'data':
          if (response.data) {
            this.sendToRenderer('terminal:data', id, response.data);
          }
          break;
        case 'exit':
          this.sendToRenderer('terminal:exit', id, response.code || 0);
          this.terminals.delete(id);
          break;
        case 'error':
          console.error(`[TerminalService] 代理错误: ${response.error}`);
          break;
      }
    } catch (error) {
      console.debug('[TerminalService] 解析响应失败:', line);
    }
  }

  /** 发送命令到代理 */
  private sendCommand(id: string, command: PtyCommand): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    const data = JSON.stringify(command) + '\n';
    terminal.process.stdin?.write(data);
  }

  /** 向渲染进程发送消息 */
  private sendToRenderer(channel: string, ...args: unknown[]): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(channel, ...args);
      }
    } catch (error) {
      console.debug('[TerminalService] 发送消息失败:', error);
    }
  }

  /** 写入数据到终端 */
  writeToTerminal(id: string, data: string): void {
    this.sendCommand(id, { type: 'write', data });
  }

  /** 调整终端大小 */
  resizeTerminal(id: string, cols: number, rows: number): void {
    this.sendCommand(id, { type: 'resize', cols, rows });
  }

  /** 销毁终端 */
  destroyTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) return;

    this.sendCommand(id, { type: 'close' });
    
    setTimeout(() => {
      if (terminal.process && !terminal.process.killed) {
        terminal.process.kill();
      }
      this.terminals.delete(id);
    }, 500);

    console.log(`[TerminalService] 终端已销毁: ${id}`);
  }

  /** 获取所有终端 ID */
  getAllTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /** 获取终端数量 */
  getTerminalCount(): number {
    return this.terminals.size;
  }

  /** 销毁所有终端 */
  destroyAll(): void {
    for (const [id] of this.terminals) {
      this.destroyTerminal(id);
    }
    console.log('[TerminalService] 所有终端已销毁');
  }
}
