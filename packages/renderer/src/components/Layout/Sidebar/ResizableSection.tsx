/**
 * 可调整大小的折叠部分组件
 * 支持通过拖动手柄调整高度
 */

import React, { useState, useRef, useEffect } from 'react';

interface ResizableSectionProps {
  title: string;
  isExpanded?: boolean;
  onToggle?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  collapsible?: boolean;
  resizable?: boolean;
}

export const ResizableSection: React.FC<ResizableSectionProps> = ({
  title,
  isExpanded: externalIsExpanded,
  onToggle: externalOnToggle,
  actions,
  children,
  defaultHeight = 200,
  minHeight = 100,
  maxHeight = 600,
  collapsible = true,
  resizable = true
}) => {
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // 使用外部或内部状态
  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const onToggle = externalOnToggle || (() => setInternalIsExpanded(!internalIsExpanded));

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaY = e.clientY - startYRef.current;
      const newHeight = Math.min(
        Math.max(startHeightRef.current + deltaY, minHeight),
        maxHeight
      );
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minHeight, maxHeight]);

  return (
    <div className="resizable-section">
      <div 
        className="section-header" 
        onClick={collapsible ? onToggle : undefined}
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
      >
        <div className="header-content">
          {collapsible && (
            <svg 
              className={`chevron ${isExpanded ? 'expanded' : ''}`}
              width="16" 
              height="16" 
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  isExpanded
                    ? 'M19 9l-7 7-7-7'  // 展开：向下箭头
                    : 'M9 5l7 7-7 7'    // 折叠：向右箭头
                }
              />
            </svg>
          )}
          <span className="title">{title}</span>
        </div>
        {actions && (
          <div className="section-actions" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
      
      {isExpanded && (
        <>
          <div 
            className="section-content" 
            style={resizable ? { height: `${height}px` } : undefined}
          >
            {children}
          </div>
          {resizable && (
            <div 
              className={`resize-handle ${isResizing ? 'resizing' : ''}`}
              onMouseDown={handleMouseDown}
            >
              <div className="resize-handle-line" />
            </div>
          )}
        </>
      )}

      <style>{`
        .resizable-section {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 4px 12px 4px 0;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          cursor: pointer;
          user-select: none;
          background: var(--sidebar-bg);
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .section-header:hover {
          background: var(--hover-bg, rgba(255, 255, 255, 0.05));
        }

        .header-content {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          min-width: 0;
          padding-left: 4px;
        }

        .chevron {
          display: inline-block;
          opacity: 0.8;
          flex-shrink: 0;
          transition: none;
        }

        .title {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .section-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          opacity: 0;
        }

        .section-header:hover .section-actions {
          opacity: 1;
        }

        .section-content {
          overflow-y: auto;
          overflow-x: hidden;
          scrollbar-gutter: stable;
        }
        
        /* 滚动条样式 */
        .section-content::-webkit-scrollbar {
          width: 10px;
        }
        
        .section-content::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .section-content::-webkit-scrollbar-thumb {
          background: var(--scrollbar-thumb, rgba(121, 121, 121, 0.4));
          border-radius: 5px;
        }
        
        .section-content::-webkit-scrollbar-thumb:hover {
          background: var(--scrollbar-thumb-hover, rgba(100, 100, 100, 0.7));
        }

        .resize-handle {
          height: 4px;
          cursor: ns-resize;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
        }

        .resize-handle:hover,
        .resize-handle.resizing {
          background: var(--hover-bg, rgba(255, 255, 255, 0.1));
        }

        .resize-handle-line {
          width: 48px;
          height: 2px;
          background: var(--border-color, rgba(255, 255, 255, 0.3));
          border-radius: 1px;
          opacity: 0.5;
        }

        .resize-handle:hover .resize-handle-line,
        .resize-handle.resizing .resize-handle-line {
          opacity: 1;
          background: var(--accent-color, #007acc);
        }

        /* 拖动时禁用文本选择 */
        .resize-handle.resizing {
          user-select: none;
        }

        .resize-handle.resizing ~ * {
          user-select: none;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
};
