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

const getTerminalAPI = () => window.electron?.terminal;
const TERMINAL_FONT_FAMILY = 'Consolas, "Courier New", monospace';
const TERMINAL_MIN_COLS = 2;
const TERMINAL_MIN_ROWS = 1;
const TERMINAL_WRITE_BATCH_SIZE = 64 * 1024;
const TERMINAL_TRANSPARENT_COLOR = 'rgba(0, 0, 0, 0)';
const TERMINAL_SEARCH_HIGHLIGHT_LIMIT = 500;
const TERMINAL_SEARCH_REFRESH_DELAY = 50;
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
  private appearanceRefreshFrame: number | null = null;
  private pendingAppearanceForcePtySync = false;
  private themeChangeHandler: EventListener | null = null;
  private fontLoadingDoneHandler: EventListener | null = null;
  private isDisposed = false;

  public id = '';
  public shell: string;

  constructor(options: TerminalSessionOptions = {}) {
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
      fontSize: 14,
      lineHeight: 1.15,
      theme: resolveTerminalTheme(null),
      cols: initialCols,
      rows: initialRows,
      scrollback: 5000,
      allowTransparency: false,
      overviewRulerWidth: 0,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());
    this.initializeCapabilityAddons();
    this.initializeRenderer();

    this.bindEvents();
    this.installAppearanceListeners();
    this.syncThemeOptions();

    void this.createPtyProcess(options);
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
    if (this.shouldPreferCanvasRenderer()) {
      this.activateCanvasRenderer();
      return;
    }

    if (this.tryActivateWebglRenderer()) {
      return;
    }

    this.activateCanvasRenderer();
  }

  private shouldPreferCanvasRenderer(): boolean {
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

    const fontSet = document.fonts;
    if (fontSet && !this.fontLoadingDoneHandler) {
      this.fontLoadingDoneHandler = () => {
        this.scheduleAppearanceRefresh(true);
      };
      fontSet.addEventListener('loadingdone', this.fontLoadingDoneHandler);
      void fontSet.ready.then(() => {
        if (!this.isDisposed) {
          this.scheduleAppearanceRefresh(true);
        }
      });
    }
  }

  private disposeAppearanceListeners(): void {
    if (this.themeChangeHandler) {
      window.removeEventListener('theme-changed', this.themeChangeHandler);
      this.themeChangeHandler = null;
    }

    if (this.fontLoadingDoneHandler) {
      document.fonts.removeEventListener('loadingdone', this.fontLoadingDoneHandler);
      this.fontLoadingDoneHandler = null;
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
      icon.style.width = '16px';
      icon.style.height = '16px';
      icon.style.display = 'block';
      icon.style.flexShrink = '0';
      icon.style.overflow = 'visible';
      icon.style.filter = 'drop-shadow(0.15px 0 0 currentColor) drop-shadow(-0.15px 0 0 currentColor)';
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
    const caseButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    caseButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    caseButtonIcon.setAttribute('width', '16');
    caseButtonIcon.setAttribute('height', '16');
    caseButtonIcon.setAttribute('viewBox', '0 0 16 16');
    caseButtonIcon.setAttribute('fill', 'currentColor');
    tuneCompactOptionIcon(caseButtonIcon);
    const caseButtonPathA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caseButtonPathA.setAttribute('fill-rule', 'evenodd');
    caseButtonPathA.setAttribute('clip-rule', 'evenodd');
    caseButtonPathA.setAttribute('d', 'M4.02602 3.34176C4.16218 2.93404 4.83818 2.93398 4.97426 3.34176L6.97426 9.34274C6.97526 9.34674 6.97817 9.35544 6.97817 9.35544L7.97426 12.3427C8.06126 12.6047 7.91984 12.8875 7.65786 12.9756C7.60486 12.9926 7.55165 13.0009 7.49965 13.0009C7.29082 13.0008 7.09602 12.868 7.02602 12.6591L6.14028 10.0009H2.86L1.97426 12.6591C1.88728 12.919 1.60634 13.0634 1.34243 12.9746C1.08043 12.8866 0.93902 12.6038 1.02602 12.3418L2.02211 9.35544C2.02311 9.35144 2.02602 9.34274 2.02602 9.34274L4.02602 3.34176ZM3.19399 8.99997H5.80629L4.49965 5.08102L3.19399 8.99997Z');
    const caseButtonPathB = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    caseButtonPathB.setAttribute('fill-rule', 'evenodd');
    caseButtonPathB.setAttribute('clip-rule', 'evenodd');
    caseButtonPathB.setAttribute('d', 'M11.8581 6.66794C13.165 6.73296 13.9427 7.48427 13.9967 8.69626L13.9997 8.83297V12.5078C13.9957 12.7568 13.809 12.9621 13.568 12.9951L13.4997 13C13.2469 12.9998 13.0376 12.8121 13.0045 12.5683L12.9997 12.5V12.4297C12.3407 12.8066 11.7316 13 11.1666 13C9.94081 12.9998 8.99965 12.1369 8.99965 10.833C8.99967 9.68299 9.79211 8.82889 11.1061 8.66989C11.7279 8.59493 12.3589 8.64164 12.9987 8.80954C12.9915 8.07194 12.6279 7.70704 11.8082 7.66598C11.1672 7.63398 10.7158 7.72415 10.4518 7.90915C10.2258 8.06799 9.91347 8.01301 9.75551 7.78708C9.59671 7.56115 9.65178 7.24878 9.87758 7.09079C10.3165 6.78283 10.9138 6.64715 11.6666 6.6611L11.8581 6.66794ZM12.7965 9.8154C12.2587 9.66749 11.7361 9.62551 11.2262 9.68747C10.4042 9.78747 9.99868 10.2244 9.99868 10.8574C9.99884 11.5881 10.474 12.0242 11.1657 12.0244C11.6196 12.0244 12.1777 11.8137 12.8336 11.3818L12.9987 11.2695V9.87594L12.7965 9.8154Z');
    caseButtonIcon.append(caseButtonPathA, caseButtonPathB);
    caseButton.appendChild(caseButtonIcon);
    const wholeWordButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wholeWordButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    wholeWordButtonIcon.setAttribute('width', '16');
    wholeWordButtonIcon.setAttribute('height', '16');
    wholeWordButtonIcon.setAttribute('viewBox', '0 0 16 16');
    wholeWordButtonIcon.setAttribute('fill', 'currentColor');
    tuneCompactOptionIcon(wholeWordButtonIcon);
    const wholeWordPathA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wholeWordPathA.setAttribute('d', 'M15.5 12.5C15.776 12.5 16 12.724 16 13V13.5C16 14.327 15.327 15 14.5 15H1.5C0.673 15 0 14.327 0 13.5V13C0 12.724 0.224 12.5 0.5 12.5C0.776 12.5 1 12.724 1 13V13.5C1 13.775 1.224 14 1.5 14H14.5C14.776 14 15 13.775 15 13.5V13C15 12.724 15.224 12.5 15.5 12.5Z');
    const wholeWordPathB = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wholeWordPathB.setAttribute('fill-rule', 'evenodd');
    wholeWordPathB.setAttribute('clip-rule', 'evenodd');
    wholeWordPathB.setAttribute('d', 'M4.8584 5.6709C6.16516 5.73603 6.94308 6.48734 6.99707 7.69922L7 7.83594V11.5107C6.996 11.7596 6.80919 11.9649 6.56836 11.998L6.5 12.0029C6.24709 12.0029 6.038 11.8152 6.00488 11.5713L6 11.5029V11.4326C5.341 11.8096 4.73199 12.0029 4.16699 12.0029C2.941 12.0029 2 11.1399 2 9.83594C2.00003 8.68597 2.79247 7.83185 4.10645 7.67285C4.7283 7.59793 5.35918 7.64552 5.99902 7.81348C5.99202 7.07548 5.62762 6.70995 4.80762 6.66895C4.16686 6.637 3.7161 6.72717 3.45215 6.91211C3.22615 7.07111 2.91386 7.01604 2.75586 6.79004C2.5969 6.56404 2.65194 6.25174 2.87793 6.09375C3.31692 5.78579 3.91404 5.65006 4.66699 5.66406L4.8584 5.6709ZM5.79688 8.81836C5.25888 8.67037 4.73558 8.62843 4.22559 8.69043C3.40389 8.79054 2.99902 9.22747 2.99902 9.86035C2.99917 10.5911 3.47413 11.0273 4.16602 11.0273C4.62001 11.0273 5.17799 10.8168 5.83398 10.3848L5.99902 10.2725V8.87891L5.79688 8.81836Z');
    const wholeWordPathC = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    wholeWordPathC.setAttribute('fill-rule', 'evenodd');
    wholeWordPathC.setAttribute('clip-rule', 'evenodd');
    wholeWordPathC.setAttribute('d', 'M9.55078 2.00586C9.78578 2.02986 9.97307 2.21715 9.99707 2.45215C10 2.46907 10 2.48601 10 2.50293V6.60254C10.418 6.22566 10.9371 6.00293 11.5 6.00293C12.881 6.00293 14 7.34596 14 9.00293C14 10.6599 12.881 12.0029 11.5 12.0029C10.9371 12.0029 10.418 11.7802 10 11.4033V11.5029C10 11.7619 9.80278 11.974 9.55078 12C9.53385 12.003 9.51693 12.0029 9.5 12.0029C9.224 12.0029 9 11.7789 9 11.5029V2.50293C9 2.486 9.00095 2.46907 9.00293 2.45215C9.02793 2.20015 9.241 2.00293 9.5 2.00293C9.51692 2.00293 9.53386 2.00388 9.55078 2.00586ZM11.4355 7.00391C11.0307 7.03208 10.5769 7.31545 10.29 7.82227C10.1232 8.12611 10.018 8.49479 10.002 8.89453C9.99995 8.92952 10 8.96597 10 9.00195C10 9.03795 10.001 9.07438 10.002 9.10938C10.018 9.50814 10.1222 9.87582 10.2891 10.1797C10.576 10.6875 11.0307 10.9728 11.4355 11C11.4565 11.002 11.478 11.002 11.5 11.002C11.522 11.002 11.5435 11.001 11.5645 11C11.9693 10.9728 12.424 10.6875 12.7109 10.1797C12.8778 9.87582 12.982 9.50814 12.998 9.10938C13 9.07438 13 9.03795 13 9.00195C13 8.96597 12.999 8.92952 12.998 8.89453C12.982 8.49479 12.8768 8.12611 12.71 7.82227C12.4231 7.31545 11.9693 7.03109 11.5645 7.00391C11.5435 7.00191 11.522 7.00195 11.5 7.00195C11.478 7.00195 11.4565 7.00291 11.4355 7.00391Z');
    wholeWordButtonIcon.append(wholeWordPathA, wholeWordPathB, wholeWordPathC);
    wholeWordButton.appendChild(wholeWordButtonIcon);
    const regexButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    regexButtonIcon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    regexButtonIcon.setAttribute('width', '16');
    regexButtonIcon.setAttribute('height', '16');
    regexButtonIcon.setAttribute('viewBox', '0 0 16 16');
    regexButtonIcon.setAttribute('fill', 'currentColor');
    tuneCompactOptionIcon(regexButtonIcon);
    const regexPathA = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    regexPathA.setAttribute('d', 'M11.498 5H9.705L10.973 3.732C11.168 3.537 11.168 3.22 10.973 3.025C10.778 2.83 10.461 2.83 10.266 3.025L8.998 4.293V2.5C8.998 2.224 8.774 2 8.498 2C8.222 2 7.998 2.224 7.998 2.5V4.293L6.73 3.025C6.535 2.83 6.218 2.83 6.023 3.025C5.828 3.22 5.828 3.537 6.023 3.732L7.291 5H5.498C5.222 5 4.998 5.224 4.998 5.5C4.998 5.776 5.222 6 5.498 6H7.291L6.023 7.268C5.828 7.463 5.828 7.78 6.023 7.975C6.121 8.073 6.249 8.121 6.377 8.121C6.505 8.121 6.633 8.072 6.731 7.975L7.999 6.707V8.5C7.999 8.776 8.223 9 8.499 9C8.775 9 8.999 8.776 8.999 8.5V6.707L10.267 7.975C10.365 8.073 10.493 8.121 10.621 8.121C10.749 8.121 10.877 8.072 10.975 7.975C11.17 7.78 11.17 7.463 10.975 7.268L9.707 6H11.5C11.776 6 12 5.776 12 5.5C12 5.224 11.776 5 11.5 5H11.498ZM5 12C5 12.552 4.552 13 4 13C3.448 13 3 12.552 3 12C3 11.448 3.448 11 4 11C4.552 11 5 11.448 5 12Z');
    regexButtonIcon.appendChild(regexPathA);
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
    previousButtonIcon.setAttribute('class', 'lucide lucide-arrow-up-icon lucide-arrow-up');
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
    nextButtonIcon.setAttribute('class', 'lucide lucide-arrow-down-icon lucide-arrow-down');
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

  private async createPtyProcess(options: TerminalSessionOptions): Promise<void> {
    const terminalAPI = getTerminalAPI();
    if (!terminalAPI) {
      console.error('[TerminalSession] terminalAPI unavailable');
      this.enqueueTerminalOutput('\r\nUnable to connect to terminal service.\r\n');
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

      this.attachRendererListeners();
      this.flushPendingInput();
      this.syncPtySize();
      console.log(`[TerminalSession] terminal created: ${this.id}`);
    } catch (error) {
      console.error('[TerminalSession] failed to create terminal:', error);
      this.enqueueTerminalOutput(`\r\nFailed to create terminal: ${error}\r\n`);
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

    this.isWritingOutput = true;
    this.terminal.write(payload, () => {
      this.isWritingOutput = false;
      if (this.pendingOutputChunks.length > 0) {
        this.scheduleOutputFlush();
      }
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
    this.syncThemeOptions();

    if (this.terminal.element) {
      container.appendChild(this.terminal.element);
    } else {
      this.terminal.open(container);
    }

    this.fit();
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

    this.syncThemeOptions();
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

    if (this.appearanceRefreshFrame !== null) {
      window.cancelAnimationFrame(this.appearanceRefreshFrame);
      this.appearanceRefreshFrame = null;
    }

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
