/**
 * 主进程插件宿主管理器，负责拉起隔离宿主、处理双向 RPC，并把注册的命令 / AI tool 接入执行链。
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fork, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import type {
  AIPanelContributionEntry,
  AIPanelContributionExecutionOutcome,
  ExtensionActivationEvent,
  ExtensionCapability,
  ExtensionHostBootstrapPayload,
  ExtensionHostCommandExecutionPayload,
  ExtensionHostEnvelope,
  ExtensionHostEventEnvelope,
  ExtensionHostLifecycleEventPayload,
  ExtensionHostRegisteredCommandEventPayload,
  ExtensionHostRegisteredToolEventPayload,
  ExtensionHostWebviewLifecycleEventPayload,
  ExtensionHostWebviewMessageEventPayload,
  ExtensionHostRequestEnvelope,
  ExtensionHostRequestMessage,
  ExtensionHostResponseEnvelope,
  ExtensionHostResponseMessage,
  ExtensionHostToolExecutionPayload,
  JsonObject,
  JsonValue,
} from '@note-studio/shared';
import { EXTENSION_HOST_CHANNELS, EXTENSION_PLATFORM_VERSION } from '@note-studio/shared';
import type { ExtensionRuntimeDescriptor } from '@note-studio/extension-runtime';
import { aiPanelActionRegistry } from './AIPanelActionRegistry';
import { pluginCommandRegistry } from './PluginCommandRegistry';
import { pluginCapabilityRouter } from './PluginCapabilityRouter';
import { pluginDiscoveryService } from './PluginDiscoveryService';
import { workbenchContributionRegistry } from './WorkbenchContributionRegistry';

interface PendingRequestResolver {
  readonly resolve: (value: JsonValue | null) => void;
  readonly reject: (error: Error) => void;
}

interface ExtensionHostSession {
  readonly descriptor: ExtensionRuntimeDescriptor;
  readonly child: ChildProcess;
  readonly sessionId: string;
  readonly storageDirectory: string;
  readonly pendingRequests: Map<string, PendingRequestResolver>;
  requestCounter: number;
  state: 'starting' | 'active' | 'failed';
  readyPromise: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
}

type ProcessMessageValue = string | number | boolean | object | null | undefined;

function isObjectMessage(value: ProcessMessageValue): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonObjectValue(value: JsonValue | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEnvelope(value: ProcessMessageValue): value is ExtensionHostEnvelope {
  if (!isObjectMessage(value)) {
    return false;
  }

  const candidate = value as {
    readonly channel?: string;
    readonly payload?: object;
  };

  return typeof candidate.channel === 'string' && 'payload' in candidate;
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

function parseRegisteredCommandPayload(
  payload: JsonValue | null,
): ExtensionHostRegisteredCommandEventPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly commandId?: string;
  };

  if (typeof candidate.commandId === 'string') {
    return {
      commandId: candidate.commandId,
    };
  }

  return null;
}

function parseRegisteredToolPayload(
  payload: JsonValue | null,
): ExtensionHostRegisteredToolEventPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly toolId?: string;
    readonly title?: string;
    readonly description?: string;
  };

  if (
    typeof candidate.toolId === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.description === 'string'
  ) {
    return {
      toolId: candidate.toolId,
      title: candidate.title,
      description: candidate.description,
    };
  }

  return null;
}

function parseLifecyclePayload(
  payload: JsonValue | null,
): ExtensionHostLifecycleEventPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly state?: string;
    readonly message?: string;
  };

  if (
    candidate.state === 'activated'
    || candidate.state === 'failed'
    || candidate.state === 'deactivated'
  ) {
    return {
      state: candidate.state,
      message: typeof candidate.message === 'string' ? candidate.message : undefined,
    };
  }

  return null;
}

function parseCommandExecutionPayload(
  payload: JsonValue | null,
): ExtensionHostCommandExecutionPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
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

function toAIPanelExecutionOutcome(payload: JsonValue | null): AIPanelContributionExecutionOutcome {
  if (isJsonObjectValue(payload) && payload.type === 'insert-text' && typeof payload.insertText === 'string') {
    return {
      type: 'insert-text',
      insertText: payload.insertText,
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  if (isJsonObjectValue(payload) && payload.type === 'handled') {
    return {
      type: 'handled',
      message: typeof payload.message === 'string' ? payload.message : undefined,
    };
  }

  return {
    type: 'handled',
  };
}

function createDeferredPromise(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
} {
  let resolvePromise: (() => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = (): void => resolve();
    rejectPromise = (error: Error): void => reject(error);
  });

  return {
    promise,
    resolve: (): void => resolvePromise?.(),
    reject: (error: Error): void => rejectPromise?.(error),
  };
}

function waitForChildProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timeoutHandle);
      child.off('exit', handleExit);
      child.off('error', handleError);
    };

    const handleExit = (): void => {
      cleanup();
      resolve();
    };

    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const timeoutHandle = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for extension host process to exit after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.once('exit', handleExit);
    child.once('error', handleError);
  });
}

export class PluginHostManager {
  private static instance: PluginHostManager | null = null;

  private readonly sessions = new Map<string, ExtensionHostSession>();
  private readonly shutdownTimeoutMs = 2000;

  public static getInstance(): PluginHostManager {
    if (!PluginHostManager.instance) {
      PluginHostManager.instance = new PluginHostManager();
    }

    return PluginHostManager.instance;
  }

  public async initialize(): Promise<void> {
    await this.activateByEvent('onStartupFinished');
  }

  public async reloadAll(): Promise<void> {
    const extensionIds = Array.from(this.sessions.keys());
    const shutdownErrors: string[] = [];

    for (const extensionId of extensionIds) {
      try {
        await this.stopSession(extensionId);
      } catch (error) {
        shutdownErrors.push(toErrorMessage(error instanceof Error ? error : String(error)));
      }
    }

    if (shutdownErrors.length > 0) {
      throw new Error(`Failed to reload active extension hosts: ${shutdownErrors.join('; ')}`);
    }
  }

  public async activateByEvent(activationEvent: ExtensionActivationEvent): Promise<void> {
    const descriptors = pluginDiscoveryService.findByActivationEvent(activationEvent);

    for (const descriptor of descriptors) {
      await this.ensureActivated(descriptor.manifest.id, activationEvent);
    }
  }

  public async activateForAIPanelItem(item: AIPanelContributionEntry): Promise<void> {
    if (item.kind === 'command' && item.insertText) {
      return;
    }

    const activationEvent = item.kind === 'command'
      ? `onAiPanelCommand:${item.itemId}` as const
      : `onAiPanelSkill:${item.itemId}` as const;

    await this.ensureActivated(item.extensionId, activationEvent);
  }

  public async executeRegisteredCommand(
    extensionId: string,
    commandId: string,
    args: readonly JsonValue[] = [],
  ): Promise<AIPanelContributionExecutionOutcome> {
    const payload = await this.executeCommandInHost(extensionId, commandId, args);
    return toAIPanelExecutionOutcome(payload);
  }

  public async executeContributedCommand(
    commandId: string,
    args: readonly JsonValue[] = [],
  ): Promise<JsonValue | null> {
    const registration = pluginCommandRegistry.get(commandId);
    if (!registration) {
      throw new Error(`Command is not declared by any installed plugin: ${commandId}`);
    }

    await this.ensureActivated(
      registration.extensionId,
      `onCommand:${registration.commandId}`,
    );

    return this.executeCommandInHost(
      registration.extensionId,
      registration.commandId,
      args,
    );
  }

  private async executeCommandInHost(
    extensionId: string,
    commandId: string,
    args: readonly JsonValue[] = [],
  ): Promise<JsonValue | null> {
    const session = this.sessions.get(extensionId);
    if (!session) {
      throw new Error(`Extension host session not found: ${extensionId}`);
    }

    return this.sendRequest(session, 'commands.execute', {
      commandId,
      args: [...args],
    } satisfies ExtensionHostCommandExecutionPayload);
  }

  public async executeRegisteredTool(
    extensionId: string,
    toolId: string,
  ): Promise<AIPanelContributionExecutionOutcome> {
    const session = this.sessions.get(extensionId);
    if (!session) {
      throw new Error(`Extension host session not found: ${extensionId}`);
    }

    const payload = await this.sendRequest(session, 'ai.tool.execute', {
      toolId,
      input: {},
    } satisfies ExtensionHostToolExecutionPayload);

    return toAIPanelExecutionOutcome(payload);
  }

  public async deliverRuntimeWebviewMessage(
    extensionId: string,
    panelInstanceKey: string,
    message: JsonValue,
  ): Promise<void> {
    const session = this.sessions.get(extensionId);
    if (!session) {
      throw new Error(`Extension host session not found: ${extensionId}`);
    }

    this.sendEvent(session, 'webview.message', {
      panelInstanceKey,
      message,
    } satisfies ExtensionHostWebviewMessageEventPayload);
  }

  public async notifyRuntimeWebviewDisposed(
    extensionId: string,
    panelInstanceKey: string,
  ): Promise<void> {
    const session = this.sessions.get(extensionId);
    if (!session) {
      return;
    }

    this.sendEvent(session, 'webview.lifecycle', {
      panelInstanceKey,
      state: 'disposed',
    } satisfies ExtensionHostWebviewLifecycleEventPayload);
  }

  private async ensureActivated(
    extensionId: string,
    activationEvent: ExtensionActivationEvent,
  ): Promise<ExtensionHostSession> {
    const existingSession = this.sessions.get(extensionId);
    if (existingSession) {
      await existingSession.readyPromise;
      return existingSession;
    }

    const descriptor = pluginDiscoveryService.getById(extensionId);
    if (!descriptor) {
      throw new Error(`Extension descriptor not found: ${extensionId}`);
    }

    return this.startHost(descriptor, activationEvent);
  }

  private async startHost(
    descriptor: ExtensionRuntimeDescriptor,
    activationEvent: ExtensionActivationEvent,
  ): Promise<ExtensionHostSession> {
    const existingSession = this.sessions.get(descriptor.manifest.id);
    if (existingSession) {
      await existingSession.readyPromise;
      return existingSession;
    }

    const deferred = createDeferredPromise();
    const sessionId = `${descriptor.manifest.id}:${Date.now()}`;
    const hostBootstrapPath = this.resolveHostBootstrapPath();
    const child = fork(hostBootstrapPath, [], {
      silent: true,
    });
    const storageDirectory = path.join(
      app.getPath('userData'),
      'PluginStorage',
      descriptor.manifest.id,
    );
    await fsp.mkdir(storageDirectory, { recursive: true });

    const session: ExtensionHostSession = {
      descriptor,
      child,
      sessionId,
      storageDirectory,
      pendingRequests: new Map<string, PendingRequestResolver>(),
      requestCounter: 0,
      state: 'starting',
      readyPromise: deferred.promise,
      resolveReady: deferred.resolve,
      rejectReady: deferred.reject,
    };

    this.sessions.set(descriptor.manifest.id, session);
    this.attachProcessListeners(session);

    const bootstrapPayload: ExtensionHostBootstrapPayload = {
      sessionId,
      extensionId: descriptor.manifest.id,
      manifestPath: descriptor.manifestPath,
      entryFile: descriptor.entryFile,
      rootDirectory: descriptor.rootDirectory,
      storageDirectory,
      hostVersion: EXTENSION_PLATFORM_VERSION,
      activationEvent,
      permissions: [...descriptor.manifest.permissions],
    };

    this.sendEnvelope(session, {
      channel: EXTENSION_HOST_CHANNELS.bootstrap,
      payload: bootstrapPayload,
    });

    await session.readyPromise;
    return session;
  }

  private attachProcessListeners(session: ExtensionHostSession): void {
    session.child.on('message', (message: ProcessMessageValue) => {
      if (!isEnvelope(message)) {
        return;
      }

      void this.handleEnvelope(session, message);
    });

    session.child.on('exit', (code, signal) => {
      this.cleanupOnExit(session.descriptor.manifest.id);
      this.sessions.delete(session.descriptor.manifest.id);

      const exitMessage = `Extension host exited for ${session.descriptor.manifest.id} code=${code ?? 'null'} signal=${signal ?? 'null'}`;
      if (session.state === 'starting') {
        session.rejectReady(new Error(exitMessage));
      }

      for (const pending of session.pendingRequests.values()) {
        pending.reject(new Error(exitMessage));
      }
      session.pendingRequests.clear();
    });

    session.child.stdout?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message.length > 0) {
        console.log(`[ExtensionHost:${session.descriptor.manifest.id}] ${message}`);
      }
    });

    session.child.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString().trim();
      if (message.length > 0) {
        console.error(`[ExtensionHost:${session.descriptor.manifest.id}] ${message}`);
      }
    });
  }

  private async handleEnvelope(
    session: ExtensionHostSession,
    envelope: ExtensionHostEnvelope,
  ): Promise<void> {
    switch (envelope.channel) {
      case EXTENSION_HOST_CHANNELS.request:
        await this.handleHostRequest(session, envelope);
        break;
      case EXTENSION_HOST_CHANNELS.response:
        this.handleHostResponse(session, envelope);
        break;
      case EXTENSION_HOST_CHANNELS.event:
        this.handleHostEvent(session, envelope);
        break;
      case EXTENSION_HOST_CHANNELS.bootstrap:
        break;
      default:
        break;
    }
  }

  private async handleHostRequest(
    session: ExtensionHostSession,
    envelope: ExtensionHostRequestEnvelope,
  ): Promise<void> {
    const request = envelope.payload;
    let response: ExtensionHostResponseMessage;

    try {
      response = {
        id: request.id,
        ok: true,
        payload: await this.routeHostCapabilityRequest(session, request),
      };
    } catch (error) {
      response = createErrorResponse(
        request.id,
        'EXTENSION_HOST_REQUEST_FAILED',
        toErrorMessage(error instanceof Error ? error : String(error)),
      );
    }

    this.sendEnvelope(session, {
      channel: EXTENSION_HOST_CHANNELS.response,
      payload: response,
    });
  }

  private handleHostResponse(
    session: ExtensionHostSession,
    envelope: ExtensionHostResponseEnvelope,
  ): void {
    const pending = session.pendingRequests.get(envelope.payload.id);
    if (!pending) {
      return;
    }

    session.pendingRequests.delete(envelope.payload.id);

    if (envelope.payload.ok) {
      pending.resolve(envelope.payload.payload);
      return;
    }

    pending.reject(new Error(envelope.payload.error.message));
  }

  private handleHostEvent(
    session: ExtensionHostSession,
    envelope: ExtensionHostEventEnvelope,
  ): void {
    const lifecyclePayload = envelope.payload.event === 'lifecycle.state'
      ? parseLifecyclePayload(envelope.payload.payload)
      : null;

    if (lifecyclePayload) {
      if (lifecyclePayload.state === 'activated') {
        session.state = 'active';
        session.resolveReady();
      }

      if (lifecyclePayload.state === 'failed') {
        session.state = 'failed';
        session.rejectReady(new Error(lifecyclePayload.message ?? 'Extension host activation failed.'));
      }

      return;
    }

    const commandPayload = envelope.payload.event === 'commands.register'
      ? parseRegisteredCommandPayload(envelope.payload.payload)
      : null;

    if (commandPayload) {
      const { commandId } = commandPayload;
      aiPanelActionRegistry.registerCommand(
        session.descriptor.manifest.id,
        commandId,
        async () => this.executeRegisteredCommand(session.descriptor.manifest.id, commandId),
      );
      return;
    }

    const toolPayload = envelope.payload.event === 'ai.registerTool'
      ? parseRegisteredToolPayload(envelope.payload.payload)
      : null;

    if (toolPayload) {
      const { toolId } = toolPayload;
      aiPanelActionRegistry.registerTool(
        session.descriptor.manifest.id,
        toolId,
        async () => this.executeRegisteredTool(session.descriptor.manifest.id, toolId),
      );
    }
  }

  private async routeHostCapabilityRequest(
    session: ExtensionHostSession,
    request: ExtensionHostRequestMessage,
  ): Promise<JsonValue | null> {
    if (request.capability === 'commands.execute') {
      return this.executeRoutedCommand(request.payload);
    }

    return pluginCapabilityRouter.route({
      extensionId: session.descriptor.manifest.id,
      permissions: session.descriptor.manifest.permissions,
      storageDirectory: session.storageDirectory,
    }, request);
  }

  private async executeRoutedCommand(payload: JsonValue | null): Promise<JsonValue | null> {
    const commandRequest = parseCommandExecutionPayload(payload);
    if (!commandRequest) {
      throw new Error('commands.execute payload is invalid.');
    }

    return this.executeContributedCommand(commandRequest.commandId, commandRequest.args);
  }

  private async sendRequest(
    session: ExtensionHostSession,
    capability: ExtensionCapability,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const requestId = `${session.sessionId}:request:${session.requestCounter}`;
    session.requestCounter += 1;

    const responsePromise = new Promise<JsonValue | null>((resolve, reject) => {
      session.pendingRequests.set(requestId, {
        resolve,
        reject,
      });
    });

    this.sendEnvelope(session, {
      channel: EXTENSION_HOST_CHANNELS.request,
      payload: {
        id: requestId,
        extensionId: session.descriptor.manifest.id,
        capability,
        payload,
      },
    });

    return responsePromise;
  }

  private sendEnvelope(session: ExtensionHostSession, envelope: ExtensionHostEnvelope): void {
    session.child.send(envelope);
  }

  private sendEvent(session: ExtensionHostSession, event: string, payload: JsonValue | null): void {
    this.sendEnvelope(session, {
      channel: EXTENSION_HOST_CHANNELS.event,
      payload: {
        extensionId: session.descriptor.manifest.id,
        event,
        payload,
      },
    });
  }

  private async stopSession(extensionId: string): Promise<void> {
    const session = this.sessions.get(extensionId);
    if (!session) {
      return;
    }

    this.sessions.delete(extensionId);

    for (const pending of session.pendingRequests.values()) {
      pending.reject(new Error(`Extension host reloaded: ${extensionId}`));
    }
    session.pendingRequests.clear();

    if (session.child.exitCode !== null || session.child.signalCode !== null) {
      this.cleanupOnExit(extensionId);
      return;
    }

    session.child.kill();
    await waitForChildProcessExit(session.child, this.shutdownTimeoutMs);
  }

  private resolveHostBootstrapPath(): string {
    const bootstrapPath = path.join(__dirname, 'host', 'ExtensionHostBootstrap.js');
    if (!fs.existsSync(bootstrapPath)) {
      throw new Error(`Extension host bootstrap script not found: ${bootstrapPath}`);
    }

    return bootstrapPath;
  }

  private cleanupOnExit(extensionId: string): void {
    aiPanelActionRegistry.clearExtension(extensionId);
    workbenchContributionRegistry.clearRuntimeWebviewPanels(extensionId);
  }
}

export const pluginHostManager = PluginHostManager.getInstance();
