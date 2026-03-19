import React, { useEffect, useState } from 'react';
import type { WorkbenchViewContributionEntry } from '@note-studio/shared';
import './PluginWorkbenchViews.scss';

interface PluginWorkbenchViewsProps {
  readonly views: readonly WorkbenchViewContributionEntry[];
}

export const PluginWorkbenchViews: React.FC<PluginWorkbenchViewsProps> = ({ views }) => {
  const [activeViewKey, setActiveViewKey] = useState<string | null>(views[0]?.viewKey ?? null);

  useEffect(() => {
    if (views.length === 0) {
      setActiveViewKey(null);
      return;
    }

    if (!activeViewKey || !views.some(view => view.viewKey === activeViewKey)) {
      setActiveViewKey(views[0].viewKey);
    }
  }, [activeViewKey, views]);

  const activeView = views.find(view => view.viewKey === activeViewKey) ?? views[0] ?? null;

  if (!activeView) {
    return (
      <div className="plugin-workbench-views plugin-workbench-views--empty">
        <div className="plugin-workbench-views-placeholder">
          <strong>插件视图未提供可渲染内容</strong>
          <p>当前容器下还没有注册 view。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="plugin-workbench-views">
      {views.length > 1 && (
        <div className="plugin-workbench-views-tabs" role="tablist" aria-label="插件视图标签">
          {views.map(view => {
            const isActive = view.viewKey === activeView.viewKey;
            return (
              <button
                key={view.viewKey}
                type="button"
                className={`plugin-workbench-views-tab${isActive ? ' is-active' : ''}`}
                onClick={() => setActiveViewKey(view.viewKey)}
                role="tab"
                aria-selected={isActive}
                title={view.title}
              >
                {view.title}
              </button>
            );
          })}
        </div>
      )}

      <div className="plugin-workbench-views-body">
        {views.map(view => {
          const isActive = view.viewKey === activeView.viewKey;

          if (!isActive && !view.retainContextWhenHidden) {
            return null;
          }

          if (!view.webviewEntryUrl) {
            if (!isActive) {
              return null;
            }

            return (
              <div key={view.viewKey} className="plugin-workbench-views-panel">
                <div className="plugin-workbench-views-placeholder">
                  <strong>{view.title}</strong>
                  <p>该 view 已注册，但当前没有绑定可渲染的 webview HTML 入口。</p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={view.viewKey}
              className={`plugin-workbench-views-panel${isActive ? ' is-active' : ' is-hidden'}`}
            >
              <iframe
                className="plugin-workbench-views-frame"
                title={view.title}
                src={view.webviewHtml ? undefined : (view.webviewEntryUrl ?? undefined)}
                srcDoc={view.webviewHtml ?? undefined}
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
