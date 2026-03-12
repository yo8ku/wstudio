/**
 * Terminal session wrapper.
 * Manages the xterm instance, PTY communication, and terminal sizing.
 */
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';

const getTerminalAPI = () => window.electron?.terminal;
const TERMINAL_FONT_FAMILY = 'Consolas, "Courier New", monospace';
const REPEATED_CONTROL_INPUT_INTERVAL_MS = 25;

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
  private clickFocusHandler: (() => void) | null = null;
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private disposeTerminalDataListener: (() => void) | null = null;
  private disposeTerminalExitListener: (() => void) | null = null;
  private activeRepeatedControlKey: string | null = null;
  private activeRepeatedControlPayload = '';
  private repeatedControlInputTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;
  private pendingPtySync = false;
  private pendingInputBuffer = '';
  private inputFlushTimer: ReturnType<typeof setTimeout> | null = null;

  public id = '';
  public shell: string;

  constructor(options: TerminalSessionOptions = {}) {
    this.shell = options.shell || 'powershell';

    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: 14,
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
      cols: options.cols || 80,
      rows: options.rows || 24,
      scrollback: 5000,
      rightClickSelectsWord: false,
      allowTransparency: false,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    void this.createPtyProcess(options);
    this.bindEvents();
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
      );

      if (!result.success) {
        console.error('[TerminalSession] failed to create terminal:', result.error);
        this.terminal.write(`\r\nFailed to create terminal: ${result.error}\r\n`);
        return;
      }

      this.id = result.terminalId || '';
      this.flushPendingInput();
      this.syncPtySize();
      console.log(`[TerminalSession] terminal created: ${this.id}`);

      this.disposeRendererListeners();

      this.disposeTerminalDataListener = terminalAPI.onData((terminalId: string, data: string) => {
        if (terminalId === this.id) {
          this.enqueueTerminalOutput(data);
        }
      });

      this.disposeTerminalExitListener = terminalAPI.onExit((terminalId: string, exitCode: number) => {
        if (terminalId === this.id) {
          console.log(`[TerminalSession] terminal exited: code=${exitCode}`);
          this.enqueueTerminalOutput('\r\n\r\n[Process exited]\r\n');
        }
      });
    } catch (error) {
      console.error('[TerminalSession] failed to create terminal:', error);
      this.terminal.write(`\r\nFailed to create terminal: ${error}\r\n`);
    }
  }

  private bindEvents(): void {
    this.terminal.onData((data: string) => {
      this.handleTerminalInput(data);
    });

    this.terminal.textarea?.addEventListener('blur', () => {
      this.stopRepeatedControlInput();
    });

    this.terminal.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const repeatedControlPayload = this.getRepeatedControlInputPayload(event);
      if (repeatedControlPayload) {
        return this.handleRepeatedControlInput(event, repeatedControlPayload);
      }

      if (this.shouldHandleLineStartShortcut(event)) {
        this.flushPendingInput();
        this.sendTerminalInputNow('\u0001');
        event.preventDefault();
        return false;
      }

      if (this.shouldHandleSoftLineBreak(event)) {
        this.enqueueTerminalInput('\n');
        event.preventDefault();
        return false;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'v' && event.type === 'keydown') {
        event.preventDefault();
        void this.handlePaste();
        return false;
      }

      return true;
    });
  }

  private shouldHandleLineStartShortcut(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.key.toLowerCase() === 'a' &&
      !event.shiftKey &&
      !event.altKey &&
      event.ctrlKey
    );
  }

  private shouldHandleSoftLineBreak(event: KeyboardEvent): boolean {
    return (
      event.type === 'keydown' &&
      event.key === 'Enter' &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      this.isPowerShellShell()
    );
  }

  private isPowerShellShell(): boolean {
    return /(?:^|\\)(?:powershell|pwsh)(?:\.exe)?(?:\s|$)/i.test(this.shell);
  }

  private getRepeatedControlInputPayload(event: KeyboardEvent): string | null {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return null;
    }

    switch (event.key) {
      case 'Backspace':
        return '\u007f';
      case 'ArrowLeft':
        return '\u001b[D';
      case 'ArrowRight':
        return '\u001b[C';
      case 'ArrowUp':
        return '\u001b[A';
      case 'ArrowDown':
        return '\u001b[B';
      case 'Delete':
        return '\u001b[3~';
      case 'Home':
        return '\u001b[H';
      case 'End':
        return '\u001b[F';
      default:
        return null;
    }
  }

  private handleRepeatedControlInput(event: KeyboardEvent, payload: string): boolean {
    if (event.type === 'keyup') {
      if (this.activeRepeatedControlKey === event.code) {
        this.stopRepeatedControlInput();
        event.preventDefault();
        return false;
      }

      return true;
    }

    if (event.type !== 'keydown') {
      return true;
    }

    if (!event.repeat) {
      if (this.activeRepeatedControlKey && this.activeRepeatedControlKey !== event.code) {
        this.stopRepeatedControlInput();
      }

      return true;
    }

    event.preventDefault();

    if (this.activeRepeatedControlKey !== event.code) {
      this.stopRepeatedControlInput();
      this.flushPendingInput();
      this.activeRepeatedControlKey = event.code;
      this.activeRepeatedControlPayload = payload;
      this.sendTerminalInputNow(payload);
      this.scheduleRepeatedControlInput();
    }

    return false;
  }

  private scheduleRepeatedControlInput(): void {
    if (!this.activeRepeatedControlPayload || this.repeatedControlInputTimer !== null) {
      return;
    }

    this.repeatedControlInputTimer = setTimeout(() => {
      this.repeatedControlInputTimer = null;

      if (this.isDisposed || !this.activeRepeatedControlPayload) {
        return;
      }

      this.sendTerminalInputNow(this.activeRepeatedControlPayload);
      this.scheduleRepeatedControlInput();
    }, REPEATED_CONTROL_INPUT_INTERVAL_MS);
  }

  private stopRepeatedControlInput(): void {
    if (this.repeatedControlInputTimer !== null) {
      clearTimeout(this.repeatedControlInputTimer);
      this.repeatedControlInputTimer = null;
    }

    this.activeRepeatedControlKey = null;
    this.activeRepeatedControlPayload = '';
  }

  private enqueueTerminalOutput(data: string): void {
    if (!data) {
      return;
    }

    this.terminal.write(data);
  }

  public write(data: string): void {
    this.terminal.write(data);
  }

  private handleTerminalInput(data: string): void {
    if (!data) {
      return;
    }

    if (this.shouldSendImmediately(data)) {
      this.flushPendingInput();
      this.sendTerminalInputNow(data);
      return;
    }

    this.enqueueTerminalInput(data);
  }

  private shouldSendImmediately(data: string): boolean {
    return /[\u0000-\u001f\u007f]/.test(data);
  }

  private enqueueTerminalInput(data: string): void {
    if (!data) {
      return;
    }

    this.pendingInputBuffer += data;
    this.schedulePendingInputFlush();
  }

  private schedulePendingInputFlush(): void {
    if (this.inputFlushTimer !== null) {
      return;
    }

    this.inputFlushTimer = setTimeout(() => {
      this.flushPendingInput();
    }, 8);
  }

  private flushPendingInput(): void {
    if (this.inputFlushTimer !== null) {
      clearTimeout(this.inputFlushTimer);
      this.inputFlushTimer = null;
    }

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

  private sendTerminalInputNow(data: string): void {
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

  public attachTo(container: HTMLElement): void {
    this.container = container;
    this.syncThemeBackground();
    this.terminal.open(container);
    this.resize(true);
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

  private async handlePaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        return;
      }

      const terminalAPI = getTerminalAPI();
      if (this.id && terminalAPI) {
        this.enqueueTerminalInput(text);
      }
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

    const dimensions = this.fitAddon.proposeDimensions();
    if (!dimensions) {
      return false;
    }

    const nextCols = Math.max(2, dimensions.cols);
    const nextRows = Math.max(1, dimensions.rows);

    if (nextCols === this.terminal.cols && nextRows === this.terminal.rows) {
      return false;
    }

    this.terminal.resize(nextCols, nextRows);
    return true;
  }

  public syncPtySize(): void {
    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      this.pendingPtySync = true;
      return;
    }

    this.pendingPtySync = false;
    terminalAPI.resize(this.id, this.terminal.cols, this.terminal.rows);
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

  public dispose(): void {
    this.isDisposed = true;

    if (this.container && this.clickFocusHandler) {
      this.container.removeEventListener('click', this.clickFocusHandler);
      this.clickFocusHandler = null;
    }

    if (this.container && this.contextMenuHandler) {
      this.container.removeEventListener('contextmenu', this.contextMenuHandler);
      this.contextMenuHandler = null;
    }

    this.disposeRendererListeners();
    this.stopRepeatedControlInput();
    this.flushPendingInput();
    const terminalAPI = getTerminalAPI();
    if (this.id && terminalAPI) {
      terminalAPI.destroy(this.id);
    }

    this.pendingPtySync = false;
    this.terminal.dispose();
    this.container = null;
  }

  public getTerminal(): Terminal {
    return this.terminal;
  }
}
