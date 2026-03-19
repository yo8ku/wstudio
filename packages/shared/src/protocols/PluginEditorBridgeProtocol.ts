/**
 * Renderer/main editor bridge protocol used by the plugin capability router.
 */

import type { JsonObject } from '../types/json';
import type {
  ExtensionHostEditorSelectionPayload,
  ExtensionHostTextEditPayload,
} from './ExtensionHostProtocol';

export const PLUGIN_EDITOR_BRIDGE_CHANNELS = {
  requestState: 'extensions:editor:get-state',
  stateResponse: 'extensions:editor:state-response',
  applyTextEdits: 'extensions:editor:apply-text-edits',
  applyTextEditsResponse: 'extensions:editor:apply-text-edits-response',
} as const;

export interface PluginEditorStateRequestPayload extends JsonObject {
  readonly requestId: string;
}

export interface PluginEditorStateResponsePayload extends JsonObject {
  readonly requestId: string;
  readonly ok: boolean;
  readonly documentUri: string | null;
  readonly content: string | null;
  readonly selection: ExtensionHostEditorSelectionPayload | null;
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
