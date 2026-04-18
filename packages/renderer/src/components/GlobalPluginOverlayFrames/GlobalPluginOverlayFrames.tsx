import React from 'react';
import {
  usePluginOverlayFrameStore,
  type PluginRuntimeOverlayFrameRendererPayload,
} from '../../stores/pluginOverlayFrameStore';
import { PluginRuntimeOverlayEntrypointFrame } from './PluginRuntimeOverlayEntrypointFrame';

const PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL = 'plugin-runtime:request-close-overlay-frame';

function buildPopoverSurfaceStyle(
  overlay: PluginRuntimeOverlayFrameRendererPayload,
): React.CSSProperties {
  const baseStyle: React.CSSProperties = {
    width: overlay.width !== undefined ? `${overlay.width}px` : undefined,
    height: overlay.height !== undefined ? `${overlay.height}px` : undefined,
  };

  if (overlay.chrome !== 'popover' || overlay.anchorRect === null) {
    return baseStyle;
  }

  const surfaceWidth = overlay.width ?? 420;
  const surfaceHeight = overlay.height ?? 320;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 16;
  const offset = 8;
  const preferredLeft = overlay.anchorRect.left;
  const fallbackTop = overlay.anchorRect.bottom + offset;
  const preferredTop = fallbackTop + surfaceHeight + margin <= viewportHeight
    ? fallbackTop
    : Math.max(overlay.anchorRect.top - surfaceHeight - offset, margin);
  const clampedLeft = Math.min(
    Math.max(preferredLeft, margin),
    Math.max(viewportWidth - surfaceWidth - margin, margin),
  );
  const clampedTop = Math.min(
    Math.max(preferredTop, margin),
    Math.max(viewportHeight - surfaceHeight - margin, margin),
  );

  return {
    ...baseStyle,
    position: 'absolute',
    left: `${clampedLeft}px`,
    top: `${clampedTop}px`,
  };
}

export const GlobalPluginOverlayFrames: React.FC = () => {
  const { overlays, closeOverlayById } = usePluginOverlayFrameStore();

  const requestCloseOverlay = React.useCallback((overlayId: string): void => {
    if (window.electron?.ipcRenderer !== undefined) {
      void window.electron.ipcRenderer.invoke(PLUGIN_RUNTIME_REQUEST_CLOSE_OVERLAY_FRAME_CHANNEL, {
        overlayId,
      });
      return;
    }

    closeOverlayById(overlayId);
  }, [closeOverlayById]);

  React.useEffect(() => {
    if (overlays.length === 0) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      const activeOverlay = overlays[overlays.length - 1];

      if (activeOverlay === undefined || activeOverlay.closeOnBackdrop !== true) {
        return;
      }

      event.preventDefault();
      requestCloseOverlay(activeOverlay.overlayId);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [overlays, requestCloseOverlay]);

  if (overlays.length === 0) {
    return null;
  }

  return (
    <div className="plugin-overlay-frame-host" aria-live="polite">
      {overlays.map((overlay) => {
        const overlayChrome = overlay.chrome ?? 'dialog';
        const surfaceStyle = buildPopoverSurfaceStyle(overlay);

        return (
          <div
            key={overlay.overlayId}
            className={`plugin-overlay-frame-host__backdrop plugin-overlay-frame-host__backdrop--${overlayChrome}`}
            onMouseDown={() => {
              if (overlay.closeOnBackdrop === true) {
                requestCloseOverlay(overlay.overlayId);
              }
            }}
          >
            <div
              className={`plugin-overlay-frame-host__surface plugin-overlay-frame-host__surface--${overlayChrome}`}
              role="dialog"
              aria-modal="true"
              aria-label={overlay.title}
              style={surfaceStyle}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            >
              {overlayChrome === 'dialog' && (
                <div className="plugin-overlay-frame-host__header">
                  <div className="plugin-overlay-frame-host__title">{overlay.title}</div>
                  {overlay.closeOnBackdrop === true && (
                    <button
                      type="button"
                      className="plugin-overlay-frame-host__close"
                      onClick={() => {
                        requestCloseOverlay(overlay.overlayId);
                      }}
                    >
                      关闭
                    </button>
                  )}
                </div>
              )}
              <div className={`plugin-overlay-frame-host__body plugin-overlay-frame-host__body--${overlayChrome}`}>
                <PluginRuntimeOverlayEntrypointFrame overlay={overlay} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
