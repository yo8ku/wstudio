import type { JsonValue } from './json';

export interface PluginManifestUi {
  readonly views?: Readonly<Record<string, string>>;
  readonly settings?: string;
  readonly modals?: Readonly<Record<string, string>>;
}

export const PLUGIN_UI_SURFACE_KINDS = [
  'view',
  'settingTab',
  'modal',
  'popover',
] as const;

export type PluginUiSurfaceKind = (typeof PLUGIN_UI_SURFACE_KINDS)[number];

export interface PluginUiSurfaceDescriptor {
  readonly pluginId: string;
  readonly surfaceKind: PluginUiSurfaceKind;
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly state: JsonValue | null;
}

export interface PluginUiEditorPoint {
  readonly line: number;
  readonly ch: number;
}

export interface PluginUiEditorRange {
  readonly from: PluginUiEditorPoint;
  readonly to: PluginUiEditorPoint;
}

export interface PluginUiEditorSelectionSnapshot {
  readonly anchor: PluginUiEditorPoint;
  readonly head: PluginUiEditorPoint;
  readonly text: string;
}

export interface PluginUiEditorScrollSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface PluginUiEditorCaretRectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginUiEditorStateSnapshot {
  readonly documentUri: string;
  readonly content: string;
  readonly selection: PluginUiEditorSelectionSnapshot | null;
  readonly hasFocus: boolean;
  readonly scroll: PluginUiEditorScrollSnapshot | null;
  readonly caretRect: PluginUiEditorCaretRectSnapshot | null;
}

export interface PluginUiEditorTextEdit {
  readonly range: PluginUiEditorRange;
  readonly text: string;
}

export type PluginUiEditorActionRequest =
  | {
      readonly action: 'focus' | 'blur' | 'undo' | 'redo';
      readonly documentUri: string | null;
    }
  | {
      readonly action: 'set-selection';
      readonly documentUri: string;
      readonly range: PluginUiEditorRange;
    }
  | {
      readonly action: 'set-selections';
      readonly documentUri: string;
      readonly ranges: readonly PluginUiEditorRange[];
      readonly mainSelectionIndex: number;
    }
  | {
      readonly action: 'scroll-to';
      readonly documentUri: string;
      readonly left: number | null;
      readonly top: number | null;
    }
  | {
      readonly action: 'exec';
      readonly documentUri: string;
      readonly command: string;
    };

export interface PluginUiSettingTabSummary {
  readonly id: string;
  readonly title: string;
  readonly preview: string | null;
  readonly previewLines: readonly string[];
}

export type PluginUiNoticeLevel = 'success' | 'error' | 'warning' | 'info';

export interface PluginUiHostNoticePayload {
  readonly message: string;
  readonly level: PluginUiNoticeLevel;
  readonly duration?: number;
}

export interface PluginUiOpenWorkspaceFileOptions {
  readonly forceNewLeaf?: boolean;
}

export interface PluginUiShowOpenDialogOptions {
  readonly title?: string;
  readonly defaultPath?: string;
  readonly filters?: readonly {
    readonly name: string;
    readonly extensions: readonly string[];
  }[];
  readonly properties?: readonly ('openFile' | 'openDirectory' | 'multiSelections')[];
}

export interface PluginUiShowOpenDialogResult {
  readonly canceled: boolean;
  readonly filePaths: readonly string[];
}

export interface PluginUiHostBridge {
  showNotice(payload: PluginUiHostNoticePayload): Promise<void>;
  executeCommand(commandId: string, args?: readonly JsonValue[]): Promise<JsonValue | null>;
  activateView(): Promise<void>;
  closeView(): Promise<void>;
  closeOverlay(): Promise<void>;
  showOpenDialog(options: PluginUiShowOpenDialogOptions): Promise<PluginUiShowOpenDialogResult>;
  openWorkspaceFile(path: string, options?: PluginUiOpenWorkspaceFileOptions): Promise<boolean>;
  readonly overlay: {
    dispatchAction(action: JsonValue | null): Promise<void>;
  };
  readonly editor: {
    getState(documentUri?: string | null): Promise<PluginUiEditorStateSnapshot | null>;
    applyTextEdits(documentUri: string, edits: readonly PluginUiEditorTextEdit[]): Promise<void>;
    performAction(request: PluginUiEditorActionRequest): Promise<void>;
  };
  readonly data: {
    load(): Promise<JsonValue | null>;
    save(data: JsonValue | null): Promise<void>;
    delete(): Promise<void>;
  };
  readonly settings: {
    getTabs(): Promise<readonly PluginUiSettingTabSummary[]>;
  };
}

export type ThemeAppearance = 'light' | 'dark';

export const THEME_TOKEN_NAMES = [
  'surface.background',
  'surface.panel',
  'surface.panelMuted',
  'surface.overlay',
  'surface.hover',
  'surface.selected',
  'text.primary',
  'text.secondary',
  'text.muted',
  'text.placeholder',
  'text.inverse',
  'text.link',
  'border.default',
  'border.muted',
  'border.focus',
  'accent.primary',
  'accent.primaryHover',
  'accent.onPrimary',
  'input.background',
  'input.foreground',
  'input.border',
  'input.borderFocus',
  'button.primary.background',
  'button.primary.foreground',
  'button.primary.hoverBackground',
  'button.secondary.background',
  'button.secondary.foreground',
  'button.secondary.hoverBackground',
  'menu.background',
  'menu.border',
  'list.hoverBackground',
  'list.activeBackground',
  'list.activeForeground',
  'status.success',
  'status.warning',
  'status.error',
  'scrollbar.thumb',
  'scrollbar.thumbHover',
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export interface ThemeInfo {
  readonly id: string;
  readonly label: string;
  readonly appearance: ThemeAppearance;
}

export interface ThemeSnapshot {
  readonly info: ThemeInfo;
  readonly tokens: Readonly<Record<ThemeTokenName, string>>;
}

export interface ThemeChangeEvent {
  readonly previous: ThemeSnapshot | null;
  readonly current: ThemeSnapshot;
}

/**
 * Semantic theme tokens projected into the isolated plugin UI surface.
 * This is the supported styling contract for rich plugin UI and does not imply
 * direct access to host DOM structure or host-private CSS variables.
 */
export interface ThemeService {
  getSnapshot(): ThemeSnapshot;
  getToken(name: ThemeTokenName): string;
  onDidChange(listener: (event: ThemeChangeEvent) => void): () => void;
}

export interface PluginUiContext {
  readonly surface: PluginUiSurfaceDescriptor;
  /**
   * DOM mount point inside the isolated plugin UI surface document.
   */
  readonly root: HTMLElement;
  readonly host: PluginUiHostBridge;
  readonly theme: ThemeService;
  markRendered(): void;
  onSurfaceStateChange(listener: (state: JsonValue | null) => void): () => void;
}
