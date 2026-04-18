/**
 * Renderer/main editor bridge protocol used by the plugin capability router.
 */

import type { JsonObject } from '../types/json';
import type {
  ExtensionHostEditorSelectionPayload,
  ExtensionHostTextRangePayload,
  ExtensionHostTextEditPayload,
} from './ExtensionHostProtocol';

export const PLUGIN_EDITOR_BRIDGE_CHANNELS = {
  requestState: 'extensions:editor:get-state',
  stateResponse: 'extensions:editor:state-response',
  stateChanged: 'extensions:editor:state-changed',
  applyTextEdits: 'extensions:editor:apply-text-edits',
  applyTextEditsResponse: 'extensions:editor:apply-text-edits-response',
  performAction: 'extensions:editor:perform-action',
  performActionResponse: 'extensions:editor:perform-action-response',
} as const;

export interface PluginEditorStateRequestPayload extends JsonObject {
  readonly requestId: string;
  readonly documentUri: string | null;
}

export interface PluginEditorScrollPayload extends JsonObject {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface PluginEditorCaretRectPayload extends JsonObject {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface PluginEditorStateChangedPayload extends JsonObject {
  readonly documentUri: string | null;
}

export interface PluginEditorStateResponsePayload extends JsonObject {
  readonly requestId: string;
  readonly ok: boolean;
  readonly documentUri: string | null;
  readonly content: string | null;
  readonly selection: ExtensionHostEditorSelectionPayload | null;
  readonly hasFocus: boolean;
  readonly scroll: PluginEditorScrollPayload | null;
  readonly caretRect: PluginEditorCaretRectPayload | null;
  readonly error: string | null;
}

export interface PluginEditorApplyTextEditsRequestPayload extends JsonObject {
  readonly requestId: string;
  readonly documentUri: string;
  readonly edits: ExtensionHostTextEditPayload[];
}

export interface PluginEditorApplyTextEditsResponsePayload extends JsonObject {
  readonly requestId: string;
  readonly ok: boolean;
  readonly error: string | null;
}

export type PluginEditorPerformActionName =
  | 'focus'
  | 'blur'
  | 'set-selection'
  | 'set-selections'
  | 'scroll-to'
  | 'undo'
  | 'redo'
  | 'exec';

export interface PluginEditorPerformActionRequestPayload extends JsonObject {
  readonly requestId: string;
  readonly documentUri: string | null;
  readonly action: PluginEditorPerformActionName;
  readonly selection: ExtensionHostTextRangePayload | null;
  readonly selections: ExtensionHostTextRangePayload[] | null;
  readonly mainSelectionIndex: number | null;
  readonly command: string | null;
  readonly scrollLeft: number | null;
  readonly scrollTop: number | null;
}

export interface PluginEditorPerformActionResponsePayload extends JsonObject {
  readonly requestId: string;
  readonly ok: boolean;
  readonly error: string | null;
}
