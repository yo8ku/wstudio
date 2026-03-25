/**
 * Main-process capability router for isolated plugin hosts.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ResolvedExtensionManifest } from '@note-studio/extension-api';
import type {
  ExtensionHostAIInvocationRequestPayload,
  ExtensionHostAIInvocationResponsePayload,
  ExtensionHostEditorReadRequestPayload,
  ExtensionHostEditorReadResponsePayload,
  ExtensionHostEditorWriteRequestPayload,
  ExtensionHostNoteDocumentPayload,
  ExtensionHostNoteReadRequestPayload,
  ExtensionHostNoteWriteRequestPayload,
  ExtensionHostRequestMessage,
  ExtensionHostSettingsRequestPayload,
  ExtensionHostStorageRequestPayload,
  ExtensionHostTextEditPayload,
  ExtensionHostWebviewCreatePanelRequestPayload,
  ExtensionHostWebviewPanelCreatedResponsePayload,
  ExtensionHostWebviewRequestPayload,
  ExtensionHostWindowNotificationPayload,
  ExtensionHostWorkspaceFileEntryPayload,
  ExtensionHostWorkspaceReadRequestPayload,
  ExtensionHostWorkspaceSearchRequestPayload,
  ExtensionHostWorkspaceSearchResultPayload,
  ExtensionHostWorkspaceWriteRequestPayload,
  ExtensionPermission,
  JsonObject,
  JsonValue,
} from '@note-studio/shared';
import { noteDatabase } from '../note-system';
import type { SettingsManager } from '../config/SettingsManager';
import type { WorkspaceManager } from '../workspace/WorkspaceManager';
import type { BuiltinAI } from '../services/BuiltinAI';
import {
  searchWorkspaceText,
  toWorkspaceRelativePath,
  WORKSPACE_SEARCH_SKIPPED_DIRECTORIES,
} from '../workspace/WorkspaceTextSearchService';
import type { PluginEditorBridge } from './PluginEditorBridge';
import { resolveExtensionAssetUrl } from './ExtensionAssetUrl';
import { PluginStorageRepository } from './capabilities/PluginStorageRepository';
import { broadcastWorkbenchWebviewMessage } from './WorkbenchContributionBroadcaster';
import { pluginDiscoveryService } from './PluginDiscoveryService';
import { workbenchContributionRegistry } from './WorkbenchContributionRegistry';

interface PluginCapabilityRouterDependencies {
  readonly settingsManager: SettingsManager;
  readonly workspaceManager: WorkspaceManager;
  readonly builtinAI: BuiltinAI;
  readonly editorBridge: PluginEditorBridge;
}

export interface PluginCapabilitySessionContext {
  readonly extensionId: string;
  readonly permissions: readonly ExtensionPermission[];
  readonly storageDirectory: string;
}

const MAX_WORKSPACE_READ_BYTES = 1024 * 1024;

function isJsonObjectValue(value: JsonValue | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArrayValue(value: JsonValue | null): value is JsonValue[] {
  return Array.isArray(value);
}

function toErrorMessage(error: Error | string): string {
  return error instanceof Error ? error.message : String(error);
}

function parseWindowNotificationPayload(
  payload: JsonValue | null,
): ExtensionHostWindowNotificationPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly level?: string;
    readonly message?: string;
  };

  if (
    (candidate.level === 'info' || candidate.level === 'warning' || candidate.level === 'error')
    && typeof candidate.message === 'string'
  ) {
    return {
      level: candidate.level,
      message: candidate.message,
    };
  }

  return null;
}

function parseStorageRequestPayload(
  payload: JsonValue | null,
): ExtensionHostStorageRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly key?: string;
    readonly value?: JsonValue | null;
  };

  if (
    (candidate.action === 'get' || candidate.action === 'set' || candidate.action === 'delete')
    && typeof candidate.key === 'string'
  ) {
    return {
      action: candidate.action,
      key: candidate.key,
      value: candidate.value ?? null,
    };
  }

  return null;
}

function parseSettingsRequestPayload(
  payload: JsonValue | null,
): ExtensionHostSettingsRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly key?: string;
    readonly value?: JsonValue | null;
  };

  if (
    (candidate.action === 'get' || candidate.action === 'set')
    && typeof candidate.key === 'string'
  ) {
    return {
      action: candidate.action,
      key: candidate.key,
      value: candidate.value ?? null,
    };
  }

  return null;
}

function parseWorkspaceReadRequestPayload(
  payload: JsonValue | null,
): ExtensionHostWorkspaceReadRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly path?: string | null;
  };

  if (
    (candidate.action === 'list-files' || candidate.action === 'read-text-file')
    && (candidate.path === undefined || candidate.path === null || typeof candidate.path === 'string')
  ) {
    return {
      action: candidate.action,
      path: candidate.path ?? null,
    };
  }

  return null;
}

function parseWorkspaceWriteRequestPayload(
  payload: JsonValue | null,
): ExtensionHostWorkspaceWriteRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly path?: string;
    readonly content?: string;
  };

  if (
    candidate.action === 'write-text-file'
    && typeof candidate.path === 'string'
    && typeof candidate.content === 'string'
  ) {
    return {
      action: candidate.action,
      path: candidate.path,
      content: candidate.content,
    };
  }

  return null;
}

function parseWorkspaceSearchRequestPayload(
  payload: JsonValue | null,
): ExtensionHostWorkspaceSearchRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly query?: string;
  };

  if (typeof candidate.query === 'string') {
    return {
      query: candidate.query,
    };
  }

  return null;
}

function parseNoteReadRequestPayload(
  payload: JsonValue | null,
): ExtensionHostNoteReadRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly noteId?: string | null;
  };

  if (
    (candidate.action === 'list' || candidate.action === 'read')
    && (candidate.noteId === undefined || candidate.noteId === null || typeof candidate.noteId === 'string')
  ) {
    return {
      action: candidate.action,
      noteId: candidate.noteId ?? null,
    };
  }

  return null;
}

function parseNoteWriteRequestPayload(
  payload: JsonValue | null,
): ExtensionHostNoteWriteRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly noteId?: string | null;
    readonly title?: string | null;
    readonly content?: string;
  };

  if (
    (candidate.action === 'create' || candidate.action === 'update')
    && typeof candidate.content === 'string'
    && (candidate.noteId === undefined || candidate.noteId === null || typeof candidate.noteId === 'string')
    && (candidate.title === undefined || candidate.title === null || typeof candidate.title === 'string')
  ) {
    return {
      action: candidate.action,
      noteId: candidate.noteId ?? null,
      title: candidate.title ?? null,
      content: candidate.content,
    };
  }

  return null;
}

function parseTextRangePayload(value: JsonValue | null): ExtensionHostTextEditPayload['range'] | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const candidate = value as {
    readonly startLine?: number;
    readonly startColumn?: number;
    readonly endLine?: number;
    readonly endColumn?: number;
  };

  if (
    typeof candidate.startLine === 'number'
    && typeof candidate.startColumn === 'number'
    && typeof candidate.endLine === 'number'
    && typeof candidate.endColumn === 'number'
  ) {
    return {
      startLine: candidate.startLine,
      startColumn: candidate.startColumn,
      endLine: candidate.endLine,
      endColumn: candidate.endColumn,
    };
  }

  return null;
}

function parseTextEditPayload(value: JsonValue | null): ExtensionHostTextEditPayload | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const candidate = value as {
    readonly range?: JsonValue;
    readonly text?: string;
  };
  const range = parseTextRangePayload(candidate.range ?? null);

  if (range && typeof candidate.text === 'string') {
    return {
      range,
      text: candidate.text,
    };
  }

  return null;
}

function parseEditorReadRequestPayload(
  payload: JsonValue | null,
): ExtensionHostEditorReadRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
  };

  if (candidate.action === 'get-active-document-text' || candidate.action === 'get-selection') {
    return {
      action: candidate.action,
    };
  }

  return null;
}

function parseEditorWriteRequestPayload(
  payload: JsonValue | null,
): ExtensionHostEditorWriteRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly action?: string;
    readonly documentUri?: string;
    readonly edits?: JsonValue;
  };

  const rawEdits = candidate.edits ?? null;
  if (candidate.action !== 'apply-text-edits' || typeof candidate.documentUri !== 'string' || !isJsonArrayValue(rawEdits)) {
    return null;
  }

  const edits: ExtensionHostTextEditPayload[] = [];
  for (const item of rawEdits) {
    const parsedEdit = parseTextEditPayload(item);
    if (!parsedEdit) {
      return null;
    }
    edits.push(parsedEdit);
  }

  return {
    action: candidate.action,
    documentUri: candidate.documentUri,
    edits,
  };
}

function parseAIInvocationRequestPayload(
  payload: JsonValue | null,
): ExtensionHostAIInvocationRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const candidate = payload as {
    readonly model?: string;
    readonly messages?: JsonValue;
    readonly tools?: JsonValue;
  };

  const rawMessages = candidate.messages ?? null;
  if (typeof candidate.model !== 'string' || !isJsonArrayValue(rawMessages)) {
    return null;
  }

  const messages: ExtensionHostAIInvocationRequestPayload['messages'] = [];
  for (const entry of rawMessages) {
    if (!isJsonObjectValue(entry)) {
      return null;
    }

    const message = entry as {
      readonly role?: string;
      readonly content?: string;
    };

    if (
      (message.role === 'system' || message.role === 'user' || message.role === 'assistant' || message.role === 'tool')
      && typeof message.content === 'string'
    ) {
      messages.push({
        role: message.role,
        content: message.content,
      });
      continue;
    }

    return null;
  }

  const rawTools = candidate.tools ?? null;
  let tools: ExtensionHostAIInvocationRequestPayload['tools'] = null;

  if (rawTools !== null) {
    if (!isJsonArrayValue(rawTools)) {
      return null;
    }

    const parsedTools: ExtensionHostAIInvocationRequestPayload['tools'] = [];
    for (const entry of rawTools) {
      if (!isJsonObjectValue(entry)) {
        return null;
      }

      const tool = entry as {
        readonly id?: string;
        readonly description?: string;
        readonly inputSchema?: JsonValue;
      };
      const inputSchema = tool.inputSchema ?? null;

      if (
        typeof tool.id !== 'string'
        || typeof tool.description !== 'string'
        || !isJsonObjectValue(inputSchema)
      ) {
        return null;
      }

      parsedTools.push({
        id: tool.id,
        description: tool.description,
        inputSchema,
      });
    }

    tools = parsedTools;
  }

  return {
    model: candidate.model,
    messages,
    tools,
  };
}

function parseWebviewRequestPayload(
  payload: JsonValue | null,
): ExtensionHostWebviewRequestPayload | null {
  if (!isJsonObjectValue(payload)) {
    return null;
  }

  const action = payload.action;
  if (action === 'create-panel') {
    const panelId = payload.panelId;
    const title = payload.title;
    if (typeof panelId === 'string' && typeof title === 'string') {
      return {
        action,
        panelId,
        title,
      };
    }

    return null;
  }

  if (action === 'reveal-panel' || action === 'dispose-panel') {
    const panelInstanceKey = payload.panelInstanceKey;
    if (typeof panelInstanceKey === 'string') {
      return {
        action,
        panelInstanceKey,
      };
    }

    return null;
  }

  if (action === 'post-message') {
    const panelInstanceKey = payload.panelInstanceKey;
    const message = payload.message;
    if (typeof panelInstanceKey === 'string' && message !== undefined) {
      return {
        action,
        panelInstanceKey,
        message,
      };
    }

    return null;
  }

  return null;
}

function namespacePluginSettingKey(extensionId: string, key: string): string {
  return `extensions.${extensionId}.${key}`;
}

function sanitizeNoteFileName(title: string): string {
  const normalized = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized.length > 0 ? normalized : `note-${Date.now()}`;
}

function resolvePluginWebviewEntryUrl(
  extensionId: string,
  rootDirectory: string,
  entryPath: string,
): string {
  const entryUrl = resolveExtensionAssetUrl(extensionId, rootDirectory, entryPath);
  if (!entryUrl) {
    throw new Error(`Webview entry is invalid or missing: ${entryPath}`);
  }

  return entryUrl;
}

function toNoteDocumentPayload(note: {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly path: string;
  readonly updatedAt: number;
}): ExtensionHostNoteDocumentPayload {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    path: note.path,
    updatedAt: new Date(note.updatedAt).toISOString(),
  };
}

export class PluginCapabilityRouter {
  private static instance: PluginCapabilityRouter | null = null;

  private dependencies: PluginCapabilityRouterDependencies | null = null;

  public static getInstance(): PluginCapabilityRouter {
    if (!PluginCapabilityRouter.instance) {
      PluginCapabilityRouter.instance = new PluginCapabilityRouter();
    }

    return PluginCapabilityRouter.instance;
  }

  public configure(dependencies: PluginCapabilityRouterDependencies): void {
    this.dependencies = dependencies;
  }

  public async route(
    session: PluginCapabilitySessionContext,
    request: ExtensionHostRequestMessage,
  ): Promise<JsonValue | null> {
    const dependencies = this.requireDependencies();

    switch (request.capability) {
      case 'window.notifications':
        return this.handleWindowNotification(session, request.payload);
      case 'storage':
        this.assertPermission(session, 'storage');
        return this.handleStorageRequest(session, request.payload);
      case 'settings':
        return this.handleSettingsRequest(dependencies.settingsManager, session, request.payload);
      case 'workspace.read':
        this.assertPermission(session, 'workspace.read');
        return this.handleWorkspaceReadRequest(dependencies.workspaceManager, request.payload);
      case 'workspace.write':
        this.assertPermission(session, 'workspace.write');
        return this.handleWorkspaceWriteRequest(dependencies.workspaceManager, request.payload);
      case 'workspace.search':
        this.assertPermission(session, 'workspace.search');
        return this.handleWorkspaceSearchRequest(dependencies.workspaceManager, request.payload);
      case 'notes.read':
        this.assertPermission(session, 'notes.read');
        return this.handleNoteReadRequest(request.payload);
      case 'notes.write':
        this.assertPermission(session, 'notes.write');
        return this.handleNoteWriteRequest(session, request.payload);
      case 'editor.read':
        this.assertPermission(session, 'editor.read');
        return this.handleEditorReadRequest(dependencies.editorBridge, request.payload);
      case 'editor.write':
        this.assertPermission(session, 'editor.write');
        return this.handleEditorWriteRequest(dependencies.editorBridge, request.payload);
      case 'ai.invoke':
        this.assertPermission(session, 'ai.invoke');
        return this.handleAIInvokeRequest(dependencies.builtinAI, request.payload);
      case 'webview':
        this.assertPermission(session, 'webview');
        return this.handleWebviewRequest(session, request.payload);
      case 'commands.execute':
      case 'commands.register':
      case 'network':
      case 'ai.tool.execute':
      case 'shell.openExternal':
        throw new Error(`Capability is not implemented in the plugin router yet: ${request.capability}`);
      default:
        throw new Error(`Capability is not supported: ${request.capability satisfies never}`);
    }
  }

  private requireDependencies(): PluginCapabilityRouterDependencies {
    if (!this.dependencies) {
      throw new Error('Plugin capability router has not been configured.');
    }

    return this.dependencies;
  }

  private assertPermission(
    session: PluginCapabilitySessionContext,
    permission: ExtensionPermission,
  ): void {
    if (!session.permissions.includes(permission)) {
      throw new Error(`Permission denied for ${session.extensionId}: ${permission}`);
    }
  }

  private async handleWindowNotification(
    session: PluginCapabilitySessionContext,
    payload: JsonValue | null,
  ): Promise<null> {
    const notificationPayload = parseWindowNotificationPayload(payload);
    if (!notificationPayload) {
      throw new Error('window.notifications payload is invalid.');
    }

    console.log(
      `[ExtensionHost:${session.extensionId}] ${notificationPayload.level.toUpperCase()}: ${notificationPayload.message}`,
    );
    return null;
  }

  private async handleStorageRequest(
    session: PluginCapabilitySessionContext,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const request = parseStorageRequestPayload(payload);
    if (!request) {
      throw new Error('storage payload is invalid.');
    }

    const repository = new PluginStorageRepository(session.storageDirectory);
    switch (request.action) {
      case 'get':
        return repository.get(request.key);
      case 'set':
        if (request.value === undefined) {
          throw new Error('storage.set requires a value.');
        }
        await repository.set(request.key, request.value);
        return null;
      case 'delete':
        await repository.delete(request.key);
        return null;
      default:
        throw new Error(`Unsupported storage action: ${request.action satisfies never}`);
    }
  }

  private async handleSettingsRequest(
    settingsManager: SettingsManager,
    session: PluginCapabilitySessionContext,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const request = parseSettingsRequestPayload(payload);
    if (!request) {
      throw new Error('settings payload is invalid.');
    }

    const namespacedKey = namespacePluginSettingKey(session.extensionId, request.key);
    switch (request.action) {
      case 'get':
        return settingsManager.getPluginSetting<JsonValue>(namespacedKey, null) ?? null;
      case 'set':
        if (request.value === undefined) {
          throw new Error('settings.set requires a value.');
        }
        await settingsManager.updatePluginSetting(namespacedKey, request.value, 'user');
        return null;
      default:
        throw new Error(`Unsupported settings action: ${request.action satisfies never}`);
    }
  }

  private async handleWorkspaceReadRequest(
    workspaceManager: WorkspaceManager,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const request = parseWorkspaceReadRequestPayload(payload);
    if (!request) {
      throw new Error('workspace.read payload is invalid.');
    }

    const workspaceDirectory = workspaceManager.getWorkspaceDir();
    switch (request.action) {
      case 'list-files':
        return this.listWorkspaceEntries(workspaceDirectory);
      case 'read-text-file':
        if (typeof request.path !== 'string' || request.path.trim().length === 0) {
          throw new Error('workspace.read requires a file path.');
        }
        return this.readWorkspaceTextFile(workspaceDirectory, request.path);
      default:
        throw new Error(`Unsupported workspace.read action: ${request.action satisfies never}`);
    }
  }

  private async handleWorkspaceWriteRequest(
    workspaceManager: WorkspaceManager,
    payload: JsonValue | null,
  ): Promise<null> {
    const request = parseWorkspaceWriteRequestPayload(payload);
    if (!request) {
      throw new Error('workspace.write payload is invalid.');
    }

    const workspaceDirectory = workspaceManager.getWorkspaceDir();
    const targetPath = this.resolveWorkspacePath(workspaceDirectory, request.path);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, request.content, 'utf8');
    return null;
  }

  private async handleWorkspaceSearchRequest(
    workspaceManager: WorkspaceManager,
    payload: JsonValue | null,
  ): Promise<ExtensionHostWorkspaceSearchResultPayload[]> {
    const request = parseWorkspaceSearchRequestPayload(payload);
    if (!request) {
      throw new Error('workspace.search payload is invalid.');
    }

    const query = request.query.trim();
    if (query.length === 0) {
      return [];
    }

    const workspaceDirectory = workspaceManager.getWorkspaceDir();
    const searchResponse = await searchWorkspaceText(workspaceDirectory, { query });
    return searchResponse.items.map((item) => ({
      path: item.relativePath,
      line: item.line,
      preview: item.preview,
    }));
  }

  private async handleNoteReadRequest(
    payload: JsonValue | null,
  ): Promise<ExtensionHostNoteDocumentPayload[] | ExtensionHostNoteDocumentPayload | null> {
    const request = parseNoteReadRequestPayload(payload);
    if (!request) {
      throw new Error('notes.read payload is invalid.');
    }

    switch (request.action) {
      case 'list': {
        const notes = await noteDatabase.getAllNotes();
        return notes.map(note => toNoteDocumentPayload(note));
      }
      case 'read': {
        if (typeof request.noteId !== 'string' || request.noteId.trim().length === 0) {
          throw new Error('notes.read requires a noteId.');
        }

        const note = await noteDatabase.getNote(request.noteId);
        if (!note) {
          throw new Error(`Note not found: ${request.noteId}`);
        }

        return toNoteDocumentPayload(note);
      }
      default:
        throw new Error(`Unsupported notes.read action: ${request.action satisfies never}`);
    }
  }

  private async handleNoteWriteRequest(
    session: PluginCapabilitySessionContext,
    payload: JsonValue | null,
  ): Promise<ExtensionHostNoteDocumentPayload | null> {
    const request = parseNoteWriteRequestPayload(payload);
    if (!request) {
      throw new Error('notes.write payload is invalid.');
    }

    switch (request.action) {
      case 'create': {
        const noteTitle = typeof request.title === 'string' && request.title.trim().length > 0
          ? request.title.trim()
          : 'Untitled Note';
        const notePath = `plugins/${session.extensionId}/${sanitizeNoteFileName(noteTitle)}.md`;
        const created = await noteDatabase.createNote({
          title: noteTitle,
          content: request.content,
          path: notePath,
          type: 'normal',
        });
        return toNoteDocumentPayload(created);
      }
      case 'update': {
        if (typeof request.noteId !== 'string' || request.noteId.trim().length === 0) {
          throw new Error('notes.update requires a noteId.');
        }

        const updated = await noteDatabase.updateNote(request.noteId, {
          content: request.content,
        });
        if (!updated) {
          throw new Error(`Failed to update note: ${request.noteId}`);
        }
        return null;
      }
      default:
        throw new Error(`Unsupported notes.write action: ${request.action satisfies never}`);
    }
  }

  private async handleEditorReadRequest(
    editorBridge: PluginEditorBridge,
    payload: JsonValue | null,
  ): Promise<ExtensionHostEditorReadResponsePayload> {
    const request = parseEditorReadRequestPayload(payload);
    if (!request) {
      throw new Error('editor.read payload is invalid.');
    }

    const state = await editorBridge.getState();
    return {
      documentUri: state.documentUri,
      content: state.content,
      selection: request.action === 'get-selection' ? state.selection : null,
    };
  }

  private async handleEditorWriteRequest(
    editorBridge: PluginEditorBridge,
    payload: JsonValue | null,
  ): Promise<null> {
    const request = parseEditorWriteRequestPayload(payload);
    if (!request) {
      throw new Error('editor.write payload is invalid.');
    }

    await editorBridge.applyTextEdits(request.documentUri, request.edits);
    return null;
  }

  private async handleWebviewRequest(
    session: PluginCapabilitySessionContext,
    payload: JsonValue | null,
  ): Promise<JsonValue | null> {
    const request = parseWebviewRequestPayload(payload);
    if (!request) {
      throw new Error('webview payload is invalid.');
    }

    const descriptor = pluginDiscoveryService.getById(session.extensionId);
    if (!descriptor) {
      throw new Error(`Plugin descriptor not found: ${session.extensionId}`);
    }

    switch (request.action) {
      case 'create-panel':
        return this.handleWebviewCreatePanelRequest(
          descriptor.rootDirectory,
          descriptor.manifest,
          request,
        );
      case 'reveal-panel': {
        const panelEntry = workbenchContributionRegistry.getRuntimeWebviewPanel(
          request.panelInstanceKey,
        );
        if (!panelEntry || panelEntry.extensionId !== session.extensionId) {
          throw new Error(`Runtime webview panel not found: ${request.panelInstanceKey}`);
        }

        workbenchContributionRegistry.revealRuntimeWebviewPanel(request.panelInstanceKey);
        return null;
      }
      case 'post-message': {
        const panelEntry = workbenchContributionRegistry.getRuntimeWebviewPanel(
          request.panelInstanceKey,
        );
        if (!panelEntry || panelEntry.extensionId !== session.extensionId) {
          throw new Error(`Runtime webview panel not found: ${request.panelInstanceKey}`);
        }

        broadcastWorkbenchWebviewMessage({
          panelInstanceKey: request.panelInstanceKey,
          message: request.message,
        });
        return null;
      }
      case 'dispose-panel': {
        const panelEntry = workbenchContributionRegistry.getRuntimeWebviewPanel(
          request.panelInstanceKey,
        );
        if (!panelEntry || panelEntry.extensionId !== session.extensionId) {
          throw new Error(`Runtime webview panel not found: ${request.panelInstanceKey}`);
        }

        workbenchContributionRegistry.disposeRuntimeWebviewPanel(request.panelInstanceKey);
        return null;
      }
      default:
        throw new Error('Unsupported webview action.');
    }
  }

  private handleWebviewCreatePanelRequest(
    rootDirectory: string,
    manifest: ResolvedExtensionManifest,
    request: ExtensionHostWebviewCreatePanelRequestPayload,
  ): ExtensionHostWebviewPanelCreatedResponsePayload {
    const webviewContribution = (manifest.contributes.webviews ?? []).find(
      entry => entry.id === request.panelId,
    );

    if (!webviewContribution) {
      throw new Error(`Webview contribution not found: ${request.panelId}`);
    }

    const panelEntry = workbenchContributionRegistry.registerRuntimeWebviewPanel({
      extensionId: manifest.id,
      extensionDisplayName: manifest.displayName,
      panelId: request.panelId,
      title: request.title.trim().length > 0 ? request.title.trim() : webviewContribution.title,
      webviewEntryUrl: resolvePluginWebviewEntryUrl(
        manifest.id,
        rootDirectory,
        webviewContribution.entry,
      ),
      webviewHtml: null,
      retainContextWhenHidden: webviewContribution.retainContextWhenHidden ?? false,
    });

    return {
      panelInstanceKey: panelEntry.panelInstanceKey,
      panelId: panelEntry.panelId,
      title: panelEntry.title,
    };
  }

  private async handleAIInvokeRequest(
    builtinAI: BuiltinAI,
    payload: JsonValue | null,
  ): Promise<ExtensionHostAIInvocationResponsePayload> {
    const request = parseAIInvocationRequestPayload(payload);
    if (!request) {
      throw new Error('ai.invoke payload is invalid.');
    }

    const modelId = request.model === 'default'
      ? this.resolveDefaultAIModel(builtinAI)
      : request.model;

    const content = await builtinAI.chat(
      modelId,
      request.messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
    );

    return {
      content,
      stopReason: 'completed',
      toolCalls: null,
    };
  }

  private resolveDefaultAIModel(builtinAI: BuiltinAI): string {
    const models = builtinAI.getAvailableModels();
    if (models.length === 0) {
      throw new Error('No builtin AI model is available for default plugin invocation.');
    }

    return models[0];
  }

  private resolveWorkspacePath(workspaceDirectory: string, targetPath: string): string {
    const resolvedPath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(workspaceDirectory, targetPath);
    const normalizedWorkspacePath = path.resolve(workspaceDirectory);
    const relativePath = path.relative(normalizedWorkspacePath, resolvedPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Workspace path escapes the workspace root: ${targetPath}`);
    }

    return resolvedPath;
  }

  private async listWorkspaceEntries(workspaceDirectory: string): Promise<ExtensionHostWorkspaceFileEntryPayload[]> {
    const entries: ExtensionHostWorkspaceFileEntryPayload[] = [];
    await this.collectWorkspaceEntries(workspaceDirectory, workspaceDirectory, entries);
    return entries;
  }

  private async collectWorkspaceEntries(
    workspaceDirectory: string,
    currentDirectory: string,
    entries: ExtensionHostWorkspaceFileEntryPayload[],
  ): Promise<void> {
    const directoryEntries = await fs.readdir(currentDirectory, { withFileTypes: true });
    for (const entry of directoryEntries) {
      if (entry.name.startsWith('.') && entry.name !== '.vscode') {
        continue;
      }
      if (entry.isDirectory() && WORKSPACE_SEARCH_SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const absolutePath = path.join(currentDirectory, entry.name);
      entries.push({
        path: toWorkspaceRelativePath(workspaceDirectory, absolutePath),
        isDirectory: entry.isDirectory(),
      });

      if (entry.isDirectory()) {
        await this.collectWorkspaceEntries(workspaceDirectory, absolutePath, entries);
      }
    }
  }

  private async readWorkspaceTextFile(workspaceDirectory: string, targetPath: string): Promise<string> {
    const resolvedPath = this.resolveWorkspacePath(workspaceDirectory, targetPath);
    const stat = await fs.stat(resolvedPath);
    if (stat.size > MAX_WORKSPACE_READ_BYTES) {
      throw new Error(`Workspace file is too large to read through the plugin API: ${targetPath}`);
    }

    return fs.readFile(resolvedPath, 'utf8');
  }

}

export const pluginCapabilityRouter = PluginCapabilityRouter.getInstance();
