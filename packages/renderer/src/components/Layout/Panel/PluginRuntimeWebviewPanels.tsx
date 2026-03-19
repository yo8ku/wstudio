/**
 * Renders runtime plugin webview panels inside the shared panel container.
 */

import React, { useEffect, useRef } from 'react';
import type { JsonValue, WorkbenchRuntimeWebviewPanelEntry } from '@note-studio/shared';
import { webviewService } from '../../../services/WebviewService';

interface PluginRuntimeWebviewPanelsProps {
  readonly panels: readonly WorkbenchRuntimeWebviewPanelEntry[];
  readonly activePanelInstanceKey: string | null;
}

function postMessageToIframe(
  iframe: HTMLIFrameElement | null,
  message: JsonValue,
): boolean {
  if (!iframe?.contentWindow) {
    return false;
  }

  iframe.contentWindow.postMessage(message, '*');
  return true;
}

export const PluginRuntimeWebviewPanels: React.FC<PluginRuntimeWebviewPanelsProps> = ({
  panels,
  activePanelInstanceKey,
}) => {
  const iframeRefs = useRef(new Map<string, HTMLIFrameElement | null>());
  const loadedPanelsRef = useRef(new Set<string>());
  const pendingMessagesRef = useRef(new Map<string, JsonValue[]>());

  useEffect(() => {
    const unsubscribeCallbacks = panels.map(panel => webviewService.subscribe(
      panel.panelInstanceKey,
      (message) => {
        const iframe = iframeRefs.current.get(panel.panelInstanceKey) ?? null;
        const isLoaded = loadedPanelsRef.current.has(panel.panelInstanceKey);
        if (isLoaded && postMessageToIframe(iframe, message)) {
          return;
        }

        const pendingMessages = pendingMessagesRef.current.get(panel.panelInstanceKey) ?? [];
        pendingMessages.push(message);
        pendingMessagesRef.current.set(panel.panelInstanceKey, pendingMessages);
      },
    ));

    return () => {
      for (const unsubscribe of unsubscribeCallbacks) {
        unsubscribe();
      }
    };
  }, [panels]);

  useEffect(() => {
    const panelKeys = new Set(panels.map(panel => panel.panelInstanceKey));

    for (const panelInstanceKey of Array.from(iframeRefs.current.keys())) {
      if (!panelKeys.has(panelInstanceKey)) {
        iframeRefs.current.delete(panelInstanceKey);
      }
    }

    for (const panelInstanceKey of Array.from(loadedPanelsRef.current.values())) {
      if (!panelKeys.has(panelInstanceKey)) {
        loadedPanelsRef.current.delete(panelInstanceKey);
      }
    }

    for (const panelInstanceKey of Array.from(pendingMessagesRef.current.keys())) {
      if (!panelKeys.has(panelInstanceKey)) {
        pendingMessagesRef.current.delete(panelInstanceKey);
        webviewService.resetPanel(panelInstanceKey);
      }
    }
  }, [panels]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<JsonValue>): void => {
      for (const panel of panels) {
        const iframe = iframeRefs.current.get(panel.panelInstanceKey) ?? null;
        if (!iframe?.contentWindow || iframe.contentWindow !== event.source) {
          continue;
        }

        void webviewService.postMessage(panel.panelInstanceKey, event.data).catch((error) => {
          console.error('[PluginRuntimeWebviewPanels] 向宿主转发 webview 消息失败:', error);
        });
        return;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [panels]);

  const flushPendingMessages = (panelInstanceKey: string): void => {
    const pendingMessages = pendingMessagesRef.current.get(panelInstanceKey);
    if (!pendingMessages || pendingMessages.length === 0) {
      return;
    }

    const iframe = iframeRefs.current.get(panelInstanceKey) ?? null;
    if (!iframe?.contentWindow) {
      return;
    }

    pendingMessagesRef.current.delete(panelInstanceKey);
    for (const message of pendingMessages) {
      iframe.contentWindow.postMessage(message, '*');
    }
  };

  return (
    <>
      {panels.map((panel) => {
        const isActive = activePanelInstanceKey === panel.panelInstanceKey;
        const shouldRenderIframe = isActive || panel.retainContextWhenHidden;

        return (
          <div
            key={panel.panelInstanceKey}
            className={`panel-container-view ${isActive ? 'active' : ''}`}
          >
            <div className='panel-container-plugin-webview'>
              {shouldRenderIframe ? (
                <iframe
                  ref={(element) => {
                    iframeRefs.current.set(panel.panelInstanceKey, element);
                    if (!element) {
                      loadedPanelsRef.current.delete(panel.panelInstanceKey);
                    }
                  }}
                  className='panel-container-plugin-webview-frame'
                  src={panel.webviewHtml ? undefined : panel.webviewEntryUrl}
                  srcDoc={panel.webviewHtml ?? undefined}
                  sandbox='allow-scripts allow-same-origin'
                  title={panel.title}
                  onLoad={() => {
                    loadedPanelsRef.current.add(panel.panelInstanceKey);
                    flushPendingMessages(panel.panelInstanceKey);
                  }}
                />
              ) : (
                <div className='panel-container-plugin-webview-placeholder'>
                  <p>该插件面板在重新打开时会重新加载。</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};
