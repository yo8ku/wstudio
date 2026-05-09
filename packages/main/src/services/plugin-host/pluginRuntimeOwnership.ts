/**
 * All discovered third-party plugins execute inside the shared supervisor
 * utility process. Builtin resources that still ship with the app are handled
 * outside the third-party plugin runtime ownership path.
 */

import type { PluginSupervisorPluginRuntimeOwner } from './pluginSupervisorProtocol';

export function resolvePluginRuntimeOwner(
  _descriptor: {
    readonly rootDirectory: string;
  },
): PluginSupervisorPluginRuntimeOwner {
  return 'supervisor';
}
