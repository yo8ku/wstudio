/**
 * Tooltip component.
 * Anchors hover tips to the mouse cursor and keeps them inside the viewport.
 */

import React, { useEffect, useRef, useState } from 'react';
import './Tooltip.scss';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  disabled?: boolean;
}

interface TooltipPosition {
  top: number;
  left: number;
}

interface TooltipPointerAnchor {
  x: number;
  y: number;
}

const TOOLTIP_VIEWPORT_MARGIN = 16;
const TOOLTIP_CURSOR_OFFSET_X = 8;
const TOOLTIP_CURSOR_OFFSET_Y = 12;
const TOOLTIP_SHOW_DELAY_MS = 320;

const calculateTooltipPosition = (
  pointerAnchor: TooltipPointerAnchor,
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition => {
  let left = pointerAnchor.x + TOOLTIP_CURSOR_OFFSET_X;
  let top = pointerAnchor.y + TOOLTIP_CURSOR_OFFSET_Y;

  if (left + tooltipWidth > window.innerWidth - TOOLTIP_VIEWPORT_MARGIN) {
    left = pointerAnchor.x - tooltipWidth - TOOLTIP_CURSOR_OFFSET_X;
  }

  if (left < TOOLTIP_VIEWPORT_MARGIN) {
    left = TOOLTIP_VIEWPORT_MARGIN;
  }

  if (top + tooltipHeight > window.innerHeight - TOOLTIP_VIEWPORT_MARGIN) {
    top = pointerAnchor.y - tooltipHeight - TOOLTIP_CURSOR_OFFSET_Y;
  }

  if (top < TOOLTIP_VIEWPORT_MARGIN) {
    top = TOOLTIP_VIEWPORT_MARGIN;
  }

  return { top, left };
};

export const Tooltip: React.FC<TooltipProps> = ({ content, children, disabled = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ top: 0, left: 0 });
  const [isPositionReady, setIsPositionReady] = useState(false);
  const [anchorVersion, setAnchorVersion] = useState(0);
  const pointerAnchorRef = useRef<TooltipPointerAnchor | null>(null);
  const showDelayTimeoutRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const clearPendingShowDelay = (): void => {
    if (showDelayTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(showDelayTimeoutRef.current);
    showDelayTimeoutRef.current = null;
  };

  useEffect(() => (
    () => {
      clearPendingShowDelay();
    }
  ), []);

  useEffect(() => {
    if (!isVisible || !pointerAnchorRef.current || !tooltipRef.current) {
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    setPosition(calculateTooltipPosition(
      pointerAnchorRef.current,
      tooltipRect.width,
      tooltipRect.height,
    ));
    setIsPositionReady(true);
  }, [anchorVersion, isVisible]);

  const handleMouseEnter = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (disabled || !content) {
      return;
    }

    pointerAnchorRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
    setIsPositionReady(false);
    clearPendingShowDelay();
    showDelayTimeoutRef.current = window.setTimeout(() => {
      showDelayTimeoutRef.current = null;
      setAnchorVersion(currentVersion => currentVersion + 1);
      setIsVisible(true);
    }, TOOLTIP_SHOW_DELAY_MS);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>): void => {
    pointerAnchorRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    if (!isVisible) {
      return;
    }

    setIsPositionReady(false);
    setAnchorVersion(currentVersion => currentVersion + 1);
  };

  const handleMouseLeave = (): void => {
    clearPendingShowDelay();
    setIsVisible(false);
    setIsPositionReady(false);
  };

  if (!content || disabled) {
    return children;
  }

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', width: '100%' }}
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className="custom-tooltip"
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            visibility: isPositionReady ? 'visible' : 'hidden',
          }}
        >
          {content}
        </div>
      )}
    </>
  );
};
