/**
 * Terminal session wrapper.
 * Keeps the xterm frontend close to the PTY bridge and avoids custom terminal protocol handling.
 */

import { Terminal, type ITerminalAddon, type ITheme } from 'xterm';
import { CanvasAddon } from 'xterm-addon-canvas';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon, type ISearchOptions } from 'xterm-addon-search';
import { SerializeAddon } from 'xterm-addon-serialize';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { WebglAddon } from 'xterm-addon-webgl';
import { WebLinksAddon } from 'xterm-addon-web-links';
import {
  applyCompactSearchToolbarIconStyle,
  createSearchToolbarIconElement,
} from '../../../common/SearchToolbarIcon';

const getTerminalAPI = () => window.electron?.terminal;
const TERMINAL_FONT_FAMILY = 'Consolas, "Courier New", monospace';
const TERMINAL_DEFAULT_FONT_SIZE = 14;
const TERMINAL_COMPACT_FONT_SIZE = 12;
const TERMINAL_DEFAULT_LINE_HEIGHT = 1.05;
const TERMINAL_COMPACT_LINE_HEIGHT = 1;
const TERMINAL_COMPACT_HEIGHT_THRESHOLD = 280;
const TERMINAL_MIN_COLS = 2;
const TERMINAL_MIN_ROWS = 1;
const TERMINAL_WRITE_BATCH_SIZE = 64 * 1024;
const TERMINAL_TRANSPARENT_COLOR = 'rgba(0, 0, 0, 0)';
const TERMINAL_SEARCH_HIGHLIGHT_LIMIT = 500;
const TERMINAL_SEARCH_REFRESH_DELAY = 50;
const TERMINAL_DEBUG_DIAGNOSTICS_ENABLED = true;
const TERMINAL_DEBUG_LOG_LIMIT = 120;
const TERMINAL_DEBUG_CODEX_TRACE_DURATION = 8000;
const TERMINAL_DEBUG_CODEX_OUTPUT_LOG_LIMIT = 24;
const TERMINAL_SEARCH_SELECTION_BACKGROUND = 'rgba(229, 196, 83, 0.32)';
const TERMINAL_SEARCH_DECORATIONS = {
  matchBackground: undefined,
  matchBorder: undefined,
  matchOverviewRuler: '#3b8eea',
  activeMatchBackground: undefined,
  activeMatchBorder: 'rgba(229, 196, 83, 0.72)',
  activeMatchColorOverviewRuler: '#e5c453',
} as const;
const TERMINAL_DEFAULT_THEME: ITheme = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#ffffff',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionInactiveBackground: '#264f78',
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
};

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

type TerminalSearchDirection = 'next' | 'previous';
type TerminalDebugValue = string | number | boolean | null | undefined;
type TerminalBufferSnapshot = {
  bufferType: 'normal' | 'alternate';
  viewportY: number;
  baseY: number;
  cursorX: number;
  cursorY: number;
  termCols: number;
  termRows: number;
  viewportScrollTop: number | null;
};

type TerminalViewportSize = {
  width: number;
  height: number;
};

const TERMINAL_DEFAULT_SEARCH_OPTIONS: Readonly<Pick<ISearchOptions, 'caseSensitive' | 'regex' | 'wholeWord'>> = {
  caseSensitive: false,
  regex: false,
  wholeWord: false,
};

const normalizeTerminalDimension = (value: number | undefined, minValue: number): number | null => (
  Number.isFinite(value)
    ? Math.max(minValue, Math.trunc(value as number))
    : null
);

interface TerminalDisposable {
  dispose(): void;
}

interface TextureAtlasRendererAddon extends ITerminalAddon, TerminalDisposable {
  clearTextureAtlas(): void;
}

const readCssVariable = (
  styles: CSSStyleDeclaration | null | undefined,
  ...names: string[]
): string => {
  if (!styles) {
    return '';
  }

  for (const name of names) {
    const value = styles.getPropertyValue(name).trim();
    if (value) {
      return value;
    }
  }

  return '';
};

const normalizeOpaqueColor = (value: string | undefined | null): string => {
  const normalized = value?.trim() ?? '';
  if (!normalized || normalized === 'transparent' || normalized === TERMINAL_TRANSPARENT_COLOR) {
    return '';
  }

  return normalized;
};

const resolveTerminalTheme = (container: HTMLElement | null): ITheme => {
  const rootStyles = getComputedStyle(document.documentElement);
  const containerStyles = container ? getComputedStyle(container) : null;
  const background = normalizeOpaqueColor(
    readCssVariable(rootStyles, '--terminal-bg', '--ws-terminal-background')
    || readCssVariable(containerStyles, '--ws-panel-background', '--ws-editor-background')
    || containerStyles?.backgroundColor
    || readCssVariable(rootStyles, '--ws-panel-background', '--ws-editor-background')
    || rootStyles.backgroundColor
  ) || TERMINAL_DEFAULT_THEME.background || '#1e1e1e';
  const foreground = normalizeOpaqueColor(
    readCssVariable(rootStyles, '--terminal-fg', '--ws-terminal-foreground', '--ws-foreground')
    || containerStyles?.color
    || rootStyles.color
  ) || TERMINAL_DEFAULT_THEME.foreground || '#cccccc';
  const cursor = normalizeOpaqueColor(
    readCssVariable(rootStyles, '--terminal-cursor', '--ws-terminalCursor-foreground')
  ) || foreground;
  const selectionBackground = readCssVariable(
    rootStyles,
    '--terminal-selection',
    '--ws-terminal-selectionBackground',
    '--ws-selection-background'
  ) || TERMINAL_DEFAULT_THEME.selectionBackground || '#264f78';

  return {
    background,
    foreground,
    cursor,
    cursorAccent: background,
    selectionBackground,
    selectionInactiveBackground: selectionBackground,
    black: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-black', '--ws-terminal-ansiBlack')
    ) || TERMINAL_DEFAULT_THEME.black,
    red: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-red', '--ws-terminal-ansiRed')
    ) || TERMINAL_DEFAULT_THEME.red,
    green: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-green', '--ws-terminal-ansiGreen')
    ) || TERMINAL_DEFAULT_THEME.green,
    yellow: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-yellow', '--ws-terminal-ansiYellow')
    ) || TERMINAL_DEFAULT_THEME.yellow,
    blue: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-blue', '--ws-terminal-ansiBlue')
    ) || TERMINAL_DEFAULT_THEME.blue,
    magenta: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-magenta', '--ws-terminal-ansiMagenta')
    ) || TERMINAL_DEFAULT_THEME.magenta,
    cyan: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-cyan', '--ws-terminal-ansiCyan')
    ) || TERMINAL_DEFAULT_THEME.cyan,
    white: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-white', '--ws-terminal-ansiWhite')
    ) || TERMINAL_DEFAULT_THEME.white,
    brightBlack: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-black', '--ws-terminal-ansiBrightBlack')
    ) || TERMINAL_DEFAULT_THEME.brightBlack,
    brightRed: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-red', '--ws-terminal-ansiBrightRed')
    ) || TERMINAL_DEFAULT_THEME.brightRed,
    brightGreen: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-green', '--ws-terminal-ansiBrightGreen')
    ) || TERMINAL_DEFAULT_THEME.brightGreen,
    brightYellow: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-yellow', '--ws-terminal-ansiBrightYellow')
    ) || TERMINAL_DEFAULT_THEME.brightYellow,
    brightBlue: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-blue', '--ws-terminal-ansiBrightBlue')
    ) || TERMINAL_DEFAULT_THEME.brightBlue,
    brightMagenta: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-magenta', '--ws-terminal-ansiBrightMagenta')
    ) || TERMINAL_DEFAULT_THEME.brightMagenta,
    brightCyan: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-cyan', '--ws-terminal-ansiBrightCyan')
    ) || TERMINAL_DEFAULT_THEME.brightCyan,
    brightWhite: normalizeOpaqueColor(
      readCssVariable(rootStyles, '--terminal-ansi-bright-white', '--ws-terminal-ansiBrightWhite')
    ) || TERMINAL_DEFAULT_THEME.brightWhite,
  };
};

export class TerminalSession {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private readonly initialOptions: TerminalSessionOptions;
  private searchAddon: SearchAddon | null = null;
  private searchResultsSubscription: TerminalDisposable | null = null;
  private unicode11Addon: Unicode11Addon | null = null;
  private serializeAddon: SerializeAddon | null = null;
  private activeRendererAddon: TextureAtlasRendererAddon | null = null;
  private rendererContextLossSubscription: TerminalDisposable | null = null;
  private activeRendererKind: 'dom' | 'canvas' | 'webgl' = 'dom';
  private container: HTMLElement | null = null;
  private clickFocusHandler: ((event: MouseEvent) => void) | null = null;
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private keyboardShortcutHandler: ((event: KeyboardEvent) => void) | null = null;
  private searchOverlay: HTMLDivElement | null = null;
  private searchInputElement: HTMLInputElement | null = null;
  private searchResultLabelElement: HTMLSpanElement | null = null;
  private searchCaseButtonElement: HTMLButtonElement | null = null;
  private searchWholeWordButtonElement: HTMLButtonElement | null = null;
  private searchRegexButtonElement: HTMLButtonElement | null = null;
  private searchPreviousButtonElement: HTMLButtonElement | null = null;
  private searchNextButtonElement: HTMLButtonElement | null = null;
  private searchOverlayKeydownHandler: ((event: KeyboardEvent) => void) | null = null;
  private searchOverlayInputHandler: ((event: Event) => void) | null = null;
  private searchOverlayClickHandler: ((event: MouseEvent) => void) | null = null;
  private searchOverlayMouseDownHandler: ((event: MouseEvent) => void) | null = null;
  private searchOverlayContextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private searchOverlayHostContainer: HTMLElement | null = null;
  private searchOverlayHostOriginalPosition = '';
  private disposeTerminalDataListener: (() => void) | null = null;
  private disposeTerminalExitListener: (() => void) | null = null;
  private pendingOutputChunks: string[] = [];
  private outputFlushTimer: number | null = null;
  private startupScrollTopTimer: number | null = null;
  private createPtyPromise: Promise<void> | null = null;
  private isWritingOutput = false;
  private pendingInputBuffer = '';
  private pendingPtySync = false;
  private lastSyncedPtySize: { cols: number; rows: number } | null = null;
  private activeSearchQuery = '';
  private activeSearchOptions: Pick<ISearchOptions, 'caseSensitive' | 'regex' | 'wholeWord'> = {
    ...TERMINAL_DEFAULT_SEARCH_OPTIONS,
  };
  private activeSearchResultIndex = -1;
  private activeSearchResultCount = 0;
  private activeSearchCacheKey = '';
  private searchRefreshTimer: number | null = null;
  private appliedThemeSignature = '';
  private appliedDensitySignature = '';
  private appearanceRefreshFrame: number | null = null;
  private viewportRefreshFrame: number | null = null;
  private pendingAppearanceForcePtySync = false;
  private lastFittedViewportSize: TerminalViewportSize | null = null;
  private diagnosticLogCount = 0;
  private diagnosticCommandBuffer = '';
  private diagnosticCodexTraceUntil = 0;
  private diagnosticCodexOutputLogCount = 0;
  private themeChangeHandler: EventListener | null = null;
  private isDisposed = false;

  public id = '';
  public shell: string;

  constructor(options: TerminalSessionOptions = {}) {
    this.initialOptions = { ...options };
    this.shell = options.shell || 'powershell';
    const initialCols = normalizeTerminalDimension(options.cols, TERMINAL_MIN_COLS) ?? 80;
    const initialRows = normalizeTerminalDimension(options.rows, TERMINAL_MIN_ROWS) ?? 24;

    this.terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      customGlyphs: true,
      drawBoldTextInBrightColors: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_DEFAULT_FONT_SIZE,
      lineHeight: TERMINAL_DEFAULT_LINE_HEIGHT,
      theme: resolveTerminalTheme(null),
      cols: initialCols,
      rows: initialRows,
      scrollback: 5000,
      allowTransparency: false,
      overviewRulerWidth: 0,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault();
      event.stopPropagation();
      void this.openTerminalLink(uri);
    }));
    this.initializeCapabilityAddons();
    this.initializeRenderer();

    this.bindEvents();
    this.installAppearanceListeners();
    this.syncThemeOptions();
  }

  private initializeCapabilityAddons(): void {
    this.initializeSearchSupport();
    this.initializeUnicodeSupport();
    this.initializeSerializationSupport();
  }

  private initializeSearchSupport(): void {
    try {
      const addon = new SearchAddon({
        highlightLimit: TERMINAL_SEARCH_HIGHLIGHT_LIMIT,
      });
      this.terminal.loadAddon(addon);
      this.searchAddon = addon;
      this.searchResultsSubscription = addon.onDidChangeResults(({ resultIndex, resultCount }) => {
        this.handleSearchResultsChange(resultIndex, resultCount);
      });
    } catch (error) {
      this.disposeSearchResultsSubscription();
      this.searchAddon = null;
      console.warn('[TerminalSession] search addon unavailable:', error);
    }
  }

  private disposeSearchResultsSubscription(): void {
    if (this.searchResultsSubscription) {
      this.searchResultsSubscription.dispose();
      this.searchResultsSubscription = null;
    }
  }

  private initializeUnicodeSupport(): void {
    try {
      const addon = new Unicode11Addon();
      this.terminal.loadAddon(addon);
      this.terminal.unicode.activeVersion = '11';
      this.unicode11Addon = addon;
    } catch (error) {
      this.unicode11Addon = null;
      console.warn('[TerminalSession] unicode11 addon unavailable, keeping default unicode handling:', error);
    }
  }

  private initializeSerializationSupport(): void {
    try {
      const addon = new SerializeAddon();
      this.terminal.loadAddon(addon);
      this.serializeAddon = addon;
    } catch (error) {
      this.serializeAddon = null;
      console.warn('[TerminalSession] serialize addon unavailable:', error);
    }
  }

  private initializeRenderer(): void {
    if (this.shouldPreferDefaultRenderer()) {
      this.activeRendererKind = 'dom';
      return;
    }

    if (this.tryActivateWebglRenderer()) {
      return;
    }

    this.activateCanvasRenderer();
  }

  private shouldPreferDefaultRenderer(): boolean {
    return this.isWindowsPlatform();
  }

  private tryActivateWebglRenderer(): boolean {
    try {
      const nextAddon = new WebglAddon(false);
      const contextLossSubscription = nextAddon.onContextLoss(() => {
        console.warn('[TerminalSession] WebGL renderer context lost, falling back to canvas renderer');
        this.handleWebglContextLoss();
      });

      this.setRendererAddon('webgl', nextAddon, contextLossSubscription);
      return true;
    } catch (error) {
      console.warn('[TerminalSession] webgl renderer unavailable, falling back to canvas renderer:', error);
      return false;
    }
  }

  private activateCanvasRenderer(): void {
    try {
      this.setRendererAddon('canvas', new CanvasAddon());
    } catch (error) {
      console.warn('[TerminalSession] canvas renderer unavailable, falling back to xterm default renderer:', error);
      this.disposeRendererAddon();
      this.activeRendererKind = 'dom';
    }
  }

  private setRendererAddon(
    kind: 'canvas' | 'webgl',
    addon: TextureAtlasRendererAddon,
    contextLossSubscription?: TerminalDisposable
  ): void {
    this.disposeRendererAddon();
    this.terminal.loadAddon(addon);
    this.activeRendererAddon = addon;
    this.rendererContextLossSubscription = contextLossSubscription ?? null;
    this.activeRendererKind = kind;
  }

  private disposeRendererAddon(): void {
    if (this.rendererContextLossSubscription) {
      this.rendererContextLossSubscription.dispose();
      this.rendererContextLossSubscription = null;
    }

    if (this.activeRendererAddon) {
      this.activeRendererAddon.dispose();
      this.activeRendererAddon = null;
    }
  }

  private handleWebglContextLoss(): void {
    if (this.isDisposed || this.activeRendererKind !== 'webgl') {
      return;
    }

    this.activateCanvasRenderer();
    this.scheduleAppearanceRefresh(true);
  }

  private installAppearanceListeners(): void {
    if (!this.themeChangeHandler) {
      this.themeChangeHandler = () => {
        this.scheduleAppearanceRefresh();
      };
      window.addEventListener('theme-changed', this.themeChangeHandler);
    }
  }

  private disposeAppearanceListeners(): void {
    if (this.themeChangeHandler) {
      window.removeEventListener('theme-changed', this.themeChangeHandler);
      this.themeChangeHandler = null;
    }
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

      if (event.type === 'keydown' && this.isSearchPromptShortcut(event)) {
        event.preventDefault();
        this.openSearchPrompt();
        return false;
      }

      if (
        event.type === 'keydown'
        && event.key === 'F3'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        event.preventDefault();
        if (event.shiftKey) {
          this.findPreviousSearchResult();
        } else {
          this.findNextSearchResult();
        }
        return false;
      }

      return true;
    });
  }

  private isSearchPromptShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    if (key !== 'f') {
      return false;
    }

    if (this.isMacPlatform()) {
      return event.metaKey && !event.ctrlKey && !event.altKey;
    }

    return event.ctrlKey && !event.altKey && !event.metaKey;
  }

  private isMacPlatform(): boolean {
    return /mac/i.test(navigator.platform);
  }

  private isWindowsPlatform(): boolean {
    return /win/i.test(navigator.platform || navigator.userAgent);
  }

  private async openTerminalLink(uri: string): Promise<void> {
    const normalizedUri = uri.trim();
    if (!normalizedUri) {
      return;
    }

    const shellAPI = window.electron?.shell;
    if (shellAPI?.openExternal) {
      try {
        await shellAPI.openExternal(normalizedUri);
        return;
      } catch (error) {
        console.error('[TerminalSession] failed to open terminal link externally:', error);
      }
    }

    window.open(normalizedUri, '_blank', 'noopener,noreferrer');
  }

  private getSearchPromptSeed(): string {
    if (this.activeSearchQuery) {
      return this.activeSearchQuery;
    }

    const selection = this.terminal.getSelection().trim();
    return selection;
  }

  private openSearchPrompt(): void {
    if (!this.searchAddon) {
      return;
    }

    this.openSearchOverlay();
  }

  private openSearchOverlay(): void {
    this.ensureSearchOverlay();
    if (!this.searchOverlay || !this.searchInputElement) {
      return;
    }

    this.blurTerminalInput();
    this.searchInputElement.value = this.getSearchPromptSeed();
    this.syncSearchOverlayState();
    this.searchOverlay.style.display = 'flex';
    this.searchInputElement.focus();
    this.searchInputElement.select();
  }

  private blurTerminalInput(): void {
    this.terminal.blur();
    const terminalInput = this.terminal.element?.querySelector('textarea');
    if (terminalInput instanceof HTMLTextAreaElement) {
      terminalInput.blur();
    }
  }

  private ensureSearchOverlay(): void {
    const container = this.container;
    if (!container) {
      return;
    }

    this.ensureSearchOverlayHost(container);
    if (this.searchOverlay && this.searchInputElement) {
      if (this.searchOverlay.parentElement !== container) {
        container.appendChild(this.searchOverlay);
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.setAttribute('data-terminal-search-overlay', 'true');
    overlay.style.position = 'absolute';
    overlay.style.top = '0px';
    overlay.style.right = '24px';
    overlay.style.zIndex = '10';
    overlay.style.paddingTop = '3px';
    overlay.style.paddingBottom = '3px';
    overlay.style.display = 'none';
    overlay.style.borderLeft = '2px solid var(--ws-border-background)'
    overlay.style.alignItems = 'center';
    overlay.style.maxWidth = 'calc(100% - 20px)';
    overlay.style.backgroundColor = 'rgba(30, 30, 30, 0.92)';
    overlay.style.background = 'color-mix(in srgb, var(--ws-panel-background, var(--ws-editor-background, #1e1e1e)) 92%, transparent)';
    overlay.style.color = 'var(--ws-foreground, #cccccc)';
    overlay.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.28)';
    overlay.style.overflow = 'hidden';
    overlay.style.pointerEvents = 'auto';

    const inputSection = document.createElement('div');
    inputSection.style.display = 'flex';
    inputSection.style.alignItems = 'center';
    inputSection.style.minWidth = '220px';
    inputSection.style.flex = '1 1 auto';
    inputSection.style.minHeight = '24px';
    inputSection.style.marginLeft = '3px';
    inputSection.style.padding = '0 2px 0 0';
    inputSection.style.border = '1px solid transparent';
    inputSection.style.borderRadius = '2px';
    inputSection.style.background = 'var(--ws-input-background, rgba(255, 255, 255, 0.04))';
    inputSection.style.boxSizing = 'border-box';
    inputSection.style.transition = 'border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease';

    const optionsSection = document.createElement('div');
    optionsSection.style.display = 'flex';
    optionsSection.style.alignItems = 'center';
    optionsSection.style.gap = '0';
    optionsSection.style.padding = '0 2px';
    optionsSection.style.marginLeft = '2px';
    optionsSection.style.background = 'transparent';

    const input = document.createElement('input');
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = 'Find';
    input.style.width = '220px';
    input.style.minWidth = '140px';
    input.style.height = '30px';
    input.style.padding = '0 10px';
    input.style.border = 'none';
    input.style.background = 'transparent';
    input.style.color = 'var(--ws-input-foreground, var(--ws-foreground, #cccccc))';
    input.style.outline = 'none';
    input.style.fontSize = '12px';
    input.style.flex = '1 1 auto';

    const createButton = (label: string, action: string, title: string): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.title = title;
      button.dataset.terminalSearchAction = action;
      button.dataset.terminalSearchActive = 'false';
      button.dataset.terminalSearchDisabled = 'false';
      button.dataset.terminalSearchHovered = 'false';
      button.style.display = 'inline-flex';
      button.style.alignItems = 'center';
      button.style.justifyContent = 'center';
      button.style.height = '24px';
      button.style.minWidth = '24px';
      button.style.padding = '0 5px';
      button.style.border = '1px solid transparent';
      button.style.borderRadius = '4px';
      button.style.background = 'transparent';
      button.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
      button.style.cursor = 'pointer';
      button.style.fontSize = '11px';
      button.style.lineHeight = '1';
      button.style.transition = 'background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease';
      button.addEventListener('mouseenter', () => {
        button.dataset.terminalSearchHovered = 'true';
        this.applySearchToolbarButtonVisualState(button);
      });
      button.addEventListener('mouseleave', () => {
        button.dataset.terminalSearchHovered = 'false';
        this.applySearchToolbarButtonVisualState(button);
      });
      button.addEventListener('focus', () => {
        button.dataset.terminalSearchHovered = 'true';
        this.applySearchToolbarButtonVisualState(button);
      });
      button.addEventListener('blur', () => {
        button.dataset.terminalSearchHovered = 'false';
        this.applySearchToolbarButtonVisualState(button);
      });
      this.applySearchToolbarButtonVisualState(button);
      return button;
    };

    const tuneCompactOptionButton = (button: HTMLButtonElement): void => {
      button.style.height = '24px';
      button.style.marginRight = '2px';
      button.style.minWidth = '24px';
      button.style.padding = '0 3px';
      button.style.fontSize = '10.5px';
    };

    const tuneCompactOptionIcon = (icon: SVGSVGElement): void => {
      applyCompactSearchToolbarIconStyle(icon);
    };

    const tuneCompactNavigationButton = (button: HTMLButtonElement): void => {
      button.style.height = '24px';
      button.style.marginRight = '2px';
      button.style.minWidth = '24px';
      button.style.padding = '0 2px';
      button.style.fontSize = '11px';
    };

    const caseButton = createButton('', 'toggle-case', 'Match Case (Alt+C)');
    const wholeWordButton = createButton('', 'toggle-word', 'Match Whole Word (Alt+W)');
    const regexButton = createButton('', 'toggle-regex', 'Use Regular Expression (Alt+R)');
    tuneCompactOptionButton(caseButton);
    tuneCompactOptionButton(wholeWordButton);
    tuneCompactOptionButton(regexButton);
    const caseButtonIcon = createSearchToolbarIconElement('caseSensitive');
    tuneCompactOptionIcon(caseButtonIcon);
    caseButton.appendChild(caseButtonIcon);
    const wholeWordButtonIcon = createSearchToolbarIconElement('wholeWord');
    tuneCompactOptionIcon(wholeWordButtonIcon);
    wholeWordButton.appendChild(wholeWordButtonIcon);
    const regexButtonIcon = createSearchToolbarIconElement('regex');
    tuneCompactOptionIcon(regexButtonIcon);
    regexButton.appendChild(regexButtonIcon);

    const setInputSectionFocused = (focused: boolean): void => {
      inputSection.style.borderColor = focused
        ? 'var(--ws-focusBorder, #3b8eea)'
        : 'transparent';

      inputSection.style.background = focused
        ? 'var(--ws-input-background, rgba(255, 255, 255, 0.05))'
        : 'var(--ws-input-background, rgba(255, 255, 255, 0.04))';
    };

    inputSection.addEventListener('focusin', () => {
      setInputSectionFocused(true);
    });
    inputSection.addEventListener('focusout', () => {
      window.requestAnimationFrame(() => {
        setInputSectionFocused(inputSection.contains(document.activeElement));
      });
    });

    const statusLabel = document.createElement('span');
    statusLabel.style.display = 'inline-flex';
    statusLabel.style.alignItems = 'center';
    statusLabel.style.minWidth = '72px';
    statusLabel.style.height = '30px';
    statusLabel.style.padding = '0 10px';
    statusLabel.style.fontSize = '12px';
    statusLabel.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
    statusLabel.style.whiteSpace = 'nowrap';

    const navigationSection = document.createElement('div');
    navigationSection.style.display = 'flex';
    navigationSection.style.alignItems = 'center';
    navigationSection.style.gap = '0';
    navigationSection.style.padding = '0 2px';

    const previousButton = createButton('', 'previous', 'Previous Match (Shift+Enter)');
    const nextButton = createButton('', 'next', 'Next Match (Enter)');
    const closeButton = createButton('', 'close', 'Close (Esc)');
    tuneCompactNavigationButton(previousButton);
    tuneCompactNavigationButton(nextButton);
    tuneCompactNavigationButton(closeButton);
    const previousButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    previousButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    previousButtonIcon.setAttribute('width', '24');
    previousButtonIcon.setAttribute('height', '24');
    previousButtonIcon.setAttribute('viewBox', '0 0 24 24');
    previousButtonIcon.setAttribute('fill', 'none');
    previousButtonIcon.setAttribute('stroke', 'currentColor');
    previousButtonIcon.setAttribute('stroke-width', '1.5');
    previousButtonIcon.setAttribute('stroke-linecap', 'round');
    previousButtonIcon.setAttribute('stroke-linejoin', 'round');
    previousButtonIcon.setAttribute('class', 'terminal-compact-icon terminal-compact-icon--up');
    tuneCompactOptionIcon(previousButtonIcon);
    const previousButtonArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    previousButtonArrow.setAttribute('d', 'm5 12 7-7 7 7');
    const previousButtonLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    previousButtonLine.setAttribute('d', 'M12 19V5');
    previousButtonIcon.append(previousButtonArrow, previousButtonLine);
    previousButton.appendChild(previousButtonIcon);
    const nextButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    nextButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    nextButtonIcon.setAttribute('width', '24');
    nextButtonIcon.setAttribute('height', '24');
    nextButtonIcon.setAttribute('viewBox', '0 0 24 24');
    nextButtonIcon.setAttribute('fill', 'none');
    nextButtonIcon.setAttribute('stroke', 'currentColor');
    nextButtonIcon.setAttribute('stroke-width', '1.5');
    nextButtonIcon.setAttribute('stroke-linecap', 'round');
    nextButtonIcon.setAttribute('stroke-linejoin', 'round');
    nextButtonIcon.setAttribute('class', 'terminal-compact-icon terminal-compact-icon--down');
    tuneCompactOptionIcon(nextButtonIcon);
    const nextButtonLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    nextButtonLine.setAttribute('d', 'M12 5v14');
    const nextButtonArrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    nextButtonArrow.setAttribute('d', 'm19 12-7 7-7-7');
    nextButtonIcon.append(nextButtonLine, nextButtonArrow);
    nextButton.appendChild(nextButtonIcon);
    const closeButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    closeButtonIcon.setAttribute('width', '16');
    closeButtonIcon.setAttribute('height', '16');
    closeButtonIcon.setAttribute('viewBox', '0 0 16 16');
    closeButtonIcon.setAttribute('fill', 'none');
    closeButtonIcon.setAttribute('stroke', 'currentColor');
    closeButtonIcon.setAttribute('stroke-width', '1.5');
    closeButtonIcon.setAttribute('stroke-linecap', 'round');
    closeButtonIcon.setAttribute('stroke-linejoin', 'round');
    tuneCompactOptionIcon(closeButtonIcon);
    const closeButtonPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    closeButtonPath.setAttribute('d', 'M4 4L12 12M12 4L4 12');
    closeButtonIcon.appendChild(closeButtonPath);
    closeButton.appendChild(closeButtonIcon);

    optionsSection.append(caseButton, wholeWordButton, regexButton);
    inputSection.append(input, optionsSection);
    navigationSection.append(previousButton, nextButton, closeButton);
    overlay.append(inputSection, statusLabel, navigationSection);
    container.appendChild(overlay);

    this.searchOverlayInputHandler = () => {
      const query = input.value.trim();
      if (!query) {
        this.clearSearch();
        this.syncSearchOverlayState();
        return;
      }

      this.search(query, 'next', {
        incremental: true,
      });
    };

    this.searchOverlayKeydownHandler = (event: KeyboardEvent) => {
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'c') {
          event.preventDefault();
          this.toggleSearchOption('caseSensitive');
          return;
        }
        if (key === 'w') {
          event.preventDefault();
          this.toggleSearchOption('wholeWord');
          return;
        }
        if (key === 'r') {
          event.preventDefault();
          this.toggleSearchOption('regex');
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeSearchOverlay();
        return;
      }

      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      const query = input.value.trim();
      if (!query) {
        this.clearSearch();
        this.closeSearchOverlay();
        return;
      }

      if (event.shiftKey) {
        this.findPreviousSearchResult(query);
      } else {
        this.findNextSearchResult(query);
      }
    };

    this.searchOverlayMouseDownHandler = (event: MouseEvent) => {
      event.stopPropagation();
    };

    this.searchOverlayContextMenuHandler = (event: MouseEvent) => {
      event.stopPropagation();
    };

    this.searchOverlayClickHandler = (event: MouseEvent) => {
      event.stopPropagation();
      const target = event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>('[data-terminal-search-action]')
        : null;
      if (!target) {
        return;
      }

      if (target.disabled) {
        return;
      }

      event.preventDefault();
      const action = target.dataset.terminalSearchAction;
      switch (action) {
        case 'toggle-case':
          this.toggleSearchOption('caseSensitive');
          break;
        case 'toggle-word':
          this.toggleSearchOption('wholeWord');
          break;
        case 'toggle-regex':
          this.toggleSearchOption('regex');
          break;
        case 'previous':
          this.findPreviousSearchResult(this.searchInputElement?.value.trim() || this.activeSearchQuery);
          break;
        case 'next':
          this.findNextSearchResult(this.searchInputElement?.value.trim() || this.activeSearchQuery);
          break;
        case 'close':
          this.closeSearchOverlay();
          break;
        default:
          break;
      }
    };

    input.addEventListener('input', this.searchOverlayInputHandler);
    input.addEventListener('keydown', this.searchOverlayKeydownHandler);
    overlay.addEventListener('mousedown', this.searchOverlayMouseDownHandler);
    overlay.addEventListener('click', this.searchOverlayClickHandler);
    overlay.addEventListener('contextmenu', this.searchOverlayContextMenuHandler);

    this.searchOverlay = overlay;
    this.searchInputElement = input;
    this.searchResultLabelElement = statusLabel;
    this.searchCaseButtonElement = caseButton;
    this.searchWholeWordButtonElement = wholeWordButton;
    this.searchRegexButtonElement = regexButton;
    this.searchPreviousButtonElement = previousButton;
    this.searchNextButtonElement = nextButton;
    this.syncSearchOverlayState();
  }

  private closeSearchOverlay(): void {
    if (!this.searchOverlay) {
      return;
    }

    if (this.searchInputElement) {
      this.searchInputElement.value = '';
    }
    this.clearSearch();
    this.searchOverlay.style.display = 'none';
    this.terminal.focus();
  }

  private ensureSearchOverlayHost(container: HTMLElement): void {
    if (this.searchOverlayHostContainer === container) {
      return;
    }

    this.restoreSearchOverlayHost();
    if (getComputedStyle(container).position === 'static') {
      this.searchOverlayHostOriginalPosition = container.style.position;
      container.style.position = 'relative';
      this.searchOverlayHostContainer = container;
      return;
    }

    this.searchOverlayHostOriginalPosition = container.style.position;
    this.searchOverlayHostContainer = container;
  }

  private restoreSearchOverlayHost(): void {
    if (!this.searchOverlayHostContainer) {
      return;
    }

    this.searchOverlayHostContainer.style.position = this.searchOverlayHostOriginalPosition;
    this.searchOverlayHostContainer = null;
    this.searchOverlayHostOriginalPosition = '';
  }

  private isSearchOverlayVisible(): boolean {
    return !!this.searchOverlay && this.searchOverlay.style.display !== 'none';
  }

  private isSearchOverlayTarget(target: EventTarget | null): boolean {
    return !!(
      this.searchOverlay
      && target instanceof Node
      && this.searchOverlay.contains(target)
    );
  }

  private applySearchToolbarButtonVisualState(button: HTMLButtonElement | null): void {
    if (!button) {
      return;
    }

    const active = button.dataset.terminalSearchActive === 'true';
    const disabled = button.dataset.terminalSearchDisabled === 'true';
    const hovered = button.dataset.terminalSearchHovered === 'true';
    button.style.opacity = disabled ? '0.35' : '1';
    button.style.cursor = disabled ? 'default' : 'pointer';
    button.style.color = active
      ? 'var(--ws-foreground, #ffffff)'
      : 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
    button.style.background = active
      ? 'var(--ws-list-activeSelectionBackground, rgba(59, 142, 234, 0.22))'
      : hovered && !disabled
        ? 'var(--ws-toolbar-hoverBackground, rgba(255, 255, 255, 0.08))'
        : 'transparent';
    button.style.borderColor = active
      ? 'var(--ws-focusBorder, #3b8eea)'
      : hovered && !disabled
        ? 'var(--ws-panel-border, rgba(255, 255, 255, 0.16))'
        : 'transparent';
  }

  private setSearchToolbarButtonState(
    button: HTMLButtonElement | null,
    options: { active?: boolean; disabled?: boolean } = {}
  ): void {
    if (!button) {
      return;
    }

    const active = options.active ?? false;
    const disabled = options.disabled ?? false;
    button.disabled = disabled;
    button.dataset.terminalSearchActive = active ? 'true' : 'false';
    button.dataset.terminalSearchDisabled = disabled ? 'true' : 'false';
    this.applySearchToolbarButtonVisualState(button);
  }

  private syncSearchOverlayState(): void {
    if (!this.searchOverlay) {
      return;
    }

    const currentQuery = this.searchInputElement?.value.trim() ?? this.activeSearchQuery;
    const hasQuery = currentQuery.length > 0;
    const isSyncedQuery = currentQuery === this.activeSearchQuery;
    const hasMatches = hasQuery && this.activeSearchResultCount > 0;
    const canNavigateMatches = hasQuery && isSyncedQuery && hasMatches;
    if (this.searchResultLabelElement) {
      if (!hasQuery) {
        this.searchResultLabelElement.textContent = 'No results';
        this.searchResultLabelElement.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
      } else if (!isSyncedQuery) {
        this.searchResultLabelElement.textContent = 'Searching...';
        this.searchResultLabelElement.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
      } else if (!hasMatches) {
        this.searchResultLabelElement.textContent = 'No results';
        this.searchResultLabelElement.style.color = 'var(--ws-errorForeground, #f14c4c)';
      } else if (this.activeSearchResultIndex < 0) {
        this.searchResultLabelElement.textContent = `${this.activeSearchResultCount}+ results`;
        this.searchResultLabelElement.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
      } else {
        this.searchResultLabelElement.textContent = `${this.activeSearchResultIndex + 1} / ${this.activeSearchResultCount}`;
        this.searchResultLabelElement.style.color = 'var(--ws-description-foreground, rgba(255, 255, 255, 0.72))';
      }
    }

    this.setSearchToolbarButtonState(this.searchCaseButtonElement, {
      active: this.activeSearchOptions.caseSensitive,
    });
    this.setSearchToolbarButtonState(this.searchWholeWordButtonElement, {
      active: this.activeSearchOptions.wholeWord,
    });
    this.setSearchToolbarButtonState(this.searchRegexButtonElement, {
      active: this.activeSearchOptions.regex,
    });
    this.setSearchToolbarButtonState(this.searchPreviousButtonElement, {
      disabled: !canNavigateMatches,
    });
    this.setSearchToolbarButtonState(this.searchNextButtonElement, {
      disabled: !canNavigateMatches,
    });
  }

  private toggleSearchOption(option: keyof Pick<ISearchOptions, 'caseSensitive' | 'regex' | 'wholeWord'>): void {
    this.activeSearchOptions = {
      ...this.activeSearchOptions,
      [option]: !this.activeSearchOptions[option],
    };
    this.syncSearchOverlayState();

    const query = this.searchInputElement?.value.trim() || this.activeSearchQuery;
    if (!query) {
      return;
    }

    this.search(query, 'next', {
      incremental: true,
    });
  }

  private disposeSearchOverlay(): void {
    if (this.searchInputElement && this.searchOverlayInputHandler) {
      this.searchInputElement.removeEventListener('input', this.searchOverlayInputHandler);
    }

    if (this.searchInputElement && this.searchOverlayKeydownHandler) {
      this.searchInputElement.removeEventListener('keydown', this.searchOverlayKeydownHandler);
    }

    if (this.searchOverlay && this.searchOverlayMouseDownHandler) {
      this.searchOverlay.removeEventListener('mousedown', this.searchOverlayMouseDownHandler);
    }

    if (this.searchOverlay && this.searchOverlayClickHandler) {
      this.searchOverlay.removeEventListener('click', this.searchOverlayClickHandler);
    }

    if (this.searchOverlay && this.searchOverlayContextMenuHandler) {
      this.searchOverlay.removeEventListener('contextmenu', this.searchOverlayContextMenuHandler);
    }

    if (this.searchOverlay) {
      this.searchOverlay.remove();
    }

    this.restoreSearchOverlayHost();
    this.searchOverlay = null;
    this.searchInputElement = null;
    this.searchResultLabelElement = null;
    this.searchCaseButtonElement = null;
    this.searchWholeWordButtonElement = null;
    this.searchRegexButtonElement = null;
    this.searchPreviousButtonElement = null;
    this.searchNextButtonElement = null;
    this.searchOverlayInputHandler = null;
    this.searchOverlayKeydownHandler = null;
    this.searchOverlayClickHandler = null;
    this.searchOverlayMouseDownHandler = null;
    this.searchOverlayContextMenuHandler = null;
  }

  private resolveSearchOptions(overrides?: ISearchOptions): ISearchOptions {
    return {
      ...TERMINAL_DEFAULT_SEARCH_OPTIONS,
      ...this.activeSearchOptions,
      decorations: TERMINAL_SEARCH_DECORATIONS,
      ...overrides,
    };
  }

  private handleSearchResultsChange(resultIndex: number, resultCount: number): void {
    this.activeSearchResultIndex = resultIndex;
    this.activeSearchResultCount = resultCount;
    this.syncSearchOverlayState();
  }

  private scheduleSearchRefresh(): void {
    if (this.isDisposed || !this.activeSearchQuery) {
      return;
    }

    if (this.searchRefreshTimer !== null) {
      window.clearTimeout(this.searchRefreshTimer);
    }

    this.searchRefreshTimer = window.setTimeout(() => {
      this.searchRefreshTimer = null;
      this.refreshActiveSearchHighlights();
    }, TERMINAL_SEARCH_REFRESH_DELAY);
  }

  private refreshActiveSearchHighlights(): void {
    if (!this.searchAddon || !this.activeSearchQuery) {
      return;
    }

    const query = this.activeSearchQuery;
    const options = this.resolveSearchOptions({
      incremental: true,
    });

    this.searchAddon?.findNext(query, options);
  }

  private createSearchCacheKey(
    query: string,
    options: Pick<ISearchOptions, 'caseSensitive' | 'regex' | 'wholeWord'>
  ): string {
    return JSON.stringify({
      query,
      caseSensitive: options.caseSensitive ?? false,
      regex: options.regex ?? false,
      wholeWord: options.wholeWord ?? false,
    });
  }

  private invalidateSearchAddonCache(): void {
    this.searchAddon?.clearDecorations();
    this.activeSearchResultIndex = -1;
    this.activeSearchResultCount = 0;
  }

  public search(
    query: string,
    direction: TerminalSearchDirection = 'next',
    options?: ISearchOptions
  ): boolean {
    const normalizedQuery = query.trim();
    if (!this.searchAddon || !normalizedQuery) {
      if (!normalizedQuery) {
        this.clearSearch();
      }
      return false;
    }

    const resolvedOptions = this.resolveSearchOptions(options);
    const nextSearchCacheKey = this.createSearchCacheKey(normalizedQuery, {
      caseSensitive: resolvedOptions.caseSensitive ?? false,
      regex: resolvedOptions.regex ?? false,
      wholeWord: resolvedOptions.wholeWord ?? false,
    });
    if (this.activeSearchCacheKey && this.activeSearchCacheKey !== nextSearchCacheKey) {
      this.invalidateSearchAddonCache();
    }
    this.activeSearchQuery = normalizedQuery;
    this.activeSearchOptions = {
      caseSensitive: resolvedOptions.caseSensitive ?? false,
      regex: resolvedOptions.regex ?? false,
      wholeWord: resolvedOptions.wholeWord ?? false,
    };
    this.syncThemeOptions();
    const found = direction === 'previous'
      ? this.searchAddon.findPrevious(normalizedQuery, resolvedOptions)
      : this.searchAddon.findNext(normalizedQuery, resolvedOptions);
    this.activeSearchCacheKey = nextSearchCacheKey;
    this.syncSearchOverlayState();
    return found;
  }

  public findNextSearchResult(query = this.activeSearchQuery, options?: ISearchOptions): boolean {
    if (!query) {
      this.openSearchPrompt();
      return false;
    }

    return this.search(query, 'next', options);
  }

  public findPreviousSearchResult(query = this.activeSearchQuery, options?: ISearchOptions): boolean {
    if (!query) {
      this.openSearchPrompt();
      return false;
    }

    return this.search(query, 'previous', options);
  }

  public clearSearch(): void {
    this.activeSearchQuery = '';
    this.activeSearchCacheKey = '';
    this.activeSearchOptions = {
      ...TERMINAL_DEFAULT_SEARCH_OPTIONS,
    };
    this.activeSearchResultIndex = -1;
    this.activeSearchResultCount = 0;
    if (this.searchRefreshTimer !== null) {
      window.clearTimeout(this.searchRefreshTimer);
      this.searchRefreshTimer = null;
    }
    this.searchAddon?.clearDecorations();
    this.terminal.clearSelection();
    this.syncThemeOptions();
    this.syncSearchOverlayState();
  }

  private debugLog(event: string, details: Record<string, TerminalDebugValue> = {}): void {
    if (!TERMINAL_DEBUG_DIAGNOSTICS_ENABLED || this.diagnosticLogCount >= TERMINAL_DEBUG_LOG_LIMIT) {
      return;
    }

    this.diagnosticLogCount += 1;
    const buffer = this.terminal.buffer.active;
    const viewport = this.container?.querySelector('.xterm-viewport');
    const viewportElement = viewport instanceof HTMLElement ? viewport : null;
    const payload: Record<string, TerminalDebugValue> = {
      event,
      index: this.diagnosticLogCount,
      sessionId: this.id || 'pending',
      termCols: this.terminal.cols,
      termRows: this.terminal.rows,
      lastSyncCols: this.lastSyncedPtySize?.cols ?? null,
      lastSyncRows: this.lastSyncedPtySize?.rows ?? null,
      pendingPtySync: this.pendingPtySync,
      bufferType: buffer.type,
      viewportY: buffer.viewportY,
      baseY: buffer.baseY,
      cursorX: buffer.cursorX,
      cursorY: buffer.cursorY,
      containerWidth: this.container?.clientWidth ?? null,
      containerHeight: this.container?.clientHeight ?? null,
      viewportClientHeight: viewportElement?.clientHeight ?? null,
      viewportScrollHeight: viewportElement?.scrollHeight ?? null,
      viewportScrollTop: viewportElement?.scrollTop ?? null,
      ...details,
    };

    try {
      console.log('[TerminalDebug]', JSON.stringify(payload));
    } catch {
      console.log('[TerminalDebug]', payload);
    }
  }

  public logViewportDiagnostics(reason: string): void {
    this.debugLog(reason);
  }

  private captureBufferSnapshot(): TerminalBufferSnapshot {
    const viewport = this.container?.querySelector('.xterm-viewport');
    const viewportElement = viewport instanceof HTMLElement ? viewport : null;
    const buffer = this.terminal.buffer.active;

    return {
      bufferType: buffer.type,
      viewportY: buffer.viewportY,
      baseY: buffer.baseY,
      cursorX: buffer.cursorX,
      cursorY: buffer.cursorY,
      termCols: this.terminal.cols,
      termRows: this.terminal.rows,
      viewportScrollTop: viewportElement?.scrollTop ?? null,
    };
  }

  private logBufferTransition(
    event: string,
    before: TerminalBufferSnapshot,
    after: TerminalBufferSnapshot,
    details: Record<string, TerminalDebugValue> = {}
  ): void {
    const changed = (
      before.bufferType !== after.bufferType
      || before.viewportY !== after.viewportY
      || before.baseY !== after.baseY
      || before.cursorX !== after.cursorX
      || before.cursorY !== after.cursorY
      || before.termCols !== after.termCols
      || before.termRows !== after.termRows
      || before.viewportScrollTop !== after.viewportScrollTop
    );

    if (!changed) {
      return;
    }

    this.debugLog(event, {
      beforeBufferType: before.bufferType,
      afterBufferType: after.bufferType,
      beforeViewportY: before.viewportY,
      afterViewportY: after.viewportY,
      beforeBaseY: before.baseY,
      afterBaseY: after.baseY,
      beforeCursorX: before.cursorX,
      afterCursorX: after.cursorX,
      beforeCursorY: before.cursorY,
      afterCursorY: after.cursorY,
      beforeTermCols: before.termCols,
      afterTermCols: after.termCols,
      beforeTermRows: before.termRows,
      afterTermRows: after.termRows,
      beforeViewportScrollTop: before.viewportScrollTop,
      afterViewportScrollTop: after.viewportScrollTop,
      ...details,
    });
  }

  private trackDiagnosticCommandInput(data: string): void {
    if (!TERMINAL_DEBUG_DIAGNOSTICS_ENABLED || !data) {
      return;
    }

    for (const character of data) {
      if (character === '\r' || character === '\n') {
        const command = this.diagnosticCommandBuffer.trim();
        if (command) {
          this.debugLog('input:command:enter', {
            command,
          });
        }
        if (command === 'codex') {
          this.diagnosticCodexTraceUntil = Date.now() + TERMINAL_DEBUG_CODEX_TRACE_DURATION;
          this.diagnosticCodexOutputLogCount = 0;
          this.debugLog('trace:codex:start', {
            durationMs: TERMINAL_DEBUG_CODEX_TRACE_DURATION,
          });
        }
        this.diagnosticCommandBuffer = '';
        continue;
      }

      if (character === '\u007f' || character === '\b') {
        this.diagnosticCommandBuffer = this.diagnosticCommandBuffer.slice(0, -1);
        continue;
      }

      if (character >= ' ' && character !== '\u001b') {
        this.diagnosticCommandBuffer += character;
      }
    }
  }

  private shouldTraceDiagnosticOutput(payload: string): boolean {
    if (!TERMINAL_DEBUG_DIAGNOSTICS_ENABLED || !payload) {
      return false;
    }

    if (
      payload.includes('\u001b[?1049h')
      || payload.includes('\u001b[?1049l')
      || payload.includes('\u001b[?1047h')
      || payload.includes('\u001b[?1047l')
      || payload.includes('\u001b[?47h')
      || payload.includes('\u001b[?47l')
    ) {
      return true;
    }

    if (Date.now() > this.diagnosticCodexTraceUntil) {
      return false;
    }

    return this.diagnosticCodexOutputLogCount < TERMINAL_DEBUG_CODEX_OUTPUT_LOG_LIMIT;
  }

  private summarizeDiagnosticPayload(payload: string): Record<string, TerminalDebugValue> {
    const normalizedPreview = payload
      .slice(0, 120)
      .replace(/\u001b/g, '<ESC>')
      .replace(/\r/g, '<CR>')
      .replace(/\n/g, '<LF>');

    return {
      payloadLength: payload.length,
      hasAltEnter: payload.includes('\u001b[?1049h') || payload.includes('\u001b[?1047h') || payload.includes('\u001b[?47h'),
      hasAltExit: payload.includes('\u001b[?1049l') || payload.includes('\u001b[?1047l') || payload.includes('\u001b[?47l'),
      hasClear: payload.includes('\u001b[2J') || payload.includes('\u001b[3J'),
      hasCursorHome: payload.includes('\u001b[H'),
      preview: normalizedPreview,
    };
  }

  private async createPtyProcess(): Promise<void> {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI) {
      console.error('[TerminalSession] terminalAPI unavailable');
      this.enqueueTerminalOutput('\r\nUnable to connect to terminal service.\r\n');
      return;
    }

    const spawnCols = Math.max(TERMINAL_MIN_COLS, this.terminal.cols);
    const spawnRows = Math.max(TERMINAL_MIN_ROWS, this.terminal.rows);
    this.debugLog('pty:create:start', {
      spawnCols,
      spawnRows,
    });

    try {
      const result = await terminalAPI.create(
        spawnCols,
        spawnRows,
        this.initialOptions.cwd,
        this.initialOptions.shell
      ) as TerminalCreateResult;

      if (!result.success) {
        console.error('[TerminalSession] failed to create terminal:', result.error);
        this.enqueueTerminalOutput(`\r\nFailed to create terminal: ${result.error}\r\n`);
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

      this.lastSyncedPtySize = { cols: spawnCols, rows: spawnRows };
      this.pendingPtySync = false;
      this.debugLog('pty:create:success', {
        spawnCols,
        spawnRows,
        backend: result.ptyInfo?.backend ?? null,
        buildNumber: result.ptyInfo?.buildNumber ?? null,
      });
      this.attachRendererListeners();
      this.flushPendingInput();
      if (this.terminal.cols !== spawnCols || this.terminal.rows !== spawnRows) {
        this.syncPtySize(false, 'pty:create:post-create-size-changed');
      }
      this.scheduleStartupScrollToTop();
      console.log(`[TerminalSession] terminal created: ${this.id}`);
    } catch (error) {
      console.error('[TerminalSession] failed to create terminal:', error);
      this.enqueueTerminalOutput(`\r\nFailed to create terminal: ${error}\r\n`);
    }
  }

  private scheduleStartupScrollToTop(): void {
    if (this.startupScrollTopTimer !== null) {
      window.clearTimeout(this.startupScrollTopTimer);
    }

    this.startupScrollTopTimer = window.setTimeout(() => {
      this.startupScrollTopTimer = null;
      if (this.isDisposed) {
        return;
      }

      this.debugLog('viewport:startup-scroll-top:before');
      this.terminal.scrollToTop();
      this.debugLog('viewport:startup-scroll-top:after');
    }, 300);
  }

  private attachRendererListeners(): void {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI || !this.id) {
      return;
    }

    this.disposeRendererListeners();

    this.disposeTerminalDataListener = terminalAPI.onData((terminalId: string, data: string) => {
      if (terminalId === this.id && data) {
        this.enqueueTerminalOutput(data);
      }
    });

    this.disposeTerminalExitListener = terminalAPI.onExit((terminalId: string, exitCode: number) => {
      if (terminalId !== this.id) {
        return;
      }

      console.log(`[TerminalSession] terminal exited: code=${exitCode}`);
      this.enqueueTerminalOutput('\r\n\r\n[Process exited]\r\n');
    });
  }

  private enqueueTerminalOutput(data: string): void {
    if (!data || this.isDisposed) {
      return;
    }

    if (this.shouldTraceDiagnosticOutput(data)) {
      this.diagnosticCodexOutputLogCount += 1;
      this.debugLog('output:enqueue', this.summarizeDiagnosticPayload(data));
    }
    this.pendingOutputChunks.push(data);
    this.scheduleOutputFlush();
  }

  private scheduleOutputFlush(): void {
    if (this.isDisposed) {
      return;
    }

    if (!this.isWritingOutput) {
      this.flushPendingOutput();
      return;
    }

    if (this.outputFlushTimer !== null) {
      return;
    }

    this.outputFlushTimer = window.setTimeout(() => {
      this.outputFlushTimer = null;
      this.flushPendingOutput();
    }, 0);
  }

  private takeNextOutputBatch(): string {
    if (this.pendingOutputChunks.length === 0) {
      return '';
    }

    let batch = '';
    let batchLength = 0;

    while (this.pendingOutputChunks.length > 0 && batchLength < TERMINAL_WRITE_BATCH_SIZE) {
      const nextChunk = this.pendingOutputChunks[0];
      const remainingCapacity = TERMINAL_WRITE_BATCH_SIZE - batchLength;
      if (nextChunk.length > remainingCapacity) {
        batch += nextChunk.slice(0, remainingCapacity);
        this.pendingOutputChunks[0] = nextChunk.slice(remainingCapacity);
        batchLength += remainingCapacity;
        break;
      }

      batch += nextChunk;
      batchLength += nextChunk.length;
      this.pendingOutputChunks.shift();
    }

    return batch;
  }

  private flushPendingOutput(): void {
    if (this.isWritingOutput || this.isDisposed) {
      return;
    }

    const payload = this.takeNextOutputBatch();
    if (!payload) {
      return;
    }

    const shouldTracePayload = this.shouldTraceDiagnosticOutput(payload);
    if (shouldTracePayload) {
      this.diagnosticCodexOutputLogCount += 1;
      this.debugLog('output:write:before', this.summarizeDiagnosticPayload(payload));
    }

    this.isWritingOutput = true;
    const beforeSnapshot = this.captureBufferSnapshot();
    this.terminal.write(payload, () => {
      this.isWritingOutput = false;
      if (shouldTracePayload) {
        const afterSnapshot = this.captureBufferSnapshot();
        this.debugLog('output:write:after', this.summarizeDiagnosticPayload(payload));
        this.logBufferTransition('output:buffer-transition', beforeSnapshot, afterSnapshot, this.summarizeDiagnosticPayload(payload));
      }
      if (this.pendingOutputChunks.length > 0) {
        this.scheduleOutputFlush();
      }
    });
  }

  private sendTerminalInput(data: string): void {
    if (!data) {
      return;
    }

    this.trackDiagnosticCommandInput(data);
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
    this.syncThemeOptions();

    if (this.terminal.element) {
      container.appendChild(this.terminal.element);
    } else {
      this.terminal.open(container);
    }

    this.debugLog('attach:open');
    this.fit('attach:open');
    this.scheduleViewportRefresh('attach:open');
    this.setupContextMenu();
    this.setupKeyboardShortcuts();

    this.clickFocusHandler = (event: MouseEvent) => {
      if (this.isSearchOverlayTarget(event.target)) {
        return;
      }
      this.terminal.focus();
    };
    container.addEventListener('click', this.clickFocusHandler);
    this.terminal.focus();
  }

  public ensurePtyCreated(): void {
    if (this.isDisposed || this.id || this.createPtyPromise) {
      return;
    }

    this.createPtyPromise = this.createPtyProcess().finally(() => {
      this.createPtyPromise = null;
    });
  }

  private setupContextMenu(): void {
    if (!this.container) {
      return;
    }

    this.contextMenuHandler = (event: MouseEvent) => {
      if (this.isSearchOverlayTarget(event.target)) {
        return;
      }

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

  private setupKeyboardShortcuts(): void {
    if (!this.container) {
      return;
    }

    this.keyboardShortcutHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target;
      const terminalElement = this.terminal.element;
      const isTerminalTarget = (
        target instanceof Node
        && (
          this.container?.contains(target)
          || terminalElement?.contains(target)
        )
      );

      if (!isTerminalTarget) {
        return;
      }

      if (this.isSearchOverlayTarget(target)) {
        return;
      }

      if (this.isSearchPromptShortcut(event)) {
        event.preventDefault();
        this.openSearchPrompt();
        return;
      }

      if (
        event.key === 'F3'
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        event.preventDefault();
        if (event.shiftKey) {
          this.findPreviousSearchResult();
        } else {
          this.findNextSearchResult();
        }
      }
    };

    this.container.addEventListener('keydown', this.keyboardShortcutHandler);
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

    if (this.container && this.keyboardShortcutHandler) {
      this.container.removeEventListener('keydown', this.keyboardShortcutHandler);
      this.keyboardShortcutHandler = null;
    }

    this.closeSearchOverlay();
    if (this.searchOverlay?.parentElement === this.container) {
      this.searchOverlay.remove();
    }
    this.restoreSearchOverlayHost();

    const terminalElement = this.terminal.element;
    if (this.container && terminalElement?.parentElement === this.container) {
      this.container.removeChild(terminalElement);
    }

    this.container = null;
  }

  public refreshViewport(reason = 'terminal:refresh'): void {
    this.scheduleViewportRefresh(reason);
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

  public resize(forcePtySync = false, reason = 'terminal:resize'): void {
    this.debugLog('terminal:resize:start', {
      forcePtySync,
      reason,
    });
    const fitChanged = this.fit(`${reason}:fit`);
    if (fitChanged || forcePtySync || this.hasUnsyncedPtySize()) {
      this.syncPtySize(forcePtySync, reason);
    }
  }

  private hasUnsyncedPtySize(): boolean {
    if (this.pendingPtySync || !this.lastSyncedPtySize) {
      return this.pendingPtySync;
    }

    return (
      this.lastSyncedPtySize.cols !== this.terminal.cols
      || this.lastSyncedPtySize.rows !== this.terminal.rows
    );
  }

  public fit(reason = 'fit'): boolean {
    if (!this.container) {
      this.debugLog('terminal:fit:skip:no-container', { reason });
      return false;
    }

    this.syncLayoutDensity();
    this.syncThemeOptions();
    const viewportWidth = this.container.clientWidth;
    const viewportHeight = this.container.clientHeight;
    const dimensions = this.fitAddon.proposeDimensions();
    if (!dimensions) {
      this.debugLog('terminal:fit:skip:no-dimensions', { reason });
      return false;
    }

    const nextCols = Math.max(TERMINAL_MIN_COLS, dimensions.cols);
    const nextRows = Math.max(TERMINAL_MIN_ROWS, dimensions.rows);

    const previousViewportSize = this.lastFittedViewportSize;
    const viewportSizeChanged = (
      !previousViewportSize
      || previousViewportSize.width !== viewportWidth
      || previousViewportSize.height !== viewportHeight
    );
    this.lastFittedViewportSize = {
      width: viewportWidth,
      height: viewportHeight,
    };

    if (nextCols === this.terminal.cols && nextRows === this.terminal.rows) {
      if (viewportSizeChanged) {
        this.scheduleViewportRefresh(`${reason}:same-grid-viewport-changed`);
      }
      this.debugLog('terminal:fit:skip:same-size', {
        reason,
        proposedCols: nextCols,
        proposedRows: nextRows,
        viewportWidth,
        viewportHeight,
        viewportSizeChanged,
      });
      return false;
    }

    const previousCols = this.terminal.cols;
    const previousRows = this.terminal.rows;
    this.terminal.resize(nextCols, nextRows);
    this.scheduleViewportRefresh(`${reason}:post-resize`);
    this.debugLog('terminal:fit:applied', {
      reason,
      previousCols,
      previousRows,
      nextCols,
      nextRows,
      viewportWidth,
      viewportHeight,
    });
    return true;
  }

  public syncPtySize(force = false, reason = 'syncPtySize'): void {
    const cols = this.terminal.cols;
    const rows = this.terminal.rows;
    const isSameSizeAsLastSync = (
      !!this.lastSyncedPtySize
      && this.lastSyncedPtySize.cols === cols
      && this.lastSyncedPtySize.rows === rows
    );

    if (
      !force
      && isSameSizeAsLastSync
      && !this.pendingPtySync
    ) {
      this.debugLog('pty:sync:skip:same-size', {
        reason,
        force,
      });
      return;
    }

    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      this.pendingPtySync = true;
      this.debugLog('pty:sync:deferred', {
        reason,
        force,
      });
      return;
    }

    if (force && isSameSizeAsLastSync) {
      this.debugLog('pty:sync:force-nudge', {
        reason,
        force,
      });
      void this.forcePtyResize(cols, rows, reason);
      return;
    }

    this.pendingPtySync = false;
    this.lastSyncedPtySize = { cols, rows };
    this.debugLog('pty:sync:request', {
      reason,
      force,
      cols,
      rows,
    });
    void terminalAPI.resize(this.id, cols, rows).then((result) => {
      this.debugLog('pty:sync:result', {
        reason,
        force,
        cols,
        rows,
        success: result?.success ?? false,
      });
      if (!result?.success) {
        this.pendingPtySync = true;
      }
    }).catch(() => {
      this.debugLog('pty:sync:error', {
        reason,
        force,
        cols,
        rows,
      });
      this.pendingPtySync = true;
    });
  }

  private async forcePtyResize(cols: number, rows: number, reason = 'forcePtyResize'): Promise<void> {
    const terminalAPI = getTerminalAPI();
    if (!this.id || !terminalAPI) {
      this.pendingPtySync = true;
      this.debugLog('pty:force-resize:deferred', {
        reason,
        cols,
        rows,
      });
      return;
    }

    // Some Windows PTY stacks ignore same-size resize calls, so nudge once before restoring.
    const nudgedRows = rows + 1;

    this.pendingPtySync = false;
    this.lastSyncedPtySize = { cols, rows };
    this.debugLog('pty:force-resize:nudge-request', {
      reason,
      cols,
      rows,
      nudgedRows,
    });

    try {
      const nudgeResult = await terminalAPI.resize(this.id, cols, nudgedRows);
      this.debugLog('pty:force-resize:nudge-result', {
        reason,
        cols,
        rows,
        nudgedRows,
        success: nudgeResult?.success ?? false,
      });
      if (!nudgeResult?.success) {
        this.pendingPtySync = true;
        return;
      }

      const result = await terminalAPI.resize(this.id, cols, rows);
      this.debugLog('pty:force-resize:restore-result', {
        reason,
        cols,
        rows,
        success: result?.success ?? false,
      });
      if (!result?.success) {
        this.pendingPtySync = true;
      }
    } catch {
      this.debugLog('pty:force-resize:error', {
        reason,
        cols,
        rows,
      });
      this.pendingPtySync = true;
    }
  }

  private syncThemeOptions(): boolean {
    const theme = resolveTerminalTheme(this.container);
    if (this.activeSearchQuery) {
      theme.selectionBackground = TERMINAL_SEARCH_SELECTION_BACKGROUND;
      theme.selectionInactiveBackground = TERMINAL_SEARCH_SELECTION_BACKGROUND;
      theme.selectionForeground = theme.foreground;
    }
    const nextSignature = JSON.stringify(theme);
    if (nextSignature === this.appliedThemeSignature) {
      return false;
    }

    this.appliedThemeSignature = nextSignature;
    this.terminal.options.theme = theme;
    return true;
  }

  private syncLayoutDensity(): boolean {
    const containerHeight = this.container?.clientHeight ?? 0;
    const useCompactDensity = containerHeight > 0 && containerHeight <= TERMINAL_COMPACT_HEIGHT_THRESHOLD;
    const nextFontSize = useCompactDensity ? TERMINAL_COMPACT_FONT_SIZE : TERMINAL_DEFAULT_FONT_SIZE;
    const nextLineHeight = useCompactDensity ? TERMINAL_COMPACT_LINE_HEIGHT : TERMINAL_DEFAULT_LINE_HEIGHT;
    const nextSignature = `${nextFontSize}:${nextLineHeight}`;
    if (nextSignature === this.appliedDensitySignature) {
      return false;
    }

    this.appliedDensitySignature = nextSignature;
    this.terminal.options.fontSize = nextFontSize;
    this.terminal.options.lineHeight = nextLineHeight;
    this.clearTextureAtlas();
    this.debugLog('terminal:density:applied', {
      compact: useCompactDensity,
      densityFontSize: nextFontSize,
      densityLineHeight: nextLineHeight,
      densityHeightThreshold: TERMINAL_COMPACT_HEIGHT_THRESHOLD,
    });
    return true;
  }

  private scheduleViewportRefresh(reason: string): void {
    if (this.isDisposed) {
      return;
    }

    if (this.viewportRefreshFrame !== null) {
      window.cancelAnimationFrame(this.viewportRefreshFrame);
    }

    this.viewportRefreshFrame = window.requestAnimationFrame(() => {
      this.viewportRefreshFrame = null;
      if (this.isDisposed) {
        return;
      }

      this.clearTextureAtlas();
      this.terminal.refresh(0, Math.max(this.terminal.rows - 1, 0));
      this.debugLog('terminal:refresh:applied', { reason });
    });
  }

  private clearTextureAtlas(): void {
    if (!this.activeRendererAddon) {
      return;
    }

    try {
      this.activeRendererAddon.clearTextureAtlas();
    } catch (error) {
      console.debug('[TerminalSession] failed to clear terminal texture atlas:', error);
    }
  }

  private scheduleAppearanceRefresh(forcePtySync = false): void {
    if (this.isDisposed) {
      return;
    }

    this.pendingAppearanceForcePtySync = this.pendingAppearanceForcePtySync || forcePtySync;
    if (this.appearanceRefreshFrame !== null) {
      return;
    }

    this.appearanceRefreshFrame = window.requestAnimationFrame(() => {
      const shouldForcePtySync = this.pendingAppearanceForcePtySync;
      this.appearanceRefreshFrame = null;
      this.pendingAppearanceForcePtySync = false;
      this.refreshTerminalAppearance(shouldForcePtySync);
    });
  }

  private refreshTerminalAppearance(forcePtySync = false): void {
    const themeChanged = this.syncThemeOptions();
    if (themeChanged || forcePtySync) {
      this.clearTextureAtlas();
    }

    if (!this.container) {
      return;
    }

    if (forcePtySync) {
      this.resize(true);
      this.scheduleSearchRefresh();
      return;
    }

    if (themeChanged) {
      this.resize();
      this.scheduleSearchRefresh();
    }
  }

  public onDataInput(callback: (data: string) => void): void {
    this.terminal.onData(callback);
  }

  public onData(callback: (data: string) => void): { dispose: () => void } {
    return this.terminal.onData(callback);
  }

  public clear(): void {
    this.clearSearch();
    this.terminal.clear();

    const terminalAPI = getTerminalAPI();
    if (this.id && terminalAPI?.clear) {
      void terminalAPI.clear(this.id);
    }
  }

  public focus(): void {
    this.terminal.focus();
  }

  public serializeState(scrollback?: number): string {
    if (!this.serializeAddon) {
      return '';
    }

    return this.serializeAddon.serialize(
      typeof scrollback === 'number'
        ? { scrollback }
        : undefined
    );
  }

  public serializeSelectionAsHtml(): string {
    if (!this.serializeAddon) {
      return '';
    }

    return this.serializeAddon.serializeAsHTML({
      onlySelection: true,
      includeGlobalBackground: true,
    });
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

    if (this.outputFlushTimer !== null) {
      window.clearTimeout(this.outputFlushTimer);
      this.outputFlushTimer = null;
    }

    if (this.startupScrollTopTimer !== null) {
      window.clearTimeout(this.startupScrollTopTimer);
      this.startupScrollTopTimer = null;
    }

    if (this.appearanceRefreshFrame !== null) {
      window.cancelAnimationFrame(this.appearanceRefreshFrame);
      this.appearanceRefreshFrame = null;
    }
    if (this.viewportRefreshFrame !== null) {
      window.cancelAnimationFrame(this.viewportRefreshFrame);
      this.viewportRefreshFrame = null;
    }
    this.pendingAppearanceForcePtySync = false;

    if (this.searchRefreshTimer !== null) {
      window.clearTimeout(this.searchRefreshTimer);
      this.searchRefreshTimer = null;
    }

    this.disposeRendererListeners();
    this.disposeAppearanceListeners();
    this.disposeSearchResultsSubscription();
    this.disposeSearchOverlay();

    const terminalAPI = getTerminalAPI();
    const shouldDestroyTerminal = options.destroyTerminal ?? true;
    if (shouldDestroyTerminal && this.id && terminalAPI) {
      void terminalAPI.destroy(this.id);
    }

    this.pendingOutputChunks = [];
    this.isWritingOutput = false;
    this.pendingInputBuffer = '';
    this.pendingPtySync = false;
    this.lastSyncedPtySize = null;
    this.activeSearchQuery = '';
    this.activeSearchOptions = {
      ...TERMINAL_DEFAULT_SEARCH_OPTIONS,
    };
    this.searchAddon = null;
    this.serializeAddon = null;
    this.unicode11Addon = null;
    this.disposeRendererAddon();
    this.terminal.dispose();
    this.container = null;
  }

  public getTerminal(): Terminal {
    return this.terminal;
  }
}

