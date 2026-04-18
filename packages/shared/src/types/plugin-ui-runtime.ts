import type { JsonValue } from './json';

/**
 * Shared runtime surface contracts for plugin UI bundles loaded inside
 * sandboxed iframes.
 */

export const PLUGIN_UI_RUNTIME_SURFACE_KINDS = [
  'view',
  'settingTab',
  'modal',
  'popover',
] as const;

export type PluginUiRuntimeSurfaceKind = (typeof PLUGIN_UI_RUNTIME_SURFACE_KINDS)[number];

export interface PluginUiRuntimeSurfaceDescriptor {
  readonly pluginId: string;
  readonly surfaceKind: PluginUiRuntimeSurfaceKind;
  readonly surfaceId: string;
  readonly entryUrl: string;
  readonly state: JsonValue | null;
}

export interface PluginUiRuntimeEditorPoint {
  readonly line: number;
  readonly ch: number;
}

export interface PluginUiRuntimeEditorRange {
  readonly from: PluginUiRuntimeEditorPoint;
  readonly to: PluginUiRuntimeEditorPoint;
}

export interface PluginUiRuntimeEditorSelectionSnapshot {
  readonly anchor: PluginUiRuntimeEditorPoint;
  readonly head: PluginUiRuntimeEditorPoint;
  readonly text: string;
}

export interface PluginUiRuntimeEditorScrollSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface PluginUiRuntimeEditorCaretRectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginUiRuntimeEditorStateSnapshot {
  readonly documentUri: string;
  readonly content: string;
  readonly selection: PluginUiRuntimeEditorSelectionSnapshot | null;
  readonly hasFocus: boolean;
  readonly scroll: PluginUiRuntimeEditorScrollSnapshot | null;
  readonly caretRect: PluginUiRuntimeEditorCaretRectSnapshot | null;
}

export interface PluginUiRuntimeEditorTextEdit {
  readonly range: PluginUiRuntimeEditorRange;
  readonly text: string;
}

export type PluginUiRuntimeEditorActionRequest =
  | {
      readonly action: 'focus' | 'blur' | 'undo' | 'redo';
      readonly documentUri: string | null;
    }
  | {
      readonly action: 'set-selection';
      readonly documentUri: string;
      readonly range: PluginUiRuntimeEditorRange;
    }
  | {
      readonly action: 'set-selections';
      readonly documentUri: string;
      readonly ranges: readonly PluginUiRuntimeEditorRange[];
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

export interface PluginUiRuntimeSettingTabSummary {
  readonly id: string;
  readonly title: string;
  readonly preview: string | null;
  readonly previewLines: readonly string[];
}
