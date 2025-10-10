/**
 * Webview 容器组件
 */

import React, { useEffect, useRef } from 'react';

interface WebviewsProps {
  html: string;
  onMessage?: (message: any) => void;
}

export const Webviews: React.FC<WebviewsProps> = ({ html, onMessage }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleMessage = (e: MessageEvent) => {
      onMessage?.(e.data);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onMessage]);

  return (
    <div className="webview-container">
      <iframe
        ref={iframeRef}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
};



