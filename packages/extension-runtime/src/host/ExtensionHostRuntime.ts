/**
 * 插件宿主进程内的运行时实现，负责 activate、命令注册和 AI tool 注册。
 */

import type {
  CommandHandler,
  ExtensionAIAPI,
  ExtensionAIInvocationResponse,
  ExtensionAIToolHandler,
  ExtensionCommandsApi,
  ExtensionContext,
  ExtensionEditorApi,
  ExtensionEditorSelection,
  ExtensionEnvironment,
  ExtensionNoteDocument,
  ExtensionNotesApi,
  ExtensionPlugin,
  ExtensionSettingsApi,
  ExtensionStorageApi,
  ExtensionTextRange,
  ExtensionWebviewApi,
  ExtensionWebviewMessageHandler,
  ExtensionWebviewPanel,
  ExtensionWindowApi,
  ExtensionWorkspaceApi,
  WorkspaceFileEntry,
  WorkspaceSearchResult,
  JsonValue,
  ResolvedExtensionManifest,
} from '@note-studio/extension-api';
import type {
  ExtensionCapability,
  ExtensionHostAIInvocationRequestPayload,
  ExtensionHostCommandExecutionPayload,
  ExtensionHostEditorReadRequestPayload,
  ExtensionHostEditorWriteRequestPayload,
  ExtensionHostWebviewPanelCreatedResponsePayload,
  ExtensionHostWebviewLifecycleEventPayload,
  ExtensionHostWebviewMessageEventPayload,
  ExtensionHostWebviewRequestPayload,
  ExtensionHostNoteReadRequestPayload,
  ExtensionHostNoteWriteRequestPayload,
  ExtensionHostRegisteredCommandEventPayload,
  ExtensionHostRegisteredToolEventPayload,
  ExtensionHostSettingsRequestPayload,
  ExtensionHostStorageRequestPayload,
  ExtensionHostToolExecutionPayload,
  ExtensionHostWindowNotificationPayload,
  ExtensionHostWorkspaceReadRequestPayload,
  ExtensionHostWorkspaceSearchRequestPayload,
  ExtensionHostWorkspaceWriteRequestPayload,
} from '@note-studio/shared';

export interface ExtensionHostBridge {
  notifyEvent(event: string, payload: JsonValue | null): Promise<void>;
  request(
    capability: ExtensionCapability,
    payload: JsonValue | null,
  ): Promise<JsonValue | null>;
}

export interface ExtensionHostRuntimeOptions {
  readonly manifest: ResolvedExtensionManifest;
  readonly environment: ExtensionEnvironment;
  readonly bridge: ExtensionHostBridge;
}

function isJsonObjectValue(value: JsonValue | null): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWorkspaceFileEntry(value: JsonValue | null): WorkspaceFileEntry | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const pathValue = value.path;
  const isDirectoryValue = value.isDirectory;
  if (typeof pathValue !== 'string' || typeof isDirectoryValue !== 'boolean') {
    return null;
  }

  return {
    path: pathValue,
    isDirectory: isDirectoryValue,
  };
}

function parseWorkspaceSearchResult(value: JsonValue | null): WorkspaceSearchResult | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const pathValue = value.path;
  const lineValue = value.line;
  const previewValue = value.preview;
  if (
    typeof pathValue !== 'string'
    || typeof lineValue !== 'number'
    || typeof previewValue !== 'string'
  ) {
    return null;
  }

  return {
    path: pathValue,
    line: lineValue,
    preview: previewValue,
  };
}

function parseNoteDocument(value: JsonValue | null): ExtensionNoteDocument | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const idValue = value.id;
  const titleValue = value.title;
  const contentValue = value.content;
  const pathValue = value.path;
  const updatedAtValue = value.updatedAt;
  if (
    typeof idValue !== 'string'
    || typeof titleValue !== 'string'
    || typeof contentValue !== 'string'
    || typeof pathValue !== 'string'
    || typeof updatedAtValue !== 'string'
  ) {
    return null;
  }

  return {
    id: idValue,
    title: titleValue,
    content: contentValue,
    path: pathValue,
    updatedAt: updatedAtValue,
  };
}

function parseTextRange(value: JsonValue | null): ExtensionTextRange | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const startLine = value.startLine;
  const startColumn = value.startColumn;
  const endLine = value.endLine;
  const endColumn = value.endColumn;
  if (
    typeof startLine !== 'number'
    || typeof startColumn !== 'number'
    || typeof endLine !== 'number'
    || typeof endColumn !== 'number'
  ) {
    return null;
  }

  return {
    startLine,
    startColumn,
    endLine,
    endColumn,
  };
}

function parseEditorSelection(value: JsonValue | null): ExtensionEditorSelection | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const documentUri = value.documentUri;
  const text = value.text;
  const range = parseTextRange(value.range ?? null);
  if (typeof documentUri !== 'string' || typeof text !== 'string' || !range) {
    return null;
  }

  return {
    documentUri,
    text,
    range,
  };
}

function parseEditorReadResponse(value: JsonValue | null): {
  readonly documentUri: string | null;
  readonly content: string | null;
  readonly selection: ExtensionEditorSelection | null;
} {
  if (!isJsonObjectValue(value)) {
    throw new Error('editor.read response is invalid.');
  }

  const documentUri = value.documentUri;
  const content = value.content;
  const selectionValue = value.selection ?? null;
  if (
    documentUri !== null && typeof documentUri !== 'string'
    || content !== null && typeof content !== 'string'
  ) {
    throw new Error('editor.read response payload is invalid.');
  }

  const selection = selectionValue === null ? null : parseEditorSelection(selectionValue);
  if (selectionValue !== null && !selection) {
    throw new Error('editor.read selection payload is invalid.');
  }

  return {
    documentUri,
    content,
    selection,
  };
}

function parseAIInvocationResponse(value: JsonValue | null): ExtensionAIInvocationResponse {
  if (!isJsonObjectValue(value)) {
    throw new Error('ai.invoke response is invalid.');
  }

  const content = value.content;
  const stopReason = value.stopReason;
  const toolCallsValue = value.toolCalls ?? null;

  if (
    typeof content !== 'string'
    || (stopReason !== 'completed' && stopReason !== 'max_tokens' && stopReason !== 'tool_call')
  ) {
    throw new Error('ai.invoke response payload is invalid.');
  }

  let toolCalls: ExtensionAIInvocationResponse['toolCalls'];
  if (toolCallsValue !== null) {
    if (!Array.isArray(toolCallsValue)) {
      throw new Error('ai.invoke toolCalls payload is invalid.');
    }

    const parsedToolCalls: Array<{
      readonly id: string;
      readonly toolId: string;
      readonly input: Record<string, JsonValue>;
    }> = [];
    for (const entry of toolCallsValue) {
      if (!isJsonObjectValue(entry)) {
        throw new Error('ai.invoke toolCalls entry is invalid.');
      }

      const id = entry.id;
      const toolId = entry.toolId;
      const input = entry.input;
      if (
        typeof id !== 'string'
        || typeof toolId !== 'string'
        || !isJsonObjectValue(input ?? null)
      ) {
        throw new Error('ai.invoke toolCalls entry payload is invalid.');
      }

      const inputObject = input as Record<string, JsonValue>;
      parsedToolCalls.push({
        id,
        toolId,
        input: inputObject,
      });
    }

    toolCalls = parsedToolCalls;
  }

  return {
    content,
    stopReason,
    toolCalls,
  };
}

function parseWebviewPanelCreatedResponse(
  value: JsonValue | null,
): ExtensionHostWebviewPanelCreatedResponsePayload {
  if (!isJsonObjectValue(value)) {
    throw new Error('webview.createPanel response is invalid.');
  }

  const panelInstanceKey = value.panelInstanceKey;
  const panelId = value.panelId;
  const title = value.title;
  if (
    typeof panelInstanceKey !== 'string'
    || typeof panelId !== 'string'
    || typeof title !== 'string'
  ) {
    throw new Error('webview.createPanel response payload is invalid.');
  }

  return {
    panelInstanceKey,
    panelId,
    title,
  };
}

function parseWebviewMessageEventPayload(
  value: JsonValue | null,
): ExtensionHostWebviewMessageEventPayload | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const panelInstanceKey = value.panelInstanceKey;
  const message = value.message;
  if (typeof panelInstanceKey !== 'string' || message === undefined) {
    return null;
  }

  return {
    panelInstanceKey,
    message,
  };
}

function parseWebviewLifecycleEventPayload(
  value: JsonValue | null,
): ExtensionHostWebviewLifecycleEventPayload | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const panelInstanceKey = value.panelInstanceKey;
  const state = value.state;
  if (typeof panelInstanceKey !== 'string' || state !== 'disposed') {
    return null;
  }

  return {
    panelInstanceKey,
    state,
  };
}

interface RuntimeWebviewPanelState {
  readonly panelId: string;
  readonly title: string;
  readonly handlers: Set<ExtensionWebviewMessageHandler>;
  readonly panel: ExtensionWebviewPanel;
}

export class ExtensionHostRuntime {
  private readonly bridge: ExtensionHostBridge;
  private readonly commands = new Map<string, CommandHandler>();
  private readonly tools = new Map<string, ExtensionAIToolHandler>();
  private readonly webviewPanels = new Map<string, RuntimeWebviewPanelState>();
  private readonly context: ExtensionContext;
  private plugin: ExtensionPlugin | null = null;
  private activated = false;

  public constructor(options: ExtensionHostRuntimeOptions) {
    this.bridge = options.bridge;
    this.context = {
      manifest: options.manifest,
      environment: options.environment,
      commands: this.createCommandsApi(),
      window: this.createWindowApi(),
      workspace: this.createWorkspaceApi(),
      storage: this.createStorageApi(),
      settings: this.createSettingsApi(),
      webview: this.createWebviewApi(),
      notes: this.createNotesApi(),
      editor: this.createEditorApi(),
      ai: this.createAIApi(),
      subscriptions: [],
    };
  }

  public async activate(plugin: ExtensionPlugin): Promise<void> {
    if (this.activated) {
      return;
    }

    this.plugin = plugin;
    await plugin.activate(this.context);
    this.activated = true;
  }

  public async deactivate(): Promise<void> {
    if (!this.plugin) {
      return;
    }

    if (this.plugin.deactivate) {
      await this.plugin.deactivate();
    }

    for (const disposable of this.context.subscriptions) {
      await disposable.dispose();
    }

    this.context.subscriptions.length = 0;
    this.commands.clear();
    this.tools.clear();
    this.webviewPanels.clear();
    this.plugin = null;
    this.activated = false;
  }

  public async executeCommand(payload: ExtensionHostCommandExecutionPayload): Promise<JsonValue | null> {
    const handler = this.commands.get(payload.commandId);
    if (!handler) {
      throw new Error(`Command not registered: ${payload.commandId}`);
    }

    const result = await handler(...payload.args);
    return result === undefined ? null : result;
  }

  public async executeTool(payload: ExtensionHostToolExecutionPayload): Promise<JsonValue | null> {
    const handler = this.tools.get(payload.toolId);
    if (!handler) {
      throw new Error(`AI tool not registered: ${payload.toolId}`);
    }

    const result = await handler(payload.input);
    return result === undefined ? null : result;
  }

  public async handleEvent(event: string, payload: JsonValue | null): Promise<void> {
    switch (event) {
      case 'webview.message':
        await this.handleWebviewMessageEvent(payload);
        return;
      case 'webview.lifecycle':
        this.handleWebviewLifecycleEvent(payload);
        return;
      default:
        return;
    }
  }

  private createCommandsApi(): ExtensionCommandsApi {
    return {
      register: (commandId, handler) => {
        this.commands.set(commandId, handler);

        void this.bridge.notifyEvent('commands.register', {
          commandId,
        } satisfies ExtensionHostRegisteredCommandEventPayload);

        return {
          dispose: (): void => {
            this.commands.delete(commandId);
          },
        };
      },
      execute: async (commandId, ...args): Promise<JsonValue | void> => {
        const localHandler = this.commands.get(commandId);
        if (localHandler) {
          return localHandler(...args);
        }

        return this.bridge.request('commands.execute', {
          commandId,
          args: [...args],
        } satisfies ExtensionHostCommandExecutionPayload);
      },
    };
  }

  private createWindowApi(): ExtensionWindowApi {
    const showNotification = async (
      level: ExtensionHostWindowNotificationPayload['level'],
      message: string,
    ): Promise<void> => {
      await this.bridge.request('window.notifications', {
        level,
        message,
      } satisfies ExtensionHostWindowNotificationPayload);
    };

    return {
      showInfo: async (message): Promise<void> => showNotification('info', message),
      showWarning: async (message): Promise<void> => showNotification('warning', message),
      showError: async (message): Promise<void> => showNotification('error', message),
    };
  }

  private createWorkspaceApi(): ExtensionWorkspaceApi {
    return {
      listFiles: async () => {
        const response = await this.bridge.request('workspace.read', {
          action: 'list-files',
          path: null,
        } satisfies ExtensionHostWorkspaceReadRequestPayload);

        if (!Array.isArray(response)) {
          throw new Error('workspace.listFiles response is invalid.');
        }

        return response.map((entry) => {
          const parsedEntry = parseWorkspaceFileEntry(entry);
          if (!parsedEntry) {
            throw new Error('workspace.listFiles entry is invalid.');
          }
          return parsedEntry;
        });
      },
      readTextFile: async (filePath) => {
        const response = await this.bridge.request('workspace.read', {
          action: 'read-text-file',
          path: filePath,
        } satisfies ExtensionHostWorkspaceReadRequestPayload);

        if (typeof response !== 'string') {
          throw new Error('workspace.readTextFile response is invalid.');
        }

        return response;
      },
      writeTextFile: async (filePath, content) => {
        await this.bridge.request('workspace.write', {
          action: 'write-text-file',
          path: filePath,
          content,
        } satisfies ExtensionHostWorkspaceWriteRequestPayload);
      },
      searchText: async (query) => {
        const response = await this.bridge.request('workspace.search', {
          query,
        } satisfies ExtensionHostWorkspaceSearchRequestPayload);

        if (!Array.isArray(response)) {
          throw new Error('workspace.searchText response is invalid.');
        }

        return response.map((entry) => {
          const parsedEntry = parseWorkspaceSearchResult(entry);
          if (!parsedEntry) {
            throw new Error('workspace.searchText entry is invalid.');
          }
          return parsedEntry;
        });
      },
    };
  }

  private createStorageApi(): ExtensionStorageApi {
    return {
      get: async <TValue extends JsonValue>(key: string): Promise<TValue | null> => {
        const response = await this.bridge.request('storage', {
          action: 'get',
          key,
          value: null,
        } satisfies ExtensionHostStorageRequestPayload);

        return response as TValue | null;
      },
      set: async (key, value): Promise<void> => {
        await this.bridge.request('storage', {
          action: 'set',
          key,
          value,
        } satisfies ExtensionHostStorageRequestPayload);
      },
      delete: async (key): Promise<void> => {
        await this.bridge.request('storage', {
          action: 'delete',
          key,
          value: null,
        } satisfies ExtensionHostStorageRequestPayload);
      },
    };
  }

  private createSettingsApi(): ExtensionSettingsApi {
    return {
      get: async <TValue extends JsonValue>(key: string): Promise<TValue | null> => {
        const response = await this.bridge.request('settings', {
          action: 'get',
          key,
          value: null,
        } satisfies ExtensionHostSettingsRequestPayload);

        return response as TValue | null;
      },
      set: async (key, value): Promise<void> => {
        await this.bridge.request('settings', {
          action: 'set',
          key,
          value,
        } satisfies ExtensionHostSettingsRequestPayload);
      },
    };
  }

  private createWebviewApi(): ExtensionWebviewApi {
    return {
      createPanel: async (panelId: string, title: string): Promise<ExtensionWebviewPanel> => {
        const response = await this.bridge.request('webview', {
          action: 'create-panel',
          panelId,
          title,
        } satisfies ExtensionHostWebviewRequestPayload);

        const createdPanel = parseWebviewPanelCreatedResponse(response);
        const handlers = new Set<ExtensionWebviewMessageHandler>();
        const panel: ExtensionWebviewPanel = {
          id: createdPanel.panelInstanceKey,
          panelId: createdPanel.panelId,
          title: createdPanel.title,
          postMessage: async (message: JsonValue): Promise<void> => {
            await this.bridge.request('webview', {
              action: 'post-message',
              panelInstanceKey: createdPanel.panelInstanceKey,
              message,
            } satisfies ExtensionHostWebviewRequestPayload);
          },
          onMessage: (handler: ExtensionWebviewMessageHandler) => {
            handlers.add(handler);
            return {
              dispose: (): void => {
                handlers.delete(handler);
              },
            };
          },
          reveal: async (): Promise<void> => {
            await this.bridge.request('webview', {
              action: 'reveal-panel',
              panelInstanceKey: createdPanel.panelInstanceKey,
            } satisfies ExtensionHostWebviewRequestPayload);
          },
          dispose: async (): Promise<void> => {
            this.webviewPanels.delete(createdPanel.panelInstanceKey);
            await this.bridge.request('webview', {
              action: 'dispose-panel',
              panelInstanceKey: createdPanel.panelInstanceKey,
            } satisfies ExtensionHostWebviewRequestPayload);
          },
        };

        this.webviewPanels.set(createdPanel.panelInstanceKey, {
          panelId: createdPanel.panelId,
          title: createdPanel.title,
          handlers,
          panel,
        });

        return panel;
      },
    };
  }

  private async handleWebviewMessageEvent(payload: JsonValue | null): Promise<void> {
    const eventPayload = parseWebviewMessageEventPayload(payload);
    if (!eventPayload) {
      throw new Error('webview.message event payload is invalid.');
    }

    const panel = this.webviewPanels.get(eventPayload.panelInstanceKey);
    if (!panel) {
      return;
    }

    for (const handler of panel.handlers) {
      await handler(eventPayload.message);
    }
  }

  private handleWebviewLifecycleEvent(payload: JsonValue | null): void {
    const eventPayload = parseWebviewLifecycleEventPayload(payload);
    if (!eventPayload) {
      throw new Error('webview.lifecycle event payload is invalid.');
    }

    if (eventPayload.state === 'disposed') {
      this.webviewPanels.delete(eventPayload.panelInstanceKey);
    }
  }

  private createNotesApi(): ExtensionNotesApi {
    return {
      list: async (): Promise<readonly ExtensionNoteDocument[]> => {
        const response = await this.bridge.request('notes.read', {
          action: 'list',
          noteId: null,
        } satisfies ExtensionHostNoteReadRequestPayload);

        if (!Array.isArray(response)) {
          throw new Error('notes.list response is invalid.');
        }

        return response.map((entry) => {
          const parsedDocument = parseNoteDocument(entry);
          if (!parsedDocument) {
            throw new Error('notes.list entry is invalid.');
          }
          return parsedDocument;
        });
      },
      read: async (noteId: string): Promise<ExtensionNoteDocument> => {
        const response = await this.bridge.request('notes.read', {
          action: 'read',
          noteId,
        } satisfies ExtensionHostNoteReadRequestPayload);

        const parsedDocument = parseNoteDocument(response);
        if (!parsedDocument) {
          throw new Error('notes.read response is invalid.');
        }

        return parsedDocument;
      },
      create: async (title: string, content: string): Promise<ExtensionNoteDocument> => {
        const response = await this.bridge.request('notes.write', {
          action: 'create',
          noteId: null,
          title,
          content,
        } satisfies ExtensionHostNoteWriteRequestPayload);

        const parsedDocument = parseNoteDocument(response);
        if (!parsedDocument) {
          throw new Error('notes.create response is invalid.');
        }

        return parsedDocument;
      },
      update: async (noteId: string, content: string): Promise<void> => {
        await this.bridge.request('notes.write', {
          action: 'update',
          noteId,
          title: null,
          content,
        } satisfies ExtensionHostNoteWriteRequestPayload);
      },
    };
  }

  private createEditorApi(): ExtensionEditorApi {
    return {
      getActiveDocumentText: async (): Promise<string | null> => {
        const response = await this.bridge.request('editor.read', {
          action: 'get-active-document-text',
        } satisfies ExtensionHostEditorReadRequestPayload);

        return parseEditorReadResponse(response).content;
      },
      getSelection: async () => {
        const response = await this.bridge.request('editor.read', {
          action: 'get-selection',
        } satisfies ExtensionHostEditorReadRequestPayload);

        const selection = parseEditorReadResponse(response).selection;
        if (!selection) {
          return null;
        }

        return {
          documentUri: selection.documentUri,
          text: selection.text,
          range: {
            startLine: selection.range.startLine,
            startColumn: selection.range.startColumn,
            endLine: selection.range.endLine,
            endColumn: selection.range.endColumn,
          },
        };
      },
      applyTextEdits: async (documentUri, edits): Promise<void> => {
        await this.bridge.request('editor.write', {
          action: 'apply-text-edits',
          documentUri,
          edits: edits.map((edit) => ({
            range: {
              startLine: edit.range.startLine,
              startColumn: edit.range.startColumn,
              endLine: edit.range.endLine,
              endColumn: edit.range.endColumn,
            },
            text: edit.text,
          })),
        } satisfies ExtensionHostEditorWriteRequestPayload);
      },
    };
  }

  private createAIApi(): ExtensionAIAPI {
    return {
      invoke: async (request) => {
        const response = await this.bridge.request('ai.invoke', {
          model: request.model,
          messages: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          tools: request.tools
            ? request.tools.map((tool) => ({
                id: tool.id,
                description: tool.description,
                inputSchema: tool.inputSchema,
              }))
            : null,
        } satisfies ExtensionHostAIInvocationRequestPayload);

        return parseAIInvocationResponse(response);
      },
      registerTool: (definition, handler) => {
        this.tools.set(definition.id, handler);

        void this.bridge.notifyEvent('ai.registerTool', {
          toolId: definition.id,
          title: definition.title,
          description: definition.description,
        } satisfies ExtensionHostRegisteredToolEventPayload);

        return {
          dispose: (): void => {
            this.tools.delete(definition.id);
          },
        };
      },
    };
  }
}
