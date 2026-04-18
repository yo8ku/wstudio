/**
 * Host-owned iframe wrapper for plugin-isolated surfaces.
 * Centralizes sandbox permissions so plugin iframe hardening has a single entry point.
 */

import React from 'react';

export const PLUGIN_SANDBOX_PERMISSIONS = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
] as const;

export type PluginSandboxPermission = (typeof PLUGIN_SANDBOX_PERMISSIONS)[number];

export const PLUGIN_SANDBOX_PERMISSION_PRESETS = {
  runtimeSurface: ['allow-scripts'],
  runtimeWebviewPanel: ['allow-scripts'],
  workbenchView: ['allow-scripts', 'allow-forms'],
  legacyWebview: ['allow-scripts'],
} as const satisfies Record<string, readonly PluginSandboxPermission[]>;

export interface PluginSandboxFrameProps extends Omit<
  React.IframeHTMLAttributes<HTMLIFrameElement>,
  'sandbox'
> {
  readonly sandboxPermissions?: readonly PluginSandboxPermission[];
}

function resolveSandboxValue(
  sandboxPermissions: readonly PluginSandboxPermission[] | undefined,
): string {
  const resolvedPermissions = sandboxPermissions ?? PLUGIN_SANDBOX_PERMISSION_PRESETS.runtimeSurface;
  return Array.from(new Set(resolvedPermissions)).join(' ');
}

export const PluginSandboxFrame = React.forwardRef<HTMLIFrameElement, PluginSandboxFrameProps>(
  ({ sandboxPermissions, ...iframeProps }, forwardedRef) => {
    return (
      <iframe
        {...iframeProps}
        ref={forwardedRef}
        sandbox={resolveSandboxValue(sandboxPermissions)}
      />
    );
  },
);

PluginSandboxFrame.displayName = 'PluginSandboxFrame';
