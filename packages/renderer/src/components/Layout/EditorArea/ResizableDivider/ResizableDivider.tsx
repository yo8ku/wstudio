/**
 * 可调整大小的分隔条组件
 * 功能：允许用户通过拖动来调整左右编辑器组的宽度
 * 描述：提供视觉反馈和平滑的拖动体验
 */

import React, { useRef, useCallback, useState } from 'react';
import './ResizableDivider.scss';

interface ResizableDividerProps {
  onResize: (leftWidth: number) => void;
  minLeftWidth?: number;
  minRightWidth?: number;
}

export const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onResize,
  minLeftWidth = 200,
  minRightWidth = 200,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startLeftWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;

    // 获取当前左侧编辑器组的宽度
    const leftGroup = document.querySelector('.editor-area-group.split-left') as HTMLElement;
    if (leftGroup) {
      startLeftWidthRef.current = leftGroup.offsetWidth;
    }

    // 添加全局鼠标移动和释放监听
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const newLeftWidth = startLeftWidthRef.current + deltaX;

      // 获取容器总宽度
      const container = document.querySelector('.editor-area-groups') as HTMLElement;
      if (!container) return;

      const totalWidth = container.offsetWidth;
      const newRightWidth = totalWidth - newLeftWidth - 5; // 5px 是分隔条宽度

      // 检查最小宽度限制
      if (newLeftWidth >= minLeftWidth && newRightWidth >= minRightWidth) {
        onResize(newLeftWidth);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // 移除选择禁用样式
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // 禁用文本选择
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onResize, minLeftWidth, minRightWidth]);

  return (
    <div
      className={`resizable-divider ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    >
      <div className="resizable-divider-handle" />
    </div>
  );
};




