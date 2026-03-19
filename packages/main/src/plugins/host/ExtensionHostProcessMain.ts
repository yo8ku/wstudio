/**
 * 插件宿主子进程主实现，负责加载插件、执行 activate，并响应主进程下发的执行请求。
 */

import * as fs from 'node:fs/promises';
import type {
  ExtensionEnvironment,
  JsonValue,
  ResolvedExtensionManifest,
} from '@note-studio/extension-api';
import {
  ExtensionHostRuntime,
  loadExtensionPlugin,
  normalizeManifest,
  parseExtensionManifestJson,
} from '@note-studio/extension-runtime';
import type {
  ExtensionCapability,
  ExtensionHostBootstrapEnvelope,
  ExtensionHostCommandExecutionPayload,
  ExtensionHostEnvelope,
  ExtensionHostEventEnvelope,
  ExtensionHostLifecycleEventPayload,
  ExtensionHostRequestEnvelope,
  ExtensionHostRequestMessage,
  ExtensionHostResponseEnvelope,
  ExtensionHostResponseMessage,
  ExtensionHostToolExecutionPayload,
  JsonObject,
} from '@note-studio/shared';
import { EXTENSION_HOST_CHANNELS } from '@note-studio/shared';

interface PendingRequestResolver {
  readonly resolve: (value: JsonValue | null) => void;
  readonly reject: (error: Error) => void;
}

type ProcessMessageValue = string | number | boolean | object | null | undefined;

function isJsonObject(value: JsonValue | ProcessMessageValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

function createErrorResponse(id: string, code: string, message: string): ExtensionHostResponseMessage {
  return {
    id,
    ok: false,
    error: {
      code,
      message,
      details: null,
    },
  };
}

function isEnvelope(value: ProcessMessageValue): value is ExtensionHostEnvelope {
  if (!isJsonObject(value)) {
    return false;
  }

  const candidate = value as {
    readonly channel?: string;
    readonly payload?: object;
  };

  return typeof candidate.channel === 'string' && 'payload' in candidate;
}

function parseCommandExecutionPayload(
  value: JsonValue | null,
): ExtensionHostCommandExecutionPayload | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const candidate = value as {
    readonly commandId?: string;
    readonly args?: JsonValue[];
  };

  if (typeof candidate.commandId === 'string' && Array.isArray(candidate.args)) {
    return {
      commandId: candidate.commandId,
      args: [...candidate.args],
    };
  }

  return null;
}

function parseToolExecutionPayload(
  value: JsonValue | null,
): ExtensionHostToolExecutionPayload | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const candidate = value as {
    readonly toolId?: string;
    readonly input?: JsonValue;
  };
  const input = candidate.input ?? null;

  if (typeof candidate.toolId === 'string' && isJsonObject(input)) {
    return {
      toolId: candidate.toolId,
      input,
    };
  }

  return null;
}

async function loadResolvedManifest(manifestPath: string): Promise<ResolvedExtensionManifest> {
  const source = await fs.readFile(manifestPath, 'utf8');
  const parsedJson = JSON.parse(source) as JsonValue;
  const parsedManifest = parseExtensionManifestJson(parsedJson);

  if (!parsedManifest.manifest || parsedManifest.issues.length > 0) {
    const issueMessages = parsedManifest.issues.map((issue) => `${issue.path}: ${issue.message}`);
    throw new Error(`Failed to parse plugin manifest: ${issueMessages.join('; ')}`);
  }

  return normalizeManifest(parsedManifest.manifest);
}

class ExtensionHostProcessRuntime {
  private readonly pendingRequests = new Map<string, PendingRequestResolver>();
  private requestCounter = 0;
  private runtime: ExtensionHostRuntime | null = null;
  private extensionId = '';

  public async handleEnvelope(envelope: ExtensionHostEnvelope): Promise<void> {
    switch (envelope.channel) {
      case EXTENSION_HOST_CHANNELS.bootstrap:
        await this.handleBootstrap(envelope);
        break;
      case EXTENSION_HOST_CHANNELS.request:
        await this.handleRequest(envelope.payload);
        break;
      case EXTENSION_HOST_CHANNELS.response:
        this.handleResponse(envelope);
        break;
      case EXTENSION_HOST_CHANNELS.event:
        await this.handleEvent(envelope);
        break;
      default:
        break;
    }
  }

  private async handleBootstrap(envelope: ExtensionHostBootstrapEnvelope): Promise<void> {
    if (this.runtime) {
      return;
    }

    this.extensionId = envelope.payload.extensionId;

    try {
      const manifest = await loadResolvedManifest(envelope.payload.manifestPath);
      const environment: ExtensionEnvironment = {
        mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
        hostVersion: envelope.payload.hostVersion,
        extensionDirectory: envelope.payload.rootDirectory,
        storageDirectory: envelope.payload.storageDirectory,
      };

      this.runtime = new ExtensionHostRuntime({
        manifest,
        environment,
        bridge: {
          notifyEvent: async (event, payload): Promise<void> => {
            this.sendEnvelope({
              channel: EXTENSION_HOST_CHANNELS.event,
              payload: {
                extensionId: this.extensionId,
                event,
                payload,
              },
            });
          },
          request: (capability, payload): Promise<JsonValue | null> =>
            this.sendRequest(capability, payload),
        },
      });

      const plugin = await loadExtensionPlugin(envelope.payload.entryFile);
      await this.runtime.activate(plugin);

      this.sendLifecycleEvent({
        state: 'activated',
      });
    } catch (error) {
      const message = toErrorMessage(error instanceof Error ? error : String(error));
      this.sendLifecycleEvent({
        state: 'failed',
        message,
      });
      process.exitCode = 1;
      setImmediate(() => process.exit(1));
    }
  }

  private async handleRequest(request: ExtensionHostRequestMessage): Promise<void> {
    if (!this.runtime) {
      this.sendEnvelope({
        channel: EXTENSION_HOST_CHANNELS.response,
        payload: createErrorResponse(
          request.id,
          'EXTENSION_HOST_NOT_READY',
          'Extension host runtime has not finished bootstrapping.',
        ),
      });
      return;
    }

    let response: ExtensionHostResponseMessage;

    try {
      switch (request.capability) {
        case 'commands.execute': {
          const commandPayload = parseCommandExecutionPayload(request.payload);
          if (!commandPayload) {
            response = createErrorResponse(
              request.id,
              'EXTENSION_HOST_INVALID_PAYLOAD',
              'commands.execute payload is invalid.',
            );
            break;
          }

          response = {
            id: request.id,
            ok: true,
            payload: await this.runtime.executeCommand(commandPayload),
          };
          break;
        }
        case 'ai.tool.execute': {
          const toolPayload = parseToolExecutionPayload(request.payload);
          if (!toolPayload) {
            response = createErrorResponse(
              request.id,
              'EXTENSION_HOST_INVALID_PAYLOAD',
              'ai.tool.execute payload is invalid.',
            );
            break;
          }

          response = {
            id: request.id,
            ok: true,
            payload: await this.runtime.executeTool(toolPayload),
          };
          break;
        }
        default:
          response = createErrorResponse(
            request.id,
            'EXTENSION_HOST_CAPABILITY_UNSUPPORTED',
            `Capability is not supported inside extension host: ${request.capability}`,
          );
          break;
      }
    } catch (error) {
      response = createErrorResponse(
        request.id,
        'EXTENSION_HOST_REQUEST_FAILED',
        toErrorMessage(error instanceof Error ? error : String(error)),
      );
    }

    this.sendEnvelope({
      channel: EXTENSION_HOST_CHANNELS.response,
      payload: response,
    });
  }

  private handleResponse(envelope: ExtensionHostResponseEnvelope): void {
    const pending = this.pendingRequests.get(envelope.payload.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(envelope.payload.id);

    if (envelope.payload.ok) {
      pending.resolve(envelope.payload.payload);
      return;
    }

    pending.reject(new Error(envelope.payload.error.message));
  }

  private async handleEvent(envelope: ExtensionHostEventEnvelope): Promise<void> {
    if (!this.runtime) {
      return;
    }

    await this.runtime.handleEvent(envelope.payload.event, envelope.payload.payload);
  }

  private async sendRequest(
    capability: ExtensionCapability,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const requestId = `${this.extensionId}:request:${this.requestCounter}`;
    this.requestCounter += 1;

    const responsePromise = new Promise<JsonValue | null>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
      });
    });

    this.sendEnvelope({
      channel: EXTENSION_HOST_CHANNELS.request,
      payload: {
        id: requestId,
        extensionId: this.extensionId,
        capability,
        payload,
      },
    });

    return responsePromise;
  }

  private sendLifecycleEvent(payload: ExtensionHostLifecycleEventPayload): void {
    const payloadValue: JsonValue = payload.message
      ? {
          state: payload.state,
          message: payload.message,
        }
      : {
          state: payload.state,
        };

    this.sendEnvelope({
      channel: EXTENSION_HOST_CHANNELS.event,
      payload: {
        extensionId: this.extensionId,
        event: 'lifecycle.state',
        payload: payloadValue,
      },
    });
  }

  private sendEnvelope(envelope: ExtensionHostEnvelope): void {
    if (!process.send) {
      return;
    }

    process.send(envelope);
  }
}

const hostRuntime = new ExtensionHostProcessRuntime();

process.on('message', (message: ProcessMessageValue) => {
  if (!isEnvelope(message)) {
    return;
  }

  void hostRuntime.handleEnvelope(message);
});
