/**
 * Renders a plugin workspace view inside a renderer-owned sandboxed iframe.
 */

import React from 'react';
import type {
  PluginUiEntrySnapshot,
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
  getPluginSurfaceCommandCenterPreviewSnapshot,
  subscribeToPluginSurfaceCommandCenterPreview,
} from '../../../../stores/pluginSurfaceCommandCenterPreviewStore';
import {
  PluginSandboxFrame,
  PLUGIN_SANDBOX_PERMISSION_PRESETS,
} from '../../../common/PluginSandboxFrame';
import { usePluginRuntimeIframeSurface } from '../../../common/PluginRuntimeIframeSurface';
import './PluginRuntimeView.scss';

const PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL = 'plugin-runtime:mark-view-runtime-active';

interface PluginRuntimeViewProps {
  readonly leafId: string;
  readonly title: string;
  readonly viewType: string;
  readonly sourcePath?: string | null;
  readonly runtimeSurface?: PluginUiRuntimeSurfaceDescriptor | null;
  readonly markRuntimeActive?: boolean;
  readonly showScopedHostChrome?: boolean;
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

export const PluginRuntimeView: React.FC<PluginRuntimeViewProps> = ({
  leafId,
  title,
  viewType,
  sourcePath,
  runtimeSurface = null,
  markRuntimeActive = true,
  showScopedHostChrome = true,
}) => {
  const canvasRuntimeView = React.useMemo(
    () => isCanvasRuntimeView(viewType, sourcePath),
    [sourcePath, viewType],
  );
  const runtimeSurfaceDescriptor = runtimeSurface?.entryUrl.trim().length
    ? runtimeSurface
    : null;
  const pluginSurfaceInstanceId = React.useMemo(
    () => resolvePluginSurfaceInstanceId(leafId),
    [leafId],
  );
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
  const { iframeRef, srcDoc, entrypointStatus, entrypointError } = usePluginRuntimeIframeSurface({
    surfaceInstanceId: pluginSurfaceInstanceId,
    runtimeSurface: runtimeSurfaceDescriptor,
    leafId,
    onRuntimeActive: markRuntimeActive
      ? () => {
          void window.electron?.ipcRenderer.invoke(PLUGIN_RUNTIME_MARK_VIEW_RUNTIME_ACTIVE_CHANNEL, {
            leafId,
          });
        }
      : null,
  });

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
    return subscribeToPluginSurfaceCommandCenterPreview((snapshot) => {
      setCommandCenterPreviewState(snapshot);
    });
  }, []);

  const commandCenterPreviewDataUrl = commandCenterPreviewState.previews[pluginSurfaceInstanceId] ?? null;
  const shouldShowCommandCenterPreview = commandCenterPreviewState.visible && commandCenterPreviewDataUrl !== null;

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
  const shouldShowBootstrapPending = entrypointStatus === 'idle';
  const shouldShowBootstrapError = entrypointStatus === 'module-error';

  return (
    <div className={`plugin-runtime-view ${canvasRuntimeView ? 'plugin-runtime-view--canvas' : ''}`}>
      <div className="plugin-runtime-view__surface-stack">
        <PluginSandboxFrame
          ref={iframeRef}
          className={runtimeSurfaceClassName}
          title={title}
          srcDoc={srcDoc}
          sandboxPermissions={PLUGIN_SANDBOX_PERMISSION_PRESETS.runtimeSurface}
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
      {showScopedHostChrome
        && !canvasRuntimeView
        && (scopedCanvasToolbarEntries.length > 0 || scopedCanvasTitleBarEntries.length > 0) && (
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
