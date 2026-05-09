/**
 * Renders a plugin overlay surface inside a renderer-owned sandboxed iframe.
 */

import React from 'react';
import { PluginRuntimeStatusNotice } from '../common/PluginRuntimeStatusNotice/PluginRuntimeStatusNotice';
import type { PluginRuntimeOverlayFrameRendererPayload } from '../../stores/pluginOverlayFrameStore';
import {
  PluginSandboxFrame,
  PLUGIN_SANDBOX_PERMISSION_PRESETS,
} from '../common/PluginSandboxFrame';
import { usePluginRuntimeIframeSurface } from '../common/PluginRuntimeIframeSurface';

interface PluginRuntimeOverlayEntrypointFrameProps {
  readonly overlay: PluginRuntimeOverlayFrameRendererPayload;
}

function resolvePluginOverlaySurfaceInstanceId(overlayId: string): string {
  return `overlay:${overlayId.trim()}`;
}

export const PluginRuntimeOverlayEntrypointFrame: React.FC<PluginRuntimeOverlayEntrypointFrameProps> = ({
  overlay,
}) => {
  const runtimeSurface = overlay.runtimeSurface?.entryUrl.trim().length
    ? overlay.runtimeSurface
    : null;
  const surfaceInstanceId = React.useMemo(
    () => resolvePluginOverlaySurfaceInstanceId(overlay.overlayId),
    [overlay.overlayId],
  );
  const { iframeRef, srcDoc, entrypointStatus, entrypointError } = usePluginRuntimeIframeSurface({
    surfaceInstanceId,
    runtimeSurface,
    overlayId: overlay.overlayId,
  });

  if (runtimeSurface === null) {
    return (
      <div className="plugin-overlay-frame-host__runtime-state">
        <PluginRuntimeStatusNotice
          title={overlay.title}
          message="当前插件弹层未声明 UI runtime 入口。旧 DOM 弹层已停用。"
          detail={`请为弹层 "${overlay.overlayId}" 声明 manifest.ui.modals 入口。`}
          tone="error"
        />
      </div>
    );
  }

  const shouldShowBootstrapPending = entrypointStatus === 'idle';
  const shouldShowBootstrapError = entrypointStatus === 'module-error';

  return (
    <div className="plugin-overlay-frame-host__runtime-stack">
      <PluginSandboxFrame
        ref={iframeRef}
        className={`plugin-overlay-frame-host__frame ${entrypointStatus === 'module-error' ? 'plugin-overlay-frame-host__frame--entrypoint-preload' : 'plugin-overlay-frame-host__frame--entrypoint-active'}`}
        title={overlay.title}
        srcDoc={srcDoc}
        sandboxPermissions={PLUGIN_SANDBOX_PERMISSION_PRESETS.runtimeSurface}
        data-plugin-runtime-surface-kind={runtimeSurface.surfaceKind}
        data-plugin-runtime-surface-id={runtimeSurface.surfaceId}
      />
      {shouldShowBootstrapPending && (
        <div className="plugin-overlay-frame-host__runtime-state">
          <PluginRuntimeStatusNotice
            title={overlay.title}
            message="插件弹层正在加载。"
            detail={overlay.overlayId}
            tone="pending"
          />
        </div>
      )}
      {shouldShowBootstrapError && (
        <div className="plugin-overlay-frame-host__runtime-state">
          <PluginRuntimeStatusNotice
            title={overlay.title}
            message="插件弹层加载失败。旧 DOM 回退已停用。"
            detail={entrypointError ?? overlay.overlayId}
            tone="error"
          />
        </div>
      )}
    </div>
  );
};
