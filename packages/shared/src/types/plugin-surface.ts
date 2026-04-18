export type PluginSurfaceInvalidationReason =
  | 'did-fail-load'
  | 'render-process-gone'
  | 'unresponsive'
  | 'timeout';

export interface PluginSurfaceStateSnapshot {
  readonly surfaceInstanceId: string;
  readonly status: 'invalid';
  readonly reason: PluginSurfaceInvalidationReason;
  readonly detail: string | null;
}

export interface PluginSurfaceRuntimeStatusSnapshot {
  readonly surfaceInstanceId: string;
  readonly status: 'module-loaded' | 'rendered' | 'module-error';
  readonly error: string | null;
}
