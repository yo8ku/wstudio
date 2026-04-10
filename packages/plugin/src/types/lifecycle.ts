/**
 * Plugin lifecycle states, operations, and failure contracts.
 */

import type { PluginManifest } from './manifest';

export const PLUGIN_LIFECYCLE_STATES = [
  'created',
  'loading',
  'loaded',
  'enabling',
  'enabled',
  'disabling',
  'disabled',
  'unloading',
  'unloaded',
  'failed',
] as const;

export type PluginLifecycleState = (typeof PLUGIN_LIFECYCLE_STATES)[number];

export const PLUGIN_LIFECYCLE_OPERATIONS = [
  'load',
  'enable',
  'disable',
  'unload',
  'fail',
] as const;

export type PluginLifecycleOperation = (typeof PLUGIN_LIFECYCLE_OPERATIONS)[number];

export interface PluginFailureContext {
  readonly pluginId: string;
  readonly pluginName: string;
  readonly operation: PluginLifecycleOperation;
  readonly state: PluginLifecycleState;
  readonly error: Error;
}

export interface PluginLifecycleSnapshot {
  readonly manifest: PluginManifest;
  readonly state: PluginLifecycleState;
  readonly lastFailure: PluginFailureContext | null;
}

export class PluginLifecycleError extends Error {
  public readonly pluginId: string;
  public readonly operation: PluginLifecycleOperation;
  public readonly state: PluginLifecycleState;
  public readonly allowedStates: readonly PluginLifecycleState[];

  constructor(
    pluginId: string,
    operation: PluginLifecycleOperation,
    state: PluginLifecycleState,
    allowedStates: readonly PluginLifecycleState[],
  ) {
    super(
      `Plugin "${pluginId}" cannot execute "${operation}" while in "${state}" state. Allowed states: ${allowedStates.join(', ')}.`,
    );
    this.name = 'PluginLifecycleError';
    this.pluginId = pluginId;
    this.operation = operation;
    this.state = state;
    this.allowedStates = allowedStates;
  }
}
