/**
 * 可拖动分隔条组件
 * 功能：用于调整两个面板的大小
 * 描述：垂直分隔条，支持鼠标拖动
 */

import React, { useCallback, useRef, useState } from 'react';
import './Resizer.scss';

interface ResizerProps {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
}

export const Resizer: React.FC<ResizerProps> = ({ 
  onResize, 
  direction = 'vertical' 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPosRef.current;
      startPosRef.current = currentPos;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [direction, onResize]);

  return (
    <div
      className={`resizer resizer-${direction} ${isDragging ? 'resizer-dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="resizer-handle" />
    </div>
  );
};


