import React from 'react';
import type {
  PluginSurfaceRuntimeStatusSnapshot,
  PluginSurfaceStateSnapshot,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import { PluginRuntimeStatusNotice } from '../../common/PluginRuntimeStatusNotice/PluginRuntimeStatusNotice';
import {
  capturePluginRuntimeThemeSnapshot,
} from '../../Layout/EditorArea/PluginRuntimeView/pluginRuntimeThemeVariables';

const PLUGIN_SURFACE_ATTACH_CHANNEL = 'plugin-surface:attach';
const PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL = 'plugin-surface:update-bounds';
const PLUGIN_SURFACE_DESTROY_CHANNEL = 'plugin-surface:destroy';
const PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL = 'plugin-surface:update-context';
const PLUGIN_SURFACE_STATE_CHANGED_CHANNEL = 'plugin-surface:state-changed';
const PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL = 'plugin-surface:runtime-status-changed';

export interface PluginSettingTabRuntimeSummary {
  readonly id: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly title: string;
  readonly preview: string | null;
  readonly previewLines: readonly string[];
  readonly runtimeSurface: PluginUiRuntimeSurfaceDescriptor | null;
}

interface PluginSettingTabRuntimeCardProps {
  readonly tab: PluginSettingTabRuntimeSummary;
}

interface PluginSurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function resolvePluginSettingSurfaceInstanceId(tabId: string): string {
  return `setting-tab:${tabId.trim()}`;
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

export const PluginSettingTabRuntimeCard: React.FC<PluginSettingTabRuntimeCardProps> = ({ tab }) => {
  const runtimeSurface = tab.runtimeSurface?.entryUrl.trim().length
    ? tab.runtimeSurface
    : null;
  const runtimeSurfaceRef = React.useRef<PluginUiRuntimeSurfaceDescriptor | null>(runtimeSurface);
  const retriedSurfaceIdentityRef = React.useRef<string | null>(null);
  const [surfaceNode, setSurfaceNode] = React.useState<HTMLDivElement | null>(null);
  const [entrypointStatus, setEntrypointStatus] = React.useState<'idle' | 'module-loaded' | 'rendered' | 'module-error'>('idle');
  const [entrypointError, setEntrypointError] = React.useState<string | null>(null);
  const [guestSurfaceState, setGuestSurfaceState] = React.useState<PluginSurfaceStateSnapshot | null>(null);
  const [guestSurfaceRetryRevision, setGuestSurfaceRetryRevision] = React.useState(0);
  const surfaceInstanceId = React.useMemo(
    () => resolvePluginSettingSurfaceInstanceId(tab.id),
    [tab.id],
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
  }, [runtimeSurface?.entryUrl, tab.id]);

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

    console.error('[plugin-setting-tab-runtime] guest surface invalidated', {
      tabId: tab.id,
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
  }, [guestSurfaceState, surfaceIdentity, tab.id]);

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
      theme: capturePluginRuntimeThemeSnapshot(),
    }).catch((error: Error) => {
      setEntrypointStatus('module-error');
      setEntrypointError(error.message);
      console.error('[plugin-setting-tab-runtime] failed to attach guest surface', {
        tabId: tab.id,
        runtimeSurface: activeRuntimeSurface,
        error,
      });
    });

    return () => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_DESTROY_CHANNEL, {
        surfaceInstanceId,
      }).catch((error: Error) => {
        console.error('[plugin-setting-tab-runtime] failed to destroy guest surface', {
          tabId: tab.id,
          runtimeSurface: activeRuntimeSurface,
          error,
        });
      });
    };
  }, [guestSurfaceRetryRevision, runtimeSurface, surfaceIdentity, surfaceInstanceId, surfaceNode, tab.id]);

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
        console.error('[plugin-setting-tab-runtime] failed to update guest surface bounds', {
          tabId: tab.id,
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
  }, [guestSurfaceState, runtimeSurface, surfaceIdentity, surfaceInstanceId, surfaceNode, tab.id]);

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
        console.error('[plugin-setting-tab-runtime] failed to update guest surface runtime context', {
          tabId: tab.id,
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
  }, [runtimeSurface, runtimeSurface?.state, surfaceIdentity, surfaceInstanceId, tab.id]);

  const shouldShowBootstrapPending = runtimeSurface !== null && entrypointStatus === 'idle';

  if (runtimeSurface === null) {
    return (
      <div className="setting-item setting-item--plugin-runtime">
        <div className="plugin-setting-tab-card">
          <div className="plugin-setting-tab-card__header">
            <h3 className="setting-title">{tab.title}</h3>
            <span className="setting-source-badge">{tab.pluginName}</span>
          </div>
          <PluginRuntimeStatusNotice
            title="插件设置页"
            message="当前插件设置页未声明 UI runtime 入口。旧 DOM 设置页已停用。"
            detail={`请为插件 "${tab.pluginId}" 声明 manifest.ui.settings 入口。`}
            tone="error"
          />
          <code className="setting-key">{tab.pluginId}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="setting-item setting-item--plugin-runtime">
      <div className="plugin-setting-tab-card">
        <div className="plugin-setting-tab-card__header">
          <h3 className="setting-title">{tab.title}</h3>
          <span className="setting-source-badge">{tab.pluginName}</span>
        </div>
        <div className="plugin-setting-tab-card__surface">
          <div
            ref={setSurfaceNode}
            className="plugin-setting-tab-card__frame"
            data-plugin-runtime-surface-kind={runtimeSurface.surfaceKind}
            data-plugin-runtime-surface-id={runtimeSurface.surfaceId}
          />
          {shouldShowBootstrapPending && (
            <div className="plugin-setting-tab-card__surface-state">
              <PluginRuntimeStatusNotice
                title="插件设置页"
                message="插件设置页正在加载。"
                detail={tab.pluginId}
                tone="pending"
                layout="overlay"
              />
            </div>
          )}
          {entrypointStatus === 'module-error' && (
            <div className="plugin-setting-tab-card__surface-state">
              <PluginRuntimeStatusNotice
                title="插件设置页"
                message="插件设置页加载失败。旧 DOM 摘要回退已停用。"
                detail={entrypointError ?? tab.pluginId}
                tone="error"
                layout="overlay"
              />
            </div>
          )}
        </div>
        <code className="setting-key">{tab.pluginId}</code>
      </div>
    </div>
  );
};
