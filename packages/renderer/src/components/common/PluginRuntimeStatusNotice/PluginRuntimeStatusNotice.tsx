import React from 'react';
import './PluginRuntimeStatusNotice.scss';

type PluginRuntimeStatusNoticeTone = 'pending' | 'fallback' | 'error';
type PluginRuntimeStatusNoticeLayout = 'inline' | 'overlay';

interface PluginRuntimeStatusNoticeProps {
  readonly title: string;
  readonly message: string;
  readonly detail?: string | null;
  readonly tone: PluginRuntimeStatusNoticeTone;
  readonly layout?: PluginRuntimeStatusNoticeLayout;
}

export const PluginRuntimeStatusNotice: React.FC<PluginRuntimeStatusNoticeProps> = ({
  title,
  message,
  detail = null,
  tone,
  layout = 'inline',
}) => {
  return (
    <div
      className={`plugin-runtime-status-notice plugin-runtime-status-notice--${tone} plugin-runtime-status-notice--${layout}`}
      role="status"
      aria-live="polite"
    >
      <strong className="plugin-runtime-status-notice__title">{title}</strong>
      <p className="plugin-runtime-status-notice__message">{message}</p>
      {detail !== null && detail.trim().length > 0 && (
        <p className="plugin-runtime-status-notice__detail">{detail}</p>
      )}
    </div>
  );
};
