/**
 * Module contracts for plugin package entrypoints and host-side instantiation.
 */

import type { App } from './app';
import type { PluginManifest } from './manifest';
import type { Plugin } from '../core/Plugin';

export interface PluginConstructor<TPlugin extends Plugin = Plugin> {
  new (app: App, manifest: PluginManifest): TPlugin;
}

export interface PluginModule<TPlugin extends Plugin = Plugin> {
  readonly default: PluginConstructor<TPlugin>;
}
