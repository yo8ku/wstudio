/**
 * Renders a plugin setting tab inside a renderer-owned sandboxed iframe.
 */

import React from 'react';
import type { PluginUiRuntimeSurfaceDescriptor } from '@note-studio/shared';
import { PluginRuntimeStatusNotice } from '../../common/PluginRuntimeStatusNotice/PluginRuntimeStatusNotice';
import {
  PluginSandboxFrame,
  PLUGIN_SANDBOX_PERMISSION_PRESETS,
} from '../../common/PluginSandboxFrame';
import { usePluginRuntimeIframeSurface } from '../../common/PluginRuntimeIframeSurface';

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

function resolvePluginSettingSurfaceInstanceId(tabId: string): string {
  return `setting-tab:${tabId.trim()}`;
}

export const PluginSettingTabRuntimeCard: React.FC<PluginSettingTabRuntimeCardProps> = ({ tab }) => {
  const runtimeSurface = tab.runtimeSurface?.entryUrl.trim().length
    ? tab.runtimeSurface
    : null;
  const surfaceInstanceId = React.useMemo(
    () => resolvePluginSettingSurfaceInstanceId(tab.id),
    [tab.id],
  );
  const { iframeRef, srcDoc, entrypointStatus, entrypointError } = usePluginRuntimeIframeSurface({
    surfaceInstanceId,
    runtimeSurface,
  });
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
          <PluginSandboxFrame
            ref={iframeRef}
            className="plugin-setting-tab-card__frame"
            title={tab.title}
            srcDoc={srcDoc}
            sandboxPermissions={PLUGIN_SANDBOX_PERMISSION_PRESETS.runtimeSurface}
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
