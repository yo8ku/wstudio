/**
 * App capability contracts exposed to plugins.
 * Groups host functionality under a single root object.
 */

import type { PluginJsonValue } from './json'
import type { PluginDisposable } from './plugin'

export type PluginCommandResult = PluginJsonValue | undefined

export type PluginCommandHandler = (
  ...args: PluginJsonValue[]
) => PluginCommandResult | Promise<PluginCommandResult>

export type PluginAIChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type PluginThemeMode = 'light' | 'dark'

export interface PluginAIChatMessage {
  role: PluginAIChatRole
  content: string
}

export interface PluginAIStreamCallbacks {
  onChunk(chunk: string): void
  onComplete?(): void
  onError?(error: Error): void
}

export interface PluginCommandsApi {
  registerCommand(commandId: string, handler: PluginCommandHandler): PluginDisposable
  executeCommand(commandId: string, ...args: PluginJsonValue[]): Promise<PluginCommandResult>
}

export interface PluginConfigurationApi {
  get(key: string): Promise<PluginJsonValue | null>
  update(key: string, value: PluginJsonValue): Promise<void>
}

export interface PluginWindowApi {
  showInformationMessage(message: string): Promise<void>
  showWarningMessage(message: string): Promise<void>
  showErrorMessage(message: string): Promise<void>
}

export interface PluginVaultApi {
  getRoots(): Promise<readonly string[]>
  getPrimaryRoot(): Promise<string>
  resolvePath(relativePath: string): Promise<string>
  exists(relativePath: string): Promise<boolean>
  read(relativePath: string): Promise<string>
  write(relativePath: string, content: string): Promise<void>
}

export interface PluginEditorApi {
  getActiveFilePath(): Promise<string | null>
  openFile(filePath: string): Promise<void>
}

export interface PluginAIApi {
  getAvailableModels(): Promise<readonly string[]>
  streamChat(
    modelId: string,
    messages: readonly PluginAIChatMessage[],
    callbacks: PluginAIStreamCallbacks,
  ): Promise<void>
}

export interface PluginAppModules {
  vault: PluginVaultApi
  editor: PluginEditorApi
  ai: PluginAIApi
  commands: PluginCommandsApi
  configuration: PluginConfigurationApi
  window: PluginWindowApi
  getThemeMode(): Promise<PluginThemeMode>
  loadLocalStorage(key: string): Promise<PluginJsonValue | null>
  saveLocalStorage(key: string, value: PluginJsonValue): Promise<void>
}
