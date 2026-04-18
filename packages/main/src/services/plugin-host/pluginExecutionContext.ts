import { AsyncLocalStorage } from 'node:async_hooks';

interface PluginExecutionContextState {
  readonly pluginId: string;
}

const pluginExecutionContextStorage = new AsyncLocalStorage<PluginExecutionContextState>();

export function runWithPluginExecutionContext<TValue>(
  pluginId: string,
  callback: () => TValue,
): TValue {
  return pluginExecutionContextStorage.run({
    pluginId,
  }, callback);
}

export function getCurrentPluginExecutionContextPluginId(): string | null {
  return pluginExecutionContextStorage.getStore()?.pluginId ?? null;
}
