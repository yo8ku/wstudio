/**
 * Terminal session wrapper.
 * Keeps the xterm frontend close to the PTY bridge and avoids custom terminal protocol handling.
 */

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

const getTerminalAPI = () => window.electron?.terminal;
const TERMINAL_FONT_FAMILY = 'Consolas, "Courier New", monospace';
const TERMINAL_MIN_COLS = 2;
const TERMINAL_MIN_ROWS = 1;

interface TerminalCreateResult {
  success: boolean;
  terminalId?: string;
  ptyInfo?: {
    backend: 'conpty' | 'winpty';
    buildNumber?: number;
  };
  error?: string;
}

export interface TerminalSessionOptions {
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

const normalizeTerminalDimension = (value: number | undefined, minValue: number): number | null => (
  Number.isFinite(value)
    ? Math.max(minValue, Math.trunc(value as number))
    : null
);

export class TerminalSession {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private container: HTMLElement | null = null;
  private clickFocusHandler: (() => void) | null = null;
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private disposeTerminalDataListener: (() => void) | null = null;
  private disposeTerminalExitListener: (() => void) | null = null;
  private pendingInputBuffer = '';
  private pendingPtySync = false;
  private lastSyncedPtySize: { cols: number; rows: number } | null = null;
  private isDisposed = false;

  public id = '';
  public shell: string;

  constructor(options: TerminalSessionOptions = {}) {
    this.shell = options.shell || 'powershell';
    const initialCols = normalizeTerminalDimension(options.cols, TERMINAL_MIN_COLS) ?? 80;
    const initialRows = normalizeTerminalDimension(options.rows, TERMINAL_MIN_ROWS) ?? 24;

    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 14,
      lineHeight: 1.15,
      theme: {
        background: '#1e1e1e',
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
      cols: initialCols,
      rows: initialRows,
      scrollback: 5000,
      allowTransparency: false,
      overviewRulerWidth: 0,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    this.bindEvents();

    void this.createPtyProcess(options);
  }

  private bindEvents(): void {
    this.terminal.onData((data: string) => {
      this.sendTerminalInput(data);
    });

    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      if (
        event.type === 'keydown'
        && (event.ctrlKey || event.metaKey)
        && !event.altKey
        && event.key.toLowerCase() === 'v'
      ) {
        event.preventDefault();
        void this.handlePaste();
        return false;
      }

      return true;
    });
  }

  private async createPtyProcess(options: TerminalSessionOptions): Promise<void> {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI) {
      console.error('[TerminalSession] terminalAPI unavailable');
      this.terminal.write('\r\nUnable to connect to terminal service.\r\n');
      return;
    }

    try {
      const result = await terminalAPI.create(
        options.cols || 80,
        options.rows || 24,
        options.cwd,
        options.shell
      ) as TerminalCreateResult;

      if (!result.success) {
        console.error('[TerminalSession] failed to create terminal:', result.error);
        this.terminal.write(`\r\nFailed to create terminal: ${result.error}\r\n`);
        return;
      }

      if (this.isDisposed) {
        if (result.terminalId) {
          void terminalAPI.destroy(result.terminalId);
        }
        return;
      }

      this.id = result.terminalId || '';
      if (result.ptyInfo) {
        this.terminal.options.windowsPty = result.ptyInfo;
      }

      this.attachRendererListeners();
      this.flushPendingInput();
      this.syncPtySize();
      console.log(`[TerminalSession] terminal created: ${this.id}`);
    } catch (error) {
      console.error('[TerminalSession] failed to create terminal:', error);
      this.terminal.write(`\r\nFailed to create terminal: ${error}\r\n`);
    }
  }

  private attachRendererListeners(): void {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI || !this.id) {
      return;
    }

    this.disposeRendererListeners();

    this.disposeTerminalDataListener = terminalAPI.onData((terminalId: string, data: string) => {
      if (terminalId === this.id && data) {
        this.terminal.write(data);
      }
    });

    this.disposeTerminalExitListener = terminalAPI.onExit((terminalId: string, exitCode: number) => {
      if (terminalId !== this.id) {
        return;
      }

      console.log(`[TerminalSession] terminal exited: code=${exitCode}`);
      this.terminal.write('\r\n\r\n[Process exited]\r\n');
    });
  }

  private sendTerminalInput(data: string): void {
    if (!data) {
      return;
    }

    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      this.pendingInputBuffer += data;
      return;
    }

    terminalAPI.write(this.id, data);
  }

  private flushPendingInput(): void {
    if (!this.pendingInputBuffer) {
      return;
    }

    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      return;
    }

    const payload = this.pendingInputBuffer;
    this.pendingInputBuffer = '';
    terminalAPI.write(this.id, payload);
  }

  public attachTo(container: HTMLElement): void {
    if (this.container && this.container !== container) {
      this.detach(this.container);
    }

    this.container = container;
    this.syncThemeBackground();

    if (this.terminal.element) {
      container.appendChild(this.terminal.element);
    } else {
      this.terminal.open(container);
    }

    this.fit();
    this.setupContextMenu();

    this.clickFocusHandler = () => {
      this.terminal.focus();
    };
    container.addEventListener('click', this.clickFocusHandler);
    this.terminal.focus();
  }

  private setupContextMenu(): void {
    if (!this.container) {
      return;
    }

    this.contextMenuHandler = (event: MouseEvent) => {
      event.preventDefault();
      const selectedText = this.terminal.getSelection();

      if (selectedText) {
        void this.handleCopy(selectedText);
        return;
      }

      void this.handlePaste();
    };

    this.container.addEventListener('contextmenu', this.contextMenuHandler);
  }

  public detach(expectedContainer?: HTMLElement): void {
    if (expectedContainer && this.container !== expectedContainer) {
      return;
    }

    if (this.container && this.clickFocusHandler) {
      this.container.removeEventListener('click', this.clickFocusHandler);
      this.clickFocusHandler = null;
    }

    if (this.container && this.contextMenuHandler) {
      this.container.removeEventListener('contextmenu', this.contextMenuHandler);
      this.contextMenuHandler = null;
    }

    const terminalElement = this.terminal.element;
    if (this.container && terminalElement?.parentElement === this.container) {
      this.container.removeChild(terminalElement);
    }

    this.container = null;
  }

  private async handlePaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }

      this.sendTerminalInput(text);
    } catch (error) {
      console.error('[TerminalSession] paste failed:', error);
    }
  }

  private async handleCopy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.terminal.clearSelection();
    } catch (error) {
      console.error('[TerminalSession] copy failed:', error);
    }
  }

  public resize(forcePtySync = false): void {
    if (this.fit() || forcePtySync) {
      this.syncPtySize();
    }
  }

  public fit(): boolean {
    if (!this.container) {
      return false;
    }

    this.syncThemeBackground();
    const dimensions = this.fitAddon.proposeDimensions();
    if (!dimensions) {
      return false;
    }

    const nextCols = Math.max(TERMINAL_MIN_COLS, dimensions.cols);
    const nextRows = Math.max(TERMINAL_MIN_ROWS, dimensions.rows);

    if (nextCols === this.terminal.cols && nextRows === this.terminal.rows) {
      return false;
    }

    this.terminal.resize(nextCols, nextRows);
    return true;
  }

  public syncPtySize(): void {
    const cols = this.terminal.cols;
    const rows = this.terminal.rows;

    if (
      this.lastSyncedPtySize
      && this.lastSyncedPtySize.cols === cols
      && this.lastSyncedPtySize.rows === rows
      && !this.pendingPtySync
    ) {
      return;
    }

    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      this.pendingPtySync = true;
      return;
    }

    this.pendingPtySync = false;
    this.lastSyncedPtySize = { cols, rows };
    void terminalAPI.resize(this.id, cols, rows).then((result) => {
      if (!result?.success) {
        this.pendingPtySync = true;
      }
    }).catch(() => {
      this.pendingPtySync = true;
    });
  }

  private syncThemeBackground(): void {
    if (!this.container) {
      return;
    }

    const computedStyles = getComputedStyle(this.container);
    const background =
      computedStyles.getPropertyValue('--ws-panel-background').trim() ||
      computedStyles.backgroundColor ||
      '#1e1e1e';

    this.terminal.options.theme = {
      ...this.terminal.options.theme,
      background,
    };
  }

  public onDataInput(callback: (data: string) => void): void {
    this.terminal.onData(callback);
  }

  public onData(callback: (data: string) => void): { dispose: () => void } {
    return this.terminal.onData(callback);
  }

  public clear(): void {
    this.terminal.clear();

    const terminalAPI = getTerminalAPI();
    if (this.id && terminalAPI?.clear) {
      void terminalAPI.clear(this.id);
    }
  }

  public focus(): void {
    this.terminal.focus();
  }

  private disposeRendererListeners(): void {
    if (this.disposeTerminalDataListener) {
      this.disposeTerminalDataListener();
      this.disposeTerminalDataListener = null;
    }

    if (this.disposeTerminalExitListener) {
      this.disposeTerminalExitListener();
      this.disposeTerminalExitListener = null;
    }
  }

  public dispose(options: { destroyTerminal?: boolean } = {}): void {
    this.isDisposed = true;
    this.detach(this.container ?? undefined);

    this.disposeRendererListeners();

    const terminalAPI = getTerminalAPI();
    const shouldDestroyTerminal = options.destroyTerminal ?? true;
    if (shouldDestroyTerminal && this.id && terminalAPI) {
      void terminalAPI.destroy(this.id);
    }

    this.pendingInputBuffer = '';
    this.pendingPtySync = false;
    this.lastSyncedPtySize = null;
    this.terminal.dispose();
    this.container = null;
  }

  public getTerminal(): Terminal {
    return this.terminal;
  }
}
