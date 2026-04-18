/**
 * Renders a plugin-contributed workspace view inside the editor area while
 * keeping the plugin body isolated inside a guest surface.
 */

import React from 'react';
import type {
  PluginUiEntrySnapshot,
  PluginSurfaceRuntimeStatusSnapshot,
  PluginSurfaceStateSnapshot,
  PluginUiRuntimeSurfaceDescriptor,
} from '@note-studio/shared';
import { PluginUiIcon } from '../../../Icons';
import { notification } from '../../../Notification';
import { usePluginUiEntries } from '../../../../hooks/usePluginUiEntries';
import { pluginUIService } from '../../../../services/PluginUIService';
import {
  matchesPluginUiEntryScope,
  resolvePluginUiSourceFileExtension,
} from '../../../../utils/pluginUiScope';
import { PluginRuntimeStatusNotice } from '../../../common/PluginRuntimeStatusNotice/PluginRuntimeStatusNotice';
import {
  capturePluginRuntimeThemeSnapshot,
} from './pluginRuntimeThemeVariables';
import {
  getPluginSurfaceCommandCenterPreviewSnapshot,
  subscribeToPluginSurfaceCommandCenterPreview,
} from '../../../../stores/pluginSurfaceCommandCenterPreviewStore';
import './PluginRuntimeView.scss';

const PLUGIN_SURFACE_ATTACH_CHANNEL = 'plugin-surface:attach';
const PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL = 'plugin-surface:update-bounds';
const PLUGIN_SURFACE_DESTROY_CHANNEL = 'plugin-surface:destroy';
const PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL = 'plugin-surface:update-context';
const PLUGIN_SURFACE_STATE_CHANGED_CHANNEL = 'plugin-surface:state-changed';
const PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL = 'plugin-surface:runtime-status-changed';
const PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL = 'plugin-runtime:mark-view-runtime-active';

interface PluginSurfaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface PluginRuntimeViewProps {
  readonly leafId: string;
  readonly title: string;
  readonly viewType: string;
  readonly sourcePath?: string | null;
  readonly runtimeSurface?: PluginUiRuntimeSurfaceDescriptor | null;
}

function isCanvasRuntimeView(viewType: string, sourcePath: string | null | undefined): boolean {
  const normalizedViewType = viewType.trim().toLowerCase();
  const sourceExtension = resolvePluginUiSourceFileExtension(sourcePath);

  if (sourceExtension === 'canvas' || sourceExtension === 'canvs') {
    return true;
  }

  return normalizedViewType.includes('canvas') || normalizedViewType.includes('whiteboard');
}

function resolvePluginSurfaceInstanceId(leafId: string): string {
  return `leaf:${leafId.trim()}`;
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

export const PluginRuntimeView: React.FC<PluginRuntimeViewProps> = ({
  leafId,
  title,
  viewType,
  sourcePath,
  runtimeSurface = null,
}) => {
  const canvasRuntimeView = React.useMemo(
    () => isCanvasRuntimeView(viewType, sourcePath),
    [sourcePath, viewType],
  );
  const runtimeSurfaceDescriptor = runtimeSurface?.entryUrl.trim().length
    ? runtimeSurface
    : null;
  const runtimeSurfaceDescriptorRef = React.useRef<PluginUiRuntimeSurfaceDescriptor | null>(runtimeSurfaceDescriptor);
  const retriedGuestSurfaceIdentityRef = React.useRef<string | null>(null);
  const runtimeActivationReportedRef = React.useRef(false);
  const [surfaceFrameNode, setSurfaceFrameNode] = React.useState<HTMLDivElement | null>(null);
  const [entrypointStatus, setEntrypointStatus] = React.useState<'idle' | 'module-loaded' | 'rendered' | 'module-error'>('idle');
  const [entrypointError, setEntrypointError] = React.useState<string | null>(null);
  const [guestSurfaceState, setGuestSurfaceState] = React.useState<PluginSurfaceStateSnapshot | null>(null);
  const [guestSurfaceRetryRevision, setGuestSurfaceRetryRevision] = React.useState(0);
  const [commandCenterPreviewState, setCommandCenterPreviewState] = React.useState(
    () => getPluginSurfaceCommandCenterPreviewSnapshot(),
  );
  const canvasToolbarEntries = usePluginUiEntries('canvasToolbar');
  const canvasTitleBarEntries = usePluginUiEntries('canvasTitleBar');
  const scopedCanvasToolbarEntries = React.useMemo(
    () => canvasToolbarEntries.filter((entry) => matchesPluginUiEntryScope(entry, viewType, sourcePath)),
    [canvasToolbarEntries, sourcePath, viewType],
  );
  const scopedCanvasTitleBarEntries = React.useMemo(
    () => canvasTitleBarEntries.filter((entry) => matchesPluginUiEntryScope(entry, viewType, sourcePath)),
    [canvasTitleBarEntries, sourcePath, viewType],
  );
  const executePluginUiEntry = React.useCallback(async (entryId: string): Promise<void> => {
    try {
      await pluginUIService.executeEntry(entryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notification.error(`执行插件画布入口失败：${message}`);
    }
  }, []);
  const renderHostAction = React.useCallback((entry: PluginUiEntrySnapshot): React.ReactElement => (
    <div
      key={entry.id}
      className="plugin-runtime-view__host-action"
      role="button"
      tabIndex={0}
      title={entry.tooltip ?? entry.title}
      onClick={() => {
        void executePluginUiEntry(entry.id);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        void executePluginUiEntry(entry.id);
      }}
    >
      <PluginUiIcon name={entry.icon} svgContent={entry.iconSvg} size={14} />
      <span>{entry.text ?? entry.title}</span>
    </div>
  ), [executePluginUiEntry]);

  React.useEffect(() => {
    setEntrypointStatus('idle');
    setEntrypointError(null);
    setGuestSurfaceState(null);
    setGuestSurfaceRetryRevision(0);
    retriedGuestSurfaceIdentityRef.current = null;
    runtimeActivationReportedRef.current = false;
  }, [leafId, runtimeSurfaceDescriptor?.entryUrl]);

  React.useEffect(() => {
    runtimeSurfaceDescriptorRef.current = runtimeSurfaceDescriptor;
  }, [runtimeSurfaceDescriptor]);

  const pluginSurfaceInstanceId = React.useMemo(
    () => resolvePluginSurfaceInstanceId(leafId),
    [leafId],
  );
  const commandCenterPreviewDataUrl = commandCenterPreviewState.previews[pluginSurfaceInstanceId] ?? null;
  const shouldShowCommandCenterPreview = commandCenterPreviewState.visible && commandCenterPreviewDataUrl !== null;
  const pluginSurfaceIdentity = React.useMemo(() => {
    if (runtimeSurfaceDescriptor === null) {
      return null;
    }

    return [
      runtimeSurfaceDescriptor.pluginId,
      runtimeSurfaceDescriptor.surfaceKind,
      runtimeSurfaceDescriptor.surfaceId,
      runtimeSurfaceDescriptor.entryUrl,
    ].join('|');
  }, [runtimeSurfaceDescriptor]);
  const hasRuntimeSurfaceDescriptor = runtimeSurfaceDescriptor !== null;

  React.useEffect(() => {
    retriedGuestSurfaceIdentityRef.current = null;
    setGuestSurfaceRetryRevision(0);
  }, [pluginSurfaceIdentity]);

  React.useEffect(() => {
    return subscribeToPluginSurfaceCommandCenterPreview((snapshot) => {
      setCommandCenterPreviewState(snapshot);
    });
  }, []);

  React.useEffect(() => {
    if (
      !hasRuntimeSurfaceDescriptor
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const unsubscribe = window.electron.ipcRenderer.on(
      PLUGIN_SURFACE_STATE_CHANGED_CHANNEL,
      (_event: object, snapshot: PluginSurfaceStateSnapshot) => {
        if (snapshot.surfaceInstanceId !== pluginSurfaceInstanceId) {
          return;
        }

        setGuestSurfaceState(snapshot);
      },
    );

    return unsubscribe ?? (() => undefined);
  }, [hasRuntimeSurfaceDescriptor, pluginSurfaceInstanceId]);

  React.useEffect(() => {
    if (
      !hasRuntimeSurfaceDescriptor
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const unsubscribe = window.electron.ipcRenderer.on(
      PLUGIN_SURFACE_RUNTIME_STATUS_CHANGED_CHANNEL,
      (_event: object, snapshot: PluginSurfaceRuntimeStatusSnapshot) => {
        if (snapshot.surfaceInstanceId !== pluginSurfaceInstanceId) {
          return;
        }

        setEntrypointStatus(snapshot.status);
        setEntrypointError(snapshot.error);

        if (
          runtimeActivationReportedRef.current
          || (snapshot.status !== 'module-loaded' && snapshot.status !== 'rendered')
        ) {
          return;
        }

        runtimeActivationReportedRef.current = true;
        void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL, {
          leafId,
        });
      },
    );

    return unsubscribe ?? (() => undefined);
  }, [hasRuntimeSurfaceDescriptor, leafId, pluginSurfaceInstanceId]);

  React.useEffect(() => {
    if (guestSurfaceState === null) {
      return;
    }

    console.error('[plugin-runtime-view] guest surface invalidated', {
      leafId,
      runtimeSurface: runtimeSurfaceDescriptorRef.current,
      guestSurfaceState,
    });

    if (pluginSurfaceIdentity === null) {
      return;
    }

    if (retriedGuestSurfaceIdentityRef.current === pluginSurfaceIdentity) {
      return;
    }

    retriedGuestSurfaceIdentityRef.current = pluginSurfaceIdentity;
    runtimeActivationReportedRef.current = false;
    setEntrypointStatus('idle');
    setEntrypointError(null);
    setGuestSurfaceState(null);
    setGuestSurfaceRetryRevision((currentRevision) => currentRevision + 1);
  }, [guestSurfaceState, leafId, pluginSurfaceIdentity]);

  React.useEffect(() => {
    if (
      !hasRuntimeSurfaceDescriptor
      || surfaceFrameNode === null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const activeRuntimeSurface = runtimeSurfaceDescriptorRef.current;

    if (activeRuntimeSurface === null) {
      return undefined;
    }

    const attachRequest = {
      surfaceInstanceId: pluginSurfaceInstanceId,
      surface: activeRuntimeSurface,
      bounds: measurePluginSurfaceBounds(surfaceFrameNode),
      visible: false,
      leafId,
      theme: capturePluginRuntimeThemeSnapshot(),
    };

    void window.electron.ipcRenderer.invoke(PLUGIN_SURFACE_ATTACH_CHANNEL, attachRequest).catch((error: Error) => {
      setEntrypointStatus('module-error');
      setEntrypointError(error.message);
      console.error('[plugin-runtime-view] failed to attach guest surface viewport', {
        leafId,
        runtimeSurface: activeRuntimeSurface,
        error,
      });
    });

    return () => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_DESTROY_CHANNEL, {
        surfaceInstanceId: pluginSurfaceInstanceId,
      }).catch((error: Error) => {
        console.error('[plugin-runtime-view] failed to destroy guest surface viewport', {
          leafId,
          runtimeSurface: activeRuntimeSurface,
          error,
        });
      });
    };
  }, [
    guestSurfaceRetryRevision,
    hasRuntimeSurfaceDescriptor,
    leafId,
    pluginSurfaceIdentity,
    pluginSurfaceInstanceId,
    surfaceFrameNode,
  ]);

  React.useEffect(() => {
    if (
      !hasRuntimeSurfaceDescriptor
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    const pushRuntimeContext = (): void => {
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_UPDATE_CONTEXT_CHANNEL, {
        surfaceInstanceId: pluginSurfaceInstanceId,
        state: runtimeSurfaceDescriptorRef.current?.state ?? null,
        theme: capturePluginRuntimeThemeSnapshot(),
      }).then((response: { readonly success: boolean } | undefined) => {
        if (response?.success === true) {
          return;
        }
      }).catch((error: Error) => {
        console.error('[plugin-runtime-view] failed to update guest surface runtime context', {
          leafId,
          runtimeSurface: runtimeSurfaceDescriptorRef.current,
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
  }, [
    hasRuntimeSurfaceDescriptor,
    leafId,
    runtimeSurfaceDescriptor?.state,
    pluginSurfaceIdentity,
    pluginSurfaceInstanceId,
  ]);

  React.useEffect(() => {
    if (
      !hasRuntimeSurfaceDescriptor
      || surfaceFrameNode === null
      || guestSurfaceState !== null
      || window.electron?.ipcRenderer === undefined
    ) {
      return undefined;
    }

    let animationFrameId = 0;

    const syncBounds = (): void => {
      const activeRuntimeSurface = runtimeSurfaceDescriptorRef.current;
      void window.electron?.ipcRenderer.invoke(PLUGIN_SURFACE_UPDATE_BOUNDS_CHANNEL, {
        surfaceInstanceId: pluginSurfaceInstanceId,
        bounds: measurePluginSurfaceBounds(surfaceFrameNode),
      }).catch((error: Error) => {
        console.error('[plugin-runtime-view] failed to update guest surface bounds', {
          leafId,
          runtimeSurface: activeRuntimeSurface,
          error,
        });
      });
    };

    const scheduleBoundsSync = (): void => {
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
    resizeObserver.observe(surfaceFrameNode);
    window.addEventListener('resize', scheduleBoundsSync);
    window.addEventListener('scroll', scheduleBoundsSync, true);

    return () => {
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }

      resizeObserver.disconnect();
      window.removeEventListener('resize', scheduleBoundsSync);
      window.removeEventListener('scroll', scheduleBoundsSync, true);
    };
  }, [guestSurfaceState, hasRuntimeSurfaceDescriptor, leafId, pluginSurfaceIdentity, pluginSurfaceInstanceId, surfaceFrameNode]);

  const shouldShowBootstrapPending = runtimeSurfaceDescriptor !== null && entrypointStatus === 'idle';
  const shouldShowBootstrapError = runtimeSurfaceDescriptor !== null && entrypointStatus === 'module-error';

  if (runtimeSurfaceDescriptor === null) {
    return (
      <div className="plugin-runtime-view plugin-runtime-view--empty">
        <PluginRuntimeStatusNotice
          title={title}
          message="当前插件视图未声明 UI runtime 入口。旧 DOM 视图已停用。"
          detail={`请为视图 "${viewType}" 声明 manifest.ui.views 入口。`}
          tone="error"
        />
      </div>
    );
  }

  const shouldUseHostScroll = !canvasRuntimeView;
  const runtimeSurfaceClassName = [
    'plugin-runtime-view__surface',
    canvasRuntimeView ? 'plugin-runtime-view__surface--canvas' : '',
    shouldUseHostScroll ? 'plugin-runtime-view__surface--flow' : '',
    entrypointStatus === 'module-error'
      ? 'plugin-runtime-view__surface--entrypoint-preload'
      : 'plugin-runtime-view__surface--entrypoint-active',
  ].filter((value) => value.length > 0).join(' ');

  return (
    <div className={`plugin-runtime-view ${canvasRuntimeView ? 'plugin-runtime-view--canvas' : ''}`}>
      <div className="plugin-runtime-view__surface-stack">
        <div
          ref={setSurfaceFrameNode}
          className={runtimeSurfaceClassName}
          data-plugin-runtime-surface-kind={runtimeSurfaceDescriptor.surfaceKind}
          data-plugin-runtime-surface-id={runtimeSurfaceDescriptor.surfaceId}
        />
        {shouldShowCommandCenterPreview && (
          <div className="plugin-runtime-view__surface-preview" aria-hidden="true">
            <img
              className="plugin-runtime-view__surface-preview-image"
              src={commandCenterPreviewDataUrl}
              alt=""
            />
          </div>
        )}
        {shouldShowBootstrapPending && (
          <PluginRuntimeStatusNotice
            title={title}
            message="插件视图正在加载。"
            detail={`视图类型：${viewType}`}
            tone="pending"
            layout="overlay"
          />
        )}
        {shouldShowBootstrapError && (
          <PluginRuntimeStatusNotice
            title={title}
            message="插件视图加载失败。旧 DOM 快照回退已停用。"
            detail={entrypointError ?? `视图类型：${viewType}`}
            tone="error"
            layout="overlay"
          />
        )}
      </div>
      {!canvasRuntimeView && (scopedCanvasToolbarEntries.length > 0 || scopedCanvasTitleBarEntries.length > 0) && (
        <div className="plugin-runtime-view__host-chrome">
          {scopedCanvasToolbarEntries.length > 0 && (
            <div className="plugin-runtime-view__host-toolbar">
              {scopedCanvasToolbarEntries.map(renderHostAction)}
            </div>
          )}
          {scopedCanvasTitleBarEntries.length > 0 && (
            <div className="plugin-runtime-view__host-title-actions">
              {scopedCanvasTitleBarEntries.map(renderHostAction)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


