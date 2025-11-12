/**
 * 通用拖动调整大小手柄组件
 * 功能：提供可拖动的调整大小功能，支持垂直和水平方法
 * 描述：从终端面板中抽离的通用组件，可复用于各种需要调整大小的场景
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ResizeHandle.scss';

export type ResizeDirection = 'vertical' | 'horizontal';

export interface ResizeHandleProps {
  /**
   * 调整方向
   * - 'vertical': 垂直方向（上下拖动，调整高度
   * - 'horizontal': 水平方向（左右拖动，调整宽度
   */
  direction?: ResizeDirection;
  
  /**
   * 初始大小（px
   */
  initialSize?: number;
  
  /**
   * 最小大小（px
   */
  minSize?: number;
  
  /**
   * 最大大小（px
   */
  maxSize?: number;
  
  /**
   * 大小变化回调
   */
  onResize?: (size: number) => void;
  
  /**
   * 开始调整回
   */
  onResizeStart?: () => void;
  
  /**
   * 结束调整回调
   */
  onResizeEnd?: () => void;
  
  /**
   * 自定义类型
   */
  className?: string;
}

export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  direction = 'vertical',
  initialSize = 300,
  minSize = 100,
  maxSize = 800,
  onResize,
  onResizeStart,
  onResizeEnd,
  className = '',
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(initialSize);

  // 同步 initialSize 到 ref
  useEffect(() => {
    if (!isResizing) {
      startSizeRef.current = initialSize;
    }
  }, [initialSize, isResizing]);

  // 开始调整大小
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    if (direction === 'vertical') {
      startPosRef.current = e.clientY;
    } else {
      startPosRef.current = e.clientX;
    }
    
    startSizeRef.current = initialSize;
    onResizeStart?.();
  }, [direction, initialSize, onResizeStart]);

  // 调整大小
  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    let delta = 0;
    if (direction === 'vertical') {
      // 垂直方向：向上拖动为正（增加高度
      delta = startPosRef.current - e.clientY;
    } else {
      // 水平方向：向右拖动为正（增加宽度
      delta = e.clientX - startPosRef.current;
    }
    
    const newSize = Math.min(
      Math.max(startSizeRef.current + delta, minSize),
      maxSize
    );
    
    onResize?.(newSize);
  }, [isResizing, direction, minSize, maxSize, onResize]);

  // 结束调整大小
  const handleResizeEnd = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      onResizeEnd?.();
    }
  }, [isResizing, onResizeEnd]);

  // 监听鼠标事件
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return (
    <div
      className={`resize-handle resize-handle--${direction} ${isResizing ? 'resize-handle--resizing' : ''} ${className}`}
      onMouseDown={handleResizeStart}
    />
  );
};

export default ResizeHandle;

