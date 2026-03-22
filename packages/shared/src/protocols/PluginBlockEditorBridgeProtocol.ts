/**
 * Renderer/main blockEditor bridge protocol used by the plugin capability router.
 */

import type {
  BlockEditorCommandDescriptor,
  BlockEditorCommandExecution,
  BlockEditorCommandId,
  BlockEditorContext,
  BlockEditorSnapshot,
  BlockEditorWritebackOperation,
} from '../block-editor';
import type { JsonObject } from '../types/json';

export const PLUGIN_BLOCK_EDITOR_BRIDGE_CHANNELS = {
  request: 'extensions:block-editor:request',
  response: 'extensions:block-editor:response',
} as const;

export type PluginBlockEditorBridgeAction =
  | 'get-snapshot'
  | 'get-context'
  | 'get-commands'
  | 'execute-command'
  | 'writeback';

interface PluginBlockEditorBridgeRequestBase extends JsonObject {
  readonly requestId: string;
}

export interface PluginBlockEditorGetSnapshotRequestPayload
  extends PluginBlockEditorBridgeRequestBase {
  readonly action: 'get-snapshot';
}

export interface PluginBlockEditorGetContextRequestPayload
  extends PluginBlockEditorBridgeRequestBase {
  readonly action: 'get-context';
}

export interface PluginBlockEditorGetCommandsRequestPayload
  extends PluginBlockEditorBridgeRequestBase {
  readonly action: 'get-commands';
}

export interface PluginBlockEditorExecuteCommandRequestPayload
  extends PluginBlockEditorBridgeRequestBase {
  readonly action: 'execute-command';
  readonly commandId: BlockEditorCommandId;
  readonly execution: BlockEditorCommandExecution;
}

export interface PluginBlockEditorWritebackRequestPayload
  extends PluginBlockEditorBridgeRequestBase {
  readonly action: 'writeback';
  readonly operation: BlockEditorWritebackOperation;
}

export type PluginBlockEditorBridgeRequestPayload =
  | PluginBlockEditorGetSnapshotRequestPayload
  | PluginBlockEditorGetContextRequestPayload
  | PluginBlockEditorGetCommandsRequestPayload
  | PluginBlockEditorExecuteCommandRequestPayload
  | PluginBlockEditorWritebackRequestPayload;

export interface PluginBlockEditorBridgeResponsePayload extends JsonObject {
  readonly requestId: string;
  readonly ok: boolean;
  readonly snapshot: BlockEditorSnapshot | null;
  readonly context: BlockEditorContext | null;
  readonly commands: BlockEditorCommandDescriptor[] | null;
  readonly result: boolean | null;
  readonly error: string | null;
}
