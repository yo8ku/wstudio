/**
 * 插件公共上下文与 API 命名空间定义。
 */
import type { ExtensionPermission, JsonObject, JsonValue } from '@note-studio/shared';
import type { ResolvedExtensionManifest } from './manifest';
export interface Disposable {
    dispose(): void | Promise<void>;
}
export type CommandHandler = (...args: readonly JsonValue[]) => JsonValue | void | Promise<JsonValue | void>;
export interface ExtensionCommandsApi {
    register(commandId: string, handler: CommandHandler): Disposable;
    execute(commandId: string, ...args: readonly JsonValue[]): Promise<JsonValue | void>;
}
export interface ExtensionWindowApi {
    showInfo(message: string): Promise<void>;
    showWarning(message: string): Promise<void>;
    showError(message: string): Promise<void>;
}
export interface WorkspaceFileEntry {
    readonly path: string;
    readonly isDirectory: boolean;
}
export interface WorkspaceSearchResult {
    readonly path: string;
    readonly line: number;
    readonly preview: string;
}
export interface ExtensionWorkspaceApi {
    listFiles(): Promise<readonly WorkspaceFileEntry[]>;
    readTextFile(path: string): Promise<string>;
    writeTextFile(path: string, content: string): Promise<void>;
    searchText(query: string): Promise<readonly WorkspaceSearchResult[]>;
}
export interface ExtensionStorageApi {
    get<TValue extends JsonValue>(key: string): Promise<TValue | null>;
    set(key: string, value: JsonValue): Promise<void>;
    delete(key: string): Promise<void>;
}
export interface ExtensionSettingsApi {
    get<TValue extends JsonValue>(key: string): Promise<TValue | null>;
    set(key: string, value: JsonValue): Promise<void>;
}
export interface ExtensionWebviewPanel {
    readonly id: string;
    postMessage(message: JsonValue): Promise<void>;
    reveal(): Promise<void>;
}
export interface ExtensionWebviewApi {
    createPanel(panelId: string, title: string): Promise<ExtensionWebviewPanel>;
}
export interface ExtensionNoteDocument {
    readonly id: string;
    readonly title: string;
    readonly content: string;
    readonly path: string;
    readonly updatedAt: string;
}
export interface ExtensionNotesApi {
    list(): Promise<readonly ExtensionNoteDocument[]>;
    read(noteId: string): Promise<ExtensionNoteDocument>;
    create(title: string, content: string): Promise<ExtensionNoteDocument>;
    update(noteId: string, content: string): Promise<void>;
}
export interface ExtensionTextRange {
    readonly startLine: number;
    readonly startColumn: number;
    readonly endLine: number;
    readonly endColumn: number;
}
export interface ExtensionTextEdit {
    readonly range: ExtensionTextRange;
    readonly text: string;
}
export interface ExtensionEditorSelection {
    readonly documentUri: string;
    readonly text: string;
    readonly range: ExtensionTextRange;
}
export interface ExtensionEditorApi {
    getActiveDocumentText(): Promise<string | null>;
    getSelection(): Promise<ExtensionEditorSelection | null>;
    applyTextEdits(documentUri: string, edits: readonly ExtensionTextEdit[]): Promise<void>;
}
export interface ExtensionAIMessage {
    readonly role: 'system' | 'user' | 'assistant' | 'tool';
    readonly content: string;
}
export interface ExtensionAIToolDefinition {
    readonly id: string;
    readonly description: string;
    readonly inputSchema: JsonObject;
}
export interface ExtensionAIToolCall {
    readonly id: string;
    readonly toolId: string;
    readonly input: JsonObject;
}
export interface ExtensionAIInvocationRequest {
    readonly model: string;
    readonly messages: readonly ExtensionAIMessage[];
    readonly tools?: readonly ExtensionAIToolDefinition[];
}
export interface ExtensionAIInvocationResponse {
    readonly content: string;
    readonly stopReason: 'completed' | 'max_tokens' | 'tool_call';
    readonly toolCalls?: readonly ExtensionAIToolCall[];
}
export interface ExtensionAIToolRegistration {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly inputSchema: JsonObject;
    readonly permissions?: readonly ExtensionPermission[];
}
export type ExtensionAIToolHandler = (input: JsonObject) => JsonValue | void | Promise<JsonValue | void>;
export interface ExtensionAIAPI {
    invoke(request: ExtensionAIInvocationRequest): Promise<ExtensionAIInvocationResponse>;
    registerTool(definition: ExtensionAIToolRegistration, handler: ExtensionAIToolHandler): Disposable;
}
export interface ExtensionEnvironment {
    readonly mode: 'development' | 'production';
    readonly hostVersion: string;
    readonly extensionDirectory: string;
    readonly storageDirectory: string;
}
export interface ExtensionContext {
    readonly manifest: ResolvedExtensionManifest;
    readonly environment: ExtensionEnvironment;
    readonly commands: ExtensionCommandsApi;
    readonly window: ExtensionWindowApi;
    readonly workspace: ExtensionWorkspaceApi;
    readonly storage: ExtensionStorageApi;
    readonly settings: ExtensionSettingsApi;
    readonly webview: ExtensionWebviewApi;
    readonly notes: ExtensionNotesApi;
    readonly editor: ExtensionEditorApi;
    readonly ai: ExtensionAIAPI;
    readonly subscriptions: Disposable[];
}
//# sourceMappingURL=context.d.ts.map