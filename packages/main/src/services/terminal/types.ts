/**
 * Terminal service type definitions.
 * Describe terminal creation inputs, runtime metadata, and shell configuration.
 */

export interface TerminalDisposable {
  dispose(): void;
}

export interface TerminalPtyExitPayload {
  exitCode: number;
  signal?: number;
}

export interface TerminalPty {
  readonly pid: number;
  readonly cols: number;
  readonly rows: number;
  readonly process: string;
  onData(listener: (data: string) => void): TerminalDisposable;
  onExit(listener: (event: TerminalPtyExitPayload) => void): TerminalDisposable;
  resize(columns: number, rows: number): void;
  clear(): void;
  write(data: string): void;
  kill(signal?: string): void;
}

/** PTY runtime compatibility metadata. */
export interface TerminalPtyInfo {
  /** The backend used by the Windows PTY host. */
  backend: 'conpty' | 'winpty';
  /** Windows build number when available. */
  buildNumber?: number;
}

/** Terminal creation options. */
export interface TerminalOptions {
  /** Shell command or executable path. */
  shell?: string;
  /** Working directory. */
  cwd?: string;
  /** Extra environment variables. */
  env?: Record<string, string>;
  /** Initial column count. */
  cols?: number;
  /** Initial row count. */
  rows?: number;
  /** Owner renderer process webContents ID. */
  ownerWebContentsId?: number;
}

/** Runtime terminal instance metadata. */
export interface TerminalInstance {
  /** Terminal ID. */
  id: string;
  /** Backing PTY instance. */
  pty: TerminalPty;
  /** Shell command used to create the PTY. */
  shell: string;
  /** Effective working directory. */
  cwd: string;
  /** Creation timestamp. */
  createdAt: number;
  /** Owner renderer process webContents ID. */
  ownerWebContentsId?: number;
  /** PTY compatibility metadata. */
  ptyInfo?: TerminalPtyInfo;
  /** Data listener disposal handle. */
  dataListener: TerminalDisposable;
  /** Exit listener disposal handle. */
  exitListener: TerminalDisposable;
}

/** Terminal exit event. */
export interface TerminalExitEvent {
  /** Exit code. */
  exitCode: number;
  /** Optional signal identifier. */
  signal?: string;
}

/** Supported shell types. */
export type ShellType = 'powershell' | 'cmd' | 'bash' | 'git-bash' | 'zsh';

/** Shell configuration. */
export interface ShellConfig {
  /** Display name. */
  name: string;
  /** Executable path. */
  path: string;
  /** Default shell arguments. */
  args?: string[];
}
