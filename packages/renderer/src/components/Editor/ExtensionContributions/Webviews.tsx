/**
 * Webview 容器组件
 */

import React, { useEffect, useRef } from 'react';
import type { JsonValue } from '@note-studio/shared';
import { PluginSandboxFrame, PLUGIN_SANDBOX_PERMISSION_PRESETS } from '../../common/PluginSandboxFrame';

interface WebviewsProps {
  readonly html: string;
  readonly onMessage?: (message: JsonValue) => void;
}

export const Webviews: React.FC<WebviewsProps> = ({ html, onMessage }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return undefined;
    }

    const handleMessage = (e: MessageEvent<JsonValue>): void => {
      onMessage?.(e.data);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  return (
    <div className="webview-container">
      <PluginSandboxFrame
        ref={iframeRef}
        srcDoc={html}
        sandboxPermissions={PLUGIN_SANDBOX_PERMISSION_PRESETS.legacyWebview}
      />
    </div>
  );
};



