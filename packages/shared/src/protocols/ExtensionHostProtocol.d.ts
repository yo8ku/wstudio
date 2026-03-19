/**
 * 插件宿主与主进程之间的基础通信协议定义。
 */
import type { ExtensionActivationEvent, ExtensionCapability, ExtensionPermission } from '../types/extension';
import type { JsonObject, JsonValue } from '../types/json';
export declare const EXTENSION_HOST_CHANNELS: {
    readonly bootstrap: "extension-host:bootstrap";
    readonly request: "extension-host:request";
    readonly response: "extension-host:response";
    readonly event: "extension-host:event";
};
export type ExtensionHostChannel = (typeof EXTENSION_HOST_CHANNELS)[keyof typeof EXTENSION_HOST_CHANNELS];
export interface ExtensionHostBootstrapPayload extends JsonObject {
    readonly sessionId: string;
    readonly extensionId: string;
    readonly manifestPath: string;
    readonly entryFile: string;
    readonly rootDirectory: string;
    readonly storageDirectory: string;
    readonly hostVersion: string;
    readonly activationEvent: ExtensionActivationEvent;
    readonly permissions: readonly ExtensionPermission[];
}
export interface ExtensionHostRequestMessage extends JsonObject {
    readonly id: string;
    readonly extensionId: string;
    readonly capability: ExtensionCapability;
    readonly payload: JsonValue | null;
}
export interface ExtensionHostSuccessResponse extends JsonObject {
    readonly id: string;
    readonly ok: true;
    readonly payload: JsonValue | null;
}
export interface ExtensionHostErrorBody extends JsonObject {
    readonly code: string;
    readonly message: string;
    readonly details: JsonValue | null;
}
export interface ExtensionHostErrorResponse extends JsonObject {
    readonly id: string;
    readonly ok: false;
    readonly error: ExtensionHostErrorBody;
}
export type ExtensionHostResponseMessage = ExtensionHostSuccessResponse | ExtensionHostErrorResponse;
export interface ExtensionHostEventMessage extends JsonObject {
    readonly extensionId: string;
    readonly event: string;
    readonly payload: JsonValue | null;
}
export interface ExtensionHostBootstrapEnvelope extends JsonObject {
    readonly channel: typeof EXTENSION_HOST_CHANNELS.bootstrap;
    readonly payload: ExtensionHostBootstrapPayload;
}
export interface ExtensionHostRequestEnvelope extends JsonObject {
    readonly channel: typeof EXTENSION_HOST_CHANNELS.request;
    readonly payload: ExtensionHostRequestMessage;
}
export interface ExtensionHostResponseEnvelope extends JsonObject {
    readonly channel: typeof EXTENSION_HOST_CHANNELS.response;
    readonly payload: ExtensionHostResponseMessage;
}
export interface ExtensionHostEventEnvelope extends JsonObject {
    readonly channel: typeof EXTENSION_HOST_CHANNELS.event;
    readonly payload: ExtensionHostEventMessage;
}
export type ExtensionHostEnvelope = ExtensionHostBootstrapEnvelope | ExtensionHostRequestEnvelope | ExtensionHostResponseEnvelope | ExtensionHostEventEnvelope;
export interface ExtensionHostWindowNotificationPayload extends JsonObject {
    readonly level: 'info' | 'warning' | 'error';
    readonly message: string;
}
export interface ExtensionHostCommandExecutionPayload extends JsonObject {
    readonly commandId: string;
    readonly args: readonly JsonValue[];
}
export interface ExtensionHostToolExecutionPayload extends JsonObject {
    readonly toolId: string;
    readonly input: JsonObject;
}
export interface ExtensionHostRegisteredCommandEventPayload extends JsonObject {
    readonly commandId: string;
}
export interface ExtensionHostRegisteredToolEventPayload extends JsonObject {
    readonly toolId: string;
    readonly title: string;
    readonly description: string;
}
export interface ExtensionHostLifecycleEventPayload extends JsonObject {
    readonly state: 'activated' | 'failed' | 'deactivated';
    readonly message?: string;
}
//# sourceMappingURL=ExtensionHostProtocol.d.ts.map