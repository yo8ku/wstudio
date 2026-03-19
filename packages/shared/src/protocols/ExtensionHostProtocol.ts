/**
 * 插件宿主与主进程之间的基础通信协议定义。
 */

import type {
  ExtensionActivationEvent,
  ExtensionCapability,
  ExtensionPermission,
} from '../types/extension';
import type { JsonObject, JsonValue } from '../types/json';

export const EXTENSION_HOST_CHANNELS = {
  bootstrap: 'extension-host:bootstrap',
  request: 'extension-host:request',
  response: 'extension-host:response',
  event: 'extension-host:event',
} as const;

export type ExtensionHostChannel =
  (typeof EXTENSION_HOST_CHANNELS)[keyof typeof EXTENSION_HOST_CHANNELS];

export interface ExtensionHostBootstrapPayload {
  readonly sessionId: string;
  readonly extensionId: string;
  readonly manifestPath: string;
  readonly entryFile: string;
  readonly rootDirectory: string;
  readonly storageDirectory: string;
  readonly hostVersion: string;
  readonly activationEvent: ExtensionActivationEvent;
  readonly permissions: ExtensionPermission[];
}

export interface ExtensionHostRequestMessage {
  readonly id: string;
  readonly extensionId: string;
  readonly capability: ExtensionCapability;
  readonly payload: JsonValue | null;
}

export interface ExtensionHostSuccessResponse {
  readonly id: string;
  readonly ok: true;
  readonly payload: JsonValue | null;
}

export interface ExtensionHostErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details: JsonValue | null;
}

export interface ExtensionHostErrorResponse {
  readonly id: string;
  readonly ok: false;
  readonly error: ExtensionHostErrorBody;
}

export type ExtensionHostResponseMessage =
  | ExtensionHostSuccessResponse
  | ExtensionHostErrorResponse;

export interface ExtensionHostEventMessage {
  readonly extensionId: string;
  readonly event: string;
  readonly payload: JsonValue | null;
}

export interface ExtensionHostBootstrapEnvelope {
  readonly channel: typeof EXTENSION_HOST_CHANNELS.bootstrap;
  readonly payload: ExtensionHostBootstrapPayload;
}

export interface ExtensionHostRequestEnvelope {
  readonly channel: typeof EXTENSION_HOST_CHANNELS.request;
  readonly payload: ExtensionHostRequestMessage;
}

export interface ExtensionHostResponseEnvelope {
  readonly channel: typeof EXTENSION_HOST_CHANNELS.response;
  readonly payload: ExtensionHostResponseMessage;
}

export interface ExtensionHostEventEnvelope {
  readonly channel: typeof EXTENSION_HOST_CHANNELS.event;
  readonly payload: ExtensionHostEventMessage;
}

export type ExtensionHostEnvelope =
  | ExtensionHostBootstrapEnvelope
  | ExtensionHostRequestEnvelope
  | ExtensionHostResponseEnvelope
  | ExtensionHostEventEnvelope;

export interface ExtensionHostWindowNotificationPayload {
  readonly level: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface ExtensionHostWorkspaceFileEntryPayload extends JsonObject {
  readonly path: string;
  readonly isDirectory: boolean;
}

export interface ExtensionHostWorkspaceSearchResultPayload extends JsonObject {
  readonly path: string;
  readonly line: number;
  readonly preview: string;
}

export interface ExtensionHostStorageRequestPayload extends JsonObject {
  readonly action: 'get' | 'set' | 'delete';
  readonly key: string;
  readonly value: JsonValue | null;
}

export interface ExtensionHostSettingsRequestPayload extends JsonObject {
  readonly action: 'get' | 'set';
  readonly key: string;
  readonly value: JsonValue | null;
}

export interface ExtensionHostWorkspaceReadRequestPayload extends JsonObject {
  readonly action: 'list-files' | 'read-text-file';
  readonly path: string | null;
}

export interface ExtensionHostWorkspaceWriteRequestPayload extends JsonObject {
  readonly action: 'write-text-file';
  readonly path: string;
  readonly content: string;
}

export interface ExtensionHostWorkspaceSearchRequestPayload extends JsonObject {
  readonly query: string;
}

export interface ExtensionHostNoteDocumentPayload extends JsonObject {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly path: string;
  readonly updatedAt: string;
}

export interface ExtensionHostNoteReadRequestPayload extends JsonObject {
  readonly action: 'list' | 'read';
  readonly noteId: string | null;
}

export interface ExtensionHostNoteWriteRequestPayload extends JsonObject {
  readonly action: 'create' | 'update';
  readonly noteId: string | null;
  readonly title: string | null;
  readonly content: string;
}

export interface ExtensionHostTextRangePayload extends JsonObject {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface ExtensionHostTextEditPayload extends JsonObject {
  readonly range: ExtensionHostTextRangePayload;
  readonly text: string;
}

export interface ExtensionHostEditorSelectionPayload extends JsonObject {
  readonly documentUri: string;
  readonly text: string;
  readonly range: ExtensionHostTextRangePayload;
}

export interface ExtensionHostEditorReadRequestPayload extends JsonObject {
  readonly action: 'get-active-document-text' | 'get-selection';
}

export interface ExtensionHostEditorReadResponsePayload extends JsonObject {
  readonly documentUri: string | null;
  readonly content: string | null;
  readonly selection: ExtensionHostEditorSelectionPayload | null;
}

export interface ExtensionHostEditorWriteRequestPayload extends JsonObject {
  readonly action: 'apply-text-edits';
  readonly documentUri: string;
  readonly edits: ExtensionHostTextEditPayload[];
}

export interface ExtensionHostAIMessagePayload extends JsonObject {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string;
}

export interface ExtensionHostAIToolDefinitionPayload extends JsonObject {
  readonly id: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
}

export interface ExtensionHostAIToolCallPayload extends JsonObject {
  readonly id: string;
  readonly toolId: string;
  readonly input: JsonObject;
}

export interface ExtensionHostAIInvocationRequestPayload extends JsonObject {
  readonly model: string;
  readonly messages: ExtensionHostAIMessagePayload[];
  readonly tools: ExtensionHostAIToolDefinitionPayload[] | null;
}

export interface ExtensionHostAIInvocationResponsePayload extends JsonObject {
  readonly content: string;
  readonly stopReason: 'completed' | 'max_tokens' | 'tool_call';
  readonly toolCalls: ExtensionHostAIToolCallPayload[] | null;
}

export interface ExtensionHostWebviewCreatePanelRequestPayload extends JsonObject {
  readonly action: 'create-panel';
  readonly panelId: string;
  readonly title: string;
}

export interface ExtensionHostWebviewRevealPanelRequestPayload extends JsonObject {
  readonly action: 'reveal-panel';
  readonly panelInstanceKey: string;
}

export interface ExtensionHostWebviewPostMessageRequestPayload extends JsonObject {
  readonly action: 'post-message';
  readonly panelInstanceKey: string;
  readonly message: JsonValue;
}

export interface ExtensionHostWebviewDisposePanelRequestPayload extends JsonObject {
  readonly action: 'dispose-panel';
  readonly panelInstanceKey: string;
}

export type ExtensionHostWebviewRequestPayload =
  | ExtensionHostWebviewCreatePanelRequestPayload
  | ExtensionHostWebviewRevealPanelRequestPayload
  | ExtensionHostWebviewPostMessageRequestPayload
  | ExtensionHostWebviewDisposePanelRequestPayload;

export interface ExtensionHostWebviewPanelCreatedResponsePayload extends JsonObject {
  readonly panelInstanceKey: string;
  readonly panelId: string;
  readonly title: string;
}

export interface ExtensionHostCommandExecutionPayload {
  readonly commandId: string;
  readonly args: JsonValue[];
}

export interface ExtensionHostToolExecutionPayload {
  readonly toolId: string;
  readonly input: JsonObject;
}

export interface ExtensionHostRegisteredCommandEventPayload {
  readonly commandId: string;
}

export interface ExtensionHostRegisteredToolEventPayload {
  readonly toolId: string;
  readonly title: string;
  readonly description: string;
}

export interface ExtensionHostLifecycleEventPayload {
  readonly state: 'activated' | 'failed' | 'deactivated';
  readonly message?: string;
}

export interface ExtensionHostWebviewMessageEventPayload extends JsonObject {
  readonly panelInstanceKey: string;
  readonly message: JsonValue;
}

export interface ExtensionHostWebviewLifecycleEventPayload extends JsonObject {
  readonly panelInstanceKey: string;
  readonly state: 'disposed';
}
