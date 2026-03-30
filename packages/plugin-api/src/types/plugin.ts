/**
 * Plugin manifest, lifecycle and runtime context contracts.
 */

import type { PluginApp } from '../app/PluginApp'
import type { PluginJsonObject, PluginJsonValue } from './json'

export type PluginActivationEvent =
  | 'onStartup'
  | 'onWorkspaceReady'
  | `onCommand:${string}`
  | `onView:${string}`
  | `onLanguage:${string}`
  | `workspaceContains:${string}`

export type PluginUILayoutLocation =
  | 'activitybar-left'
  | 'titlebar'
  | 'statusbar'
  | 'editor-tab-right'
  | 'sidebar-toolbar'
  | 'bottom-panel-toolbar'

export type PluginUIViewSurface = 'sidebar' | 'bottom-panel' | 'editor-tab'

export type PluginSettingValueType = 'string' | 'number' | 'boolean' | 'select'

export type PluginRuntimeMode = 'development' | 'production' | 'test'

export interface PluginManifest {
  id: string
  name: string
  version: string
  apiVersion: string
  main: string
  displayName?: string
  description?: string
  publisher?: string
  activationEvents?: readonly PluginActivationEvent[]
  contributes?: PluginContributes
  keywords?: readonly string[]
  enabledByDefault?: boolean
}

export interface PluginContributes {
  commands?: readonly PluginCommandContribution[]
  ui?: PluginUIContributes
  settings?: readonly PluginSettingContribution[]
}

export interface PluginCommandContribution {
  id: string
  title: string
  category?: string
  description?: string
}

export interface PluginUIContributes {
  layout?: readonly PluginUILayoutContribution[]
  views?: readonly PluginUIViewContribution[]
}

export interface PluginUILayoutBase {
  id: string
  title: string
  location: PluginUILayoutLocation
  icon?: string
  tooltip?: string
  when?: string
  order?: number
}

export interface PluginCommandLayoutContribution extends PluginUILayoutBase {
  command: string
  view?: never
}

export interface PluginViewLayoutContribution extends PluginUILayoutBase {
  view: string
  command?: never
}

export type PluginUILayoutContribution =
  | PluginCommandLayoutContribution
  | PluginViewLayoutContribution

export interface PluginUIViewContribution {
  id: string
  title: string
  surface: PluginUIViewSurface
  icon?: string
}

export interface PluginSettingContribution {
  key: string
  title: string
  type: PluginSettingValueType
  description?: string
  defaultValue?: PluginJsonValue
  options?: readonly PluginSettingOption[]
}

export interface PluginSettingOption {
  label: string
  value: string
}

export interface PluginDisposable {
  dispose(): void | Promise<void>
}

export type PluginCleanupHandler = () => void | Promise<void>

export interface PluginCleanupRegistry extends PluginDisposable {
  add<T extends PluginDisposable>(disposable: T): T
  addCallback(handler: PluginCleanupHandler): PluginDisposable
  clear(): void
  readonly size: number
}

export interface PluginStorageApi {
  get(key: string): Promise<PluginJsonValue | null>
  set(key: string, value: PluginJsonValue): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<readonly string[]>
}

export interface PluginLogger {
  trace(message: string, data?: PluginJsonObject): void
  debug(message: string, data?: PluginJsonObject): void
  info(message: string, data?: PluginJsonObject): void
  warn(message: string, data?: PluginJsonObject): void
  error(message: string, data?: PluginJsonObject): void
}

export interface PluginEnvironment {
  appName: string
  appVersion: string
  apiVersion: string
  mode: PluginRuntimeMode
}

export interface PluginContext {
  manifest: PluginManifest
  pluginPath: string
  environment: PluginEnvironment
  storage: PluginStorageApi
  logger: PluginLogger
  cleanup: PluginCleanupRegistry
  asAbsolutePath(relativePath: string): string
}

export type PluginLoadHandler = (
  context: PluginContext,
  app: PluginApp,
) => void | Promise<void>

export type PluginUnloadHandler = (
  context: PluginContext
) => void | Promise<void>

export interface PluginModule {
  manifest: PluginManifest
  onload: PluginLoadHandler
  onunload: PluginUnloadHandler
  onEnable?: PluginLoadHandler
  onDisable?: PluginUnloadHandler
}
