/**
 * Terminal service.
 * Hosts PTY instances in the Electron main process and forwards PTY events to renderers.
 */

import * as os from 'os';
import { BrowserWindow } from 'electron';
import { getShellDetector } from './ShellDetector';
import type {
  TerminalDisposable,
  TerminalInstance,
  TerminalOptions,
  TerminalPty,
  TerminalPtyInfo,
} from './types';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MIN_COLS = 2;
const MIN_ROWS = 1;
const TERM_NAME = 'xterm-256color';
const TERM_PROGRAM = 'note-studio';

interface ResolvedLaunchCommand {
  executable: string;
  args: string[];
}

interface NodePtyModule {
  spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string | undefined>;
      encoding?: string | null;
      useConpty?: boolean;
    }
  ): TerminalPty;
}

const NOOP_DISPOSABLE: TerminalDisposable = {
  dispose: () => undefined,
};

let nodePtyModule: NodePtyModule | null = null;

function loadNodePty(): NodePtyModule {
  if (nodePtyModule) {
    return nodePtyModule;
  }

  try {
    nodePtyModule = require('node-pty') as NodePtyModule;
    return nodePtyModule;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `node-pty native module is unavailable. Run "pnpm run rebuild:native" and restart the app. Original error: ${message}`
    );
  }
}

export class TerminalService {
  private terminals: Map<string, TerminalInstance> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private shellDetector = getShellDetector();

  constructor(mainWindow?: BrowserWindow) {
    if (mainWindow) {
      this.mainWindow = mainWindow;
    }
  }

  /** Set the primary window used as a fallback terminal owner. */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /** Generate a stable-enough terminal ID for the session. */
  private generateId(): string {
    return `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /** Parse a shell command string into an executable and argv list. */
  private parseCommandLine(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;
    let escaping = false;

    for (const character of command.trim()) {
      if (escaping) {
        current += character;
        escaping = false;
        continue;
      }

      if (character === '\\' && quote === '"') {
        escaping = true;
        continue;
      }

      if ((character === '"' || character === "'")) {
        if (quote === character) {
          quote = null;
          continue;
        }

        if (!quote) {
          quote = character;
          continue;
        }
      }

      if (!quote && /\s/.test(character)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += character;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /** Resolve the launch command, preferring explicit user input and falling back to the default shell. */
  private resolveLaunchCommand(shell?: string): ResolvedLaunchCommand {
    if (shell && shell.trim()) {
      const tokens = this.parseCommandLine(shell);
      if (tokens.length > 0) {
        const [executable, ...args] = tokens;
        return { executable, args };
      }
    }

    const defaultShell = this.shellDetector.getDefaultShell();
    return {
      executable: defaultShell.path,
      args: defaultShell.args ?? [],
    };
  }

  /** Normalize PTY dimensions. */
  private normalizeDimension(value: number | undefined, fallbackValue: number, minValue: number): number {
    if (!Number.isFinite(value)) {
      return fallbackValue;
    }

    return Math.max(minValue, Math.trunc(value as number));
  }

  /** Build the environment passed to node-pty. */
  private buildSpawnEnv(extraEnv?: Record<string, string>): Record<string, string> {
    const env: Record<string, string> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') {
        env[key] = value;
      }
    }

    if (extraEnv) {
      for (const [key, value] of Object.entries(extraEnv)) {
        env[key] = value;
      }
    }

    env.TERM = env.TERM || TERM_NAME;
    env.COLORTERM = env.COLORTERM || 'truecolor';
    env.TERM_PROGRAM = env.TERM_PROGRAM || TERM_PROGRAM;
    env.TERM_PROGRAM_VERSION = env.TERM_PROGRAM_VERSION || '1.0.0';

    return env;
  }

  /** Read the Windows build number for frontend compatibility heuristics. */
  private getWindowsBuildNumber(): number | undefined {
    if (process.platform !== 'win32') {
      return undefined;
    }

    const segments = os.release().split('.');
    const buildSegment = segments[segments.length - 1];
    const buildNumber = Number.parseInt(buildSegment ?? '', 10);

    return Number.isFinite(buildNumber) ? buildNumber : undefined;
  }

  /** Infer PTY compatibility metadata for the renderer. */
  private getPtyInfo(): TerminalPtyInfo | undefined {
    if (process.platform !== 'win32') {
      return undefined;
    }

    const buildNumber = this.getWindowsBuildNumber();
    return {
      backend: buildNumber && buildNumber >= 18309 ? 'conpty' : 'winpty',
      buildNumber,
    };
  }

  /** Build node-pty options for the current platform. */
  private createPty(
    launchCommand: ResolvedLaunchCommand,
    cwd: string,
    cols: number,
    rows: number,
    env: Record<string, string>
  ): TerminalPty {
    const { spawn } = loadNodePty();
    const ptyInfo = this.getPtyInfo();

    return spawn(launchCommand.executable, launchCommand.args, {
      name: TERM_NAME,
      cols,
      rows,
      cwd,
      env,
      encoding: 'utf8',
      useConpty: process.platform === 'win32' ? ptyInfo?.backend === 'conpty' : undefined,
    });
  }

  /** Create a terminal backed by node-pty. */
  createTerminal(options: TerminalOptions = {}): TerminalInstance {
    const id = this.generateId();
    const ownerWebContentsId = Number.isInteger(options.ownerWebContentsId)
      ? options.ownerWebContentsId
      : this.mainWindow?.webContents.id;
    const cols = this.normalizeDimension(options.cols, DEFAULT_COLS, MIN_COLS);
    const rows = this.normalizeDimension(options.rows, DEFAULT_ROWS, MIN_ROWS);
    const cwd = options.cwd || this.shellDetector.getHomeDirectory();
    const launchCommand = this.resolveLaunchCommand(options.shell);
    const ptyInfo = this.getPtyInfo();
    const shellDescription = [launchCommand.executable, ...launchCommand.args].join(' ').trim();

    try {
      const pty = this.createPty(
        launchCommand,
        cwd,
        cols,
        rows,
        this.buildSpawnEnv(options.env)
      );

      const instance: TerminalInstance = {
        id,
        pty,
        shell: shellDescription,
        cwd,
        createdAt: Date.now(),
        ownerWebContentsId,
        ptyInfo,
        dataListener: NOOP_DISPOSABLE,
        exitListener: NOOP_DISPOSABLE,
      };

      this.terminals.set(id, instance);

      instance.dataListener = pty.onData((data: string) => {
        this.sendToRenderer('terminal:data', id, data);
      });

      instance.exitListener = pty.onExit(({ exitCode, signal }) => {
        this.sendToRenderer('terminal:exit', id, exitCode);
        this.disposeTerminalInstance(id);
        console.log(`[TerminalService] terminal exited: id=${id}, code=${exitCode}, signal=${signal ?? 'none'}`);
      });

      console.log(`[TerminalService] terminal created: id=${id}, owner=${ownerWebContentsId ?? 'unknown'}`);
      return instance;
    } catch (error) {
      console.error('[TerminalService] failed to create terminal:', error);
      throw error;
    }
  }

  /** Resolve a tracked terminal instance or throw. */
  private getTerminalOrThrow(id: string): TerminalInstance {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      throw new Error(`Terminal not found: ${id}`);
    }

    return terminal;
  }

  /** Dispose terminal listeners and remove bookkeeping for an instance. */
  private disposeTerminalInstance(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return;
    }

    terminal.dataListener.dispose();
    terminal.exitListener.dispose();
    this.terminals.delete(id);
  }

  /** Resolve the target window that should receive PTY events. */
  private resolveTargetWindow(terminalId: string): BrowserWindow | null {
    const terminal = this.terminals.get(terminalId);
    const ownerWebContentsId = terminal?.ownerWebContentsId;

    if (typeof ownerWebContentsId === 'number') {
      const ownerWindow = BrowserWindow.getAllWindows().find(
        (window) => !window.isDestroyed() && window.webContents.id === ownerWebContentsId
      );
      if (ownerWindow) {
        return ownerWindow;
      }
    }

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) || null;
  }

  /** Send a terminal event to the owning renderer process. */
  private sendToRenderer(channel: string, terminalId: string, ...args: unknown[]): void {
    try {
      const targetWindow = this.resolveTargetWindow(terminalId);
      if (!targetWindow || targetWindow.isDestroyed() || targetWindow.webContents.isDestroyed()) {
        return;
      }

      targetWindow.webContents.send(channel, terminalId, ...args);
    } catch (error) {
      console.debug('[TerminalService] failed to forward terminal event:', error);
    }
  }

  /** Write user input into the PTY. */
  writeToTerminal(id: string, data: string): void {
    if (!data) {
      return;
    }

    this.getTerminalOrThrow(id).pty.write(data);
  }

  /** Resize the backing PTY. */
  resizeTerminal(id: string, cols: number, rows: number): void {
    const nextCols = this.normalizeDimension(cols, DEFAULT_COLS, MIN_COLS);
    const nextRows = this.normalizeDimension(rows, DEFAULT_ROWS, MIN_ROWS);
    this.getTerminalOrThrow(id).pty.resize(nextCols, nextRows);
  }

  /** Clear the PTY buffer when supported by the backend. */
  clearTerminal(id: string): void {
    this.getTerminalOrThrow(id).pty.clear();
  }

  /** Reassign terminal ownership to another renderer window. */
  reassignTerminalOwner(id: string, ownerWebContentsId: number): boolean {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return false;
    }

    terminal.ownerWebContentsId = ownerWebContentsId;
    console.log(`[TerminalService] terminal owner updated: id=${id}, owner=${ownerWebContentsId}`);
    return true;
  }

  /** Destroy a terminal instance. */
  destroyTerminal(id: string): void {
    const terminal = this.getTerminalOrThrow(id);

    this.disposeTerminalInstance(id);
    terminal.pty.kill();
    console.log(`[TerminalService] terminal destroyed: ${id}`);
  }

  /** Return all tracked terminal IDs. */
  getAllTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /** Return the current tracked terminal count. */
  getTerminalCount(): number {
    return this.terminals.size;
  }

  /** Destroy all tracked terminals. */
  destroyAll(): void {
    for (const id of Array.from(this.terminals.keys())) {
      try {
        this.destroyTerminal(id);
      } catch (error) {
        console.error(`[TerminalService] failed to destroy terminal: ${id}`, error);
      }
    }

    console.log('[TerminalService] all terminals destroyed');
  }
}
