import React from 'react';
import type {
  PluginSurfaceRuntimeStatusSnapshot,
  PluginSurfaceStateSnapshot,
} from '@note-studio/shared';
import type { PluginRuntimeOverlayFrameRendererPayload } from '../../stores/pluginOverlayFrameStore';
import { PluginRuntimeStatusNotice } from '../common/PluginRuntimeStatusNotice/PluginRuntimeStatusNotice';
import {
  capturePluginRuntimeThemeSnapshot,
} from '../Layout/EditorArea/PluginRuntimeView/pluginRuntimeThemeVariables';

const PLUGIN_SURFACE_ATTACH_CHANNEL = 'plugin-surface:attach';
const PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL = 'plugin-surface:update-bounds';
const PLUGIN_SURFACE_DESTROY_CHANNEL = 'plugin-surface:destroy';
const PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL = 'plugin-surface:update-context';
const PLUGIN_SURFACE_STATE_CHANGED_CHANNEL = 'plugin-surface:state-changed';
const PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL = 'plugin-surface:runtime-status-changed';

interface PluginSurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function resolvePluginOverlaySurfaceInstanceId(overlayId: string): string {
  return `overlay:${overlayId.trim()}`;
}

function measurePluginSurfaceBounds(surfaceNode: HTMLElement): PluginSurfaceBounds {
  const frameBounds = surfaceNode.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(0, Math.min(viewportWidth, frameBounds.left));
  const top = Math.max(0, Math.min(viewportHeight, frameBounds.top));
  const right = Math.max(left, Math.min(viewportWidth, frameBounds.right));
  const bottom = Math.max(top, Math.min(viewportHeight, frameBounds.bottom));

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.max(0, Math.round(right - left)),
    height: Math.max(0, Math.round(bottom - top)),
  };
}

interface PluginRuntimeOverlayEntrypointFrameProps {
  readonly overlay: PluginRuntimeOverlayFrameRendererPayload;
}

export const PluginRuntimeOverlayEntrypointFrame: React.FC<PluginRuntimeOverlayEntrypointFrameProps> = ({
  overlay,
}) => {
  const runtimeSurface = overlay.runtimeSurface?.entryUrl.trim().length
    ? overlay.runtimeSurface
    : null;
  const runtimeSurfaceRef = React.useRef(runtimeSurface);
  const retriedSurfaceIdentityRef = React.useRef<string | null>(null);
  const [surfaceNode, setSurfaceNode] = React.useState<HTMLDivElement | null>(null);
  const [entrypointStatus, setEntrypointStatus] = React.useState<'idle' | 'module-loaded' | 'rendered' | 'module-error'>('idle');
  const [entrypointError, setEntrypointError] = React.useState<string | null>(null);
  const [guestSurfaceState, setGuestSurfaceState] = React.useState<PluginSurfaceStateSnapshot | null>(null);
  const [guestSurfaceRetryRevision, setGuestSurfaceRetryRevision] = React.useState(0);
  const surfaceInstanceId = React.useMemo(
    () => resolvePluginOverlaySurfaceInstanceId(overlay.overlayId),
    [overlay.overlayId],
  );
  const surfaceIdentity = React.useMemo(() => {
    if (runtimeSurface === null) {
      return null;
    }

    return [
      runtimeSurface.pluginId,
      runtimeSurface.surfaceKind,
      runtimeSurface.surfaceId,
      runtimeSurface.entryUrl,
    ].join('|');
  }, [runtimeSurface]);

  React.useEffect(() => {
    setEntrypointStatus('idle');
    setEntrypointError(null);
    setGuestSurfaceState(null);
    setGuestSurfaceRetryRevision(0);
    retriedSurfaceIdentityRef.current = null;
  }, [overlay.overlayId, runtimeSurface?.entryUrl]);

  React.useEffect(() => {
    runtimeSurfaceRef.current = runtimeSurface;
  }, [runtimeSurface]);

  React.useEffect(() => {
    retriedSurfaceIdentityRef.current = null;
    setGuestSurfaceRetryRevision(0);
  }, [surfaceIdentity]);

  React.useEffect(() => {
    if (
      runtimeSurface === null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const unsubscribe = window.electron.ipcRenderer.on(
      PLUGIN_SURFACE_STATE_CHANGED_CHANNEL,
      (_event: object, snapshot: PluginSurfaceStateSnapshot) => {
        if (snapshot.surfaceInstanceId !== surfaceInstanceId) {
          return;
        }

        setGuestSurfaceState(snapshot);
      },
    );

    return unsubscribe ?? (() => undefined);
  }, [runtimeSurface, surfaceInstanceId]);

  React.useEffect(() => {
    if (
      runtimeSurface === null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const unsubscribe = window.electron.ipcRenderer.on(
      PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL,
      (_event: object, snapshot: PluginSurfaceRuntimeStatusSnapshot) => {
        if (snapshot.surfaceInstanceId !== surfaceInstanceId) {
          return;
        }

        setEntrypointStatus(snapshot.status);
        setEntrypointError(snapshot.error);
      },
    );

    return unsubscribe ?? (() => undefined);
  }, [runtimeSurface, surfaceInstanceId]);

  React.useEffect(() => {
    if (guestSurfaceState === null) {
      return;
    }

    console.error('[plugin-overlay-runtime] guest surface invalidated', {
      overlayId: overlay.overlayId,
      runtimeSurface: runtimeSurfaceRef.current,
      guestSurfaceState,
    });

    if (surfaceIdentity === null || retriedSurfaceIdentityRef.current === surfaceIdentity) {
      return;
    }

    retriedSurfaceIdentityRef.current = surfaceIdentity;
    setEntrypointStatus('idle');
    setEntrypointError(null);
    setGuestSurfaceState(null);
    setGuestSurfaceRetryRevision((currentRevision) => currentRevision + 1);
  }, [guestSurfaceState, overlay.overlayId, surfaceIdentity]);

  React.useEffect(() => {
    if (
      runtimeSurface === null
      || surfaceNode === null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const activeRuntimeSurface = runtimeSurfaceRef.current;

    if (activeRuntimeSurface === null) {
      return undefined;
    }

    void window.electron.ipcRenderer.invoke(PLUGIN_SURFACE_ATTACH_CHANNEL, {
      surfaceInstanceId,
      surface: activeRuntimeSurface,
      bounds: measurePluginSurfaceBounds(surfaceNode),
      visible: false,
      leafId: null,
      overlayId: overlay.overlayId,
      focusOnAttach: overlay.interactionMode !== 'editorSuggest',
      theme: capturePluginRuntimeThemeSnapshot(),
    }).catch((error: Error) => {
      setEntrypointStatus('module-error');
      setEntrypointError(error.message);
      console.error('[plugin-overlay-runtime] failed to attach guest surface', {
        overlayId: overlay.overlayId,
        runtimeSurface: activeRuntimeSurface,
        error,
      });
    });

    return () => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_DESTROY_CHANNEL, {
        surfaceInstanceId,
      }).catch((error: Error) => {
        console.error('[plugin-overlay-runtime] failed to destroy guest surface', {
          overlayId: overlay.overlayId,
          runtimeSurface: activeRuntimeSurface,
          error,
        });
      });
    };
  }, [
    guestSurfaceRetryRevision,
    overlay.interactionMode,
    overlay.overlayId,
    runtimeSurface,
    surfaceIdentity,
    surfaceInstanceId,
    surfaceNode,
  ]);

  React.useEffect(() => {
    if (
      runtimeSurface === null
      || surfaceNode === null
      || guestSurfaceState !== null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    let animationFrameId = 0;
    let resizeSettledTimerId: number | null = null;

    const syncBounds = (): void => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL, {
        surfaceInstanceId,
        bounds: measurePluginSurfaceBounds(surfaceNode),
      }).catch((error: Error) => {
        console.error('[plugin-overlay-runtime] failed to update guest surface bounds', {
          overlayId: overlay.overlayId,
          runtimeSurface: runtimeSurfaceRef.current,
          error,
        });
      });
    };

    const isHostWindowResizing = (): boolean => document.body.classList.contains('window-resizing');

    const scheduleSettledBoundsSync = (): void => {
      if (resizeSettledTimerId !== null) {
        window.clearTimeout(resizeSettledTimerId);
      }

      resizeSettledTimerId = window.setTimeout(() => {
        resizeSettledTimerId = null;
        scheduleBoundsSync();
      }, 220);
    };

    const scheduleBoundsSync = (): void => {
      if (isHostWindowResizing()) {
        scheduleSettledBoundsSync();
        return;
      }

      if (animationFrameId !== 0) {
        return;
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = 0;
        syncBounds();
      });
    };

    scheduleBoundsSync();

    const resizeObserver = new ResizeObserver(() => {
      scheduleBoundsSync();
    });
    resizeObserver.observe(surfaceNode);
    window.addEventListener('resize', scheduleBoundsSync);
    window.addEventListener('scroll', scheduleBoundsSync, true);

    return () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
      if (resizeSettledTimerId !== null) {
        window.clearTimeout(resizeSettledTimerId);
      }

      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleBoundsSync);
      window.removeEventListener('scroll', scheduleBoundsSync, true);
    };
  }, [
    guestSurfaceState,
    overlay.anchorRect?.bottom,
    overlay.anchorRect?.height,
    overlay.anchorRect?.left,
    overlay.anchorRect?.right,
    overlay.anchorRect?.top,
    overlay.anchorRect?.width,
    overlay.chrome,
    overlay.height,
    overlay.overlayId,
    overlay.width,
    runtimeSurface,
    surfaceIdentity,
    surfaceInstanceId,
    surfaceNode,
  ]);

  React.useEffect(() => {
    if (
      runtimeSurface === null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const pushRuntimeContext = (): void => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL, {
        surfaceInstanceId,
        state: runtimeSurfaceRef.current?.state ?? null,
        theme: capturePluginRuntimeThemeSnapshot(),
      }).catch((error: Error) => {
        console.error('[plugin-overlay-runtime] failed to update guest surface runtime context', {
          overlayId: overlay.overlayId,
          runtimeSurface: runtimeSurfaceRef.current,
          error,
        });
      });
    };

    pushRuntimeContext();

    const observer = new MutationObserver(() => {
      pushRuntimeContext();
    });
    const observerOptions: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    };

    observer.observe(document.documentElement, observerOptions);

    if (document.body !== null) {
      observer.observe(document.body, observerOptions);
    }

    return () => {
      observer.disconnect();
    };
  }, [overlay.overlayId, runtimeSurface, runtimeSurface?.state, surfaceIdentity, surfaceInstanceId]);

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
      <div
        ref={setSurfaceNode}
        className={`plugin-overlay-frame-host__frame ${entrypointStatus === 'module-error' ? 'plugin-overlay-frame-host__frame--entrypoint-preload' : 'plugin-overlay-frame-host__frame--entrypoint-active'}`}
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
