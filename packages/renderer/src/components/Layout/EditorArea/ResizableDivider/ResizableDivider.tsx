/**
 * 可调整大小的分隔条组件
 * 功能：支持左右分屏和上下分屏两种拖拽调整
 */

import React, { useRef, useCallback, useState } from 'react';
import './ResizableDivider.scss';

type SplitOrientation = 'horizontal' | 'vertical';

interface ResizableDividerProps {
  onResize: (primarySize: number, secondarySize?: number) => void;
  orientation?: SplitOrientation;
  minPrimarySize?: number;
  minSecondarySize?: number;
  resizeScope?: 'container' | 'adjacent';
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onResize,
  orientation = 'horizontal',
  minPrimarySize = 200,
  minSecondarySize = 200,
  resizeScope = 'container',
}) => {
  const dividerSize = 8;
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const startPositionRef = useRef<number>(0);
  const startPrimarySizeRef = useRef<number>(0);
  const startSecondarySizeRef = useRef<number>(0);
  const containerSizeRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPositionRef.current = orientation === 'horizontal' ? e.clientX : e.clientY;

    const dividerEl = dividerRef.current;
    const containerEl = dividerEl?.parentElement as HTMLElement | null;
    const primaryEl = dividerEl?.previousElementSibling as HTMLElement | null;
    const secondaryEl = dividerEl?.nextElementSibling as HTMLElement | null;
    if (!containerEl || !primaryEl) {
      setIsDragging(false);
      return;
    }
    startPrimarySizeRef.current =
      orientation === 'horizontal' ? primaryEl.offsetWidth : primaryEl.offsetHeight;
    startSecondarySizeRef.current =
      resizeScope === 'adjacent' && secondaryEl
        ? (orientation === 'horizontal' ? secondaryEl.offsetWidth : secondaryEl.offsetHeight)
        : 0;
    containerSizeRef.current =
      orientation === 'horizontal' ? containerEl.offsetWidth : containerEl.offsetHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentPosition = orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
      const delta = currentPosition - startPositionRef.current;
      const newPrimarySize = startPrimarySizeRef.current + delta;

      if (resizeScope === 'adjacent' && startSecondarySizeRef.current > 0) {
        const totalPairSize = startPrimarySizeRef.current + startSecondarySizeRef.current + dividerSize;
        const newSecondarySize = totalPairSize - newPrimarySize - dividerSize;
        if (newPrimarySize >= minPrimarySize && newSecondarySize >= minSecondarySize) {
          onResize(newPrimarySize, newSecondarySize);
        }
        return;
      }

      const totalSize = containerSizeRef.current;
      const newSecondarySize = totalSize - newPrimarySize - dividerSize;
      if (newPrimarySize >= minPrimarySize && newSecondarySize >= minSecondarySize) {
        onResize(newPrimarySize);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, orientation, minPrimarySize, minSecondarySize, resizeScope, dividerSize]);

  return (
    <div
      ref={dividerRef}
      className={`resizable-divider ${orientation} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="resizable-divider-handle" />
    </div>
  );
};
