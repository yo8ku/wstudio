/**
 * Host-side plugin discovery and registration types used by the Electron main process.
 */

import type { PluginManifest, PluginReleaseChannel } from '@note-studio/plugin';
import type { PluginUiRuntimeSurfaceDescriptor } from '@note-studio/shared';

export interface PluginScanFailure {
  readonly rootDirectory: string;
  readonly manifestPath: string;
  readonly code: string;
  readonly message: string;
}

export interface PluginScanSummary {
  readonly roots: readonly string[];
  readonly registeredCount: number;
  readonly failureCount: number;
  readonly failures: readonly PluginScanFailure[];
}

export interface PluginDescriptor {
  readonly manifest: PluginManifest;
  readonly rootDirectory: string;
  readonly manifestPath: string;
  readonly entryPath: string | null;
  readonly iconPath: string | null;
  readonly fileIconTheme: PluginResolvedFileIconTheme | null;
  readonly uiEntrypoints: PluginResolvedUiEntrypoints | null;
}

export interface PluginResolvedUiEntrypoints {
  readonly views: Readonly<Record<string, string>>;
  readonly settings: string | null;
  readonly modals: Readonly<Record<string, string>>;
}

export interface PluginResolvedFileIconThemeMapping {
  readonly iconPath: string;
  readonly extensions: readonly string[];
  readonly fileNames: readonly string[];
}

export interface PluginResolvedFileIconTheme {
  readonly id: string;
  readonly label: string;
  readonly extensionId: string;
  readonly extensionDisplayName: string;
  readonly fileIconPath: string;
  readonly directoryIconPath: string;
  readonly directoryExpandedIconPath: string | null;
  readonly mappings: readonly PluginResolvedFileIconThemeMapping[];
}

export interface InstalledPluginSummary {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string | null;
  readonly description: string | null;
  readonly fundingUrl: string | null;
  readonly iconPath: string | null;
  readonly releaseChannel: PluginReleaseChannel;
  readonly enabled: boolean;
  readonly failureMessage: string | null;
}

export interface PluginSettingTabSummary {
  readonly id: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly title: string;
  readonly preview: string | null;
  readonly previewLines: readonly string[];
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
}

export interface PluginEditorPoint {
  readonly line: number;
  readonly ch: number;
}

export interface PluginEditorRange {
  readonly from: PluginEditorPoint;
  readonly to: PluginEditorPoint;
}

export interface PluginEditorSelectionSnapshot {
  readonly anchor: PluginEditorPoint;
  readonly head: PluginEditorPoint;
  readonly text: string;
}

export interface PluginEditorScrollSnapshot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface PluginEditorCaretRectSnapshot {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginEditorStateSnapshot {
  readonly documentUri: string;
  readonly content: string;
  readonly selection: PluginEditorSelectionSnapshot | null;
  readonly hasFocus: boolean;
  readonly scroll: PluginEditorScrollSnapshot | null;
  readonly caretRect: PluginEditorCaretRectSnapshot | null;
}

export interface PluginEditorTextEdit {
  readonly range: PluginEditorRange;
  readonly text: string;
}

export type PluginEditorActionRequest =
  | {
      readonly action: 'focus' | 'blur' | 'undo' | 'redo';
      readonly documentUri: string | null;
    }
  | {
      readonly action: 'set-selection';
      readonly documentUri: string;
      readonly range: PluginEditorRange;
    }
  | {
      readonly action: 'set-selections';
      readonly documentUri: string;
      readonly ranges: readonly PluginEditorRange[];
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

export interface MainProcessEditorBridge {
  requestState(documentUri: string | null): Promise<PluginEditorStateSnapshot | null>;
  getLastKnownDocumentUri(): string | null;
  applyTextEdits(documentUri: string, edits: readonly PluginEditorTextEdit[]): Promise<void>;
  performAction(request: PluginEditorActionRequest): Promise<void>;
  subscribeStateChanges(listener: () => void): () => void;
}
