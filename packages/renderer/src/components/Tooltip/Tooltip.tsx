/**
 * Tooltip 组件

 */

import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.scss';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, disabled = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isVisible && triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      // 计算 tooltip 位置（默认显示在下方）
      let top = triggerRect.bottom + 8;
      let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
      
      // 如果超出右侧边界，调整位置
      if (left + tooltipRect.width > window.innerWidth - 16) {
        left = window.innerWidth - tooltipRect.width - 16;
      }
      
      // 如果超出左侧边界，调整位置
      if (left < 16) {
        left = 16;
      }
      
      // 如果超出底部边界，显示在上方
      if (top + tooltipRect.height > window.innerHeight - 16) {
        top = triggerRect.top - tooltipRect.height - 8;
      }
      
      setPosition({ top, left });
    }
  }, [isVisible]);

  const handleMouseEnter = () => {
    if (!disabled && content) {
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  if (!content || disabled) {
    return children;
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
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
          }}
        >
          {content}
        </div>
      )}
    </>
  );
};

