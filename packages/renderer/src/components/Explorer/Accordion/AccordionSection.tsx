import React, { useState, useRef, useEffect } from 'react';
import { AccordionSectionProps } from './types';
import './AccordionSection.scss';

/**
 * 手风琴组件
 * 用于创建可折叠的面板，支持标题、图标和操作按钮
 * 支持可调整大小功能（通过顶部拖动手柄）
 */
export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon,
  defaultExpanded = true,
  actions = [],
  children,
  onExpandChange,
  resizable = false,
  defaultHeight = 250,
  minHeight = 100,
  maxHeight = 600,
  onHeightChange,
  flexGrow = false,
  showResizeHandle = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [height, setHeight] = useState(defaultHeight);
  const [isResizing, setIsResizing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleToggle = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  };

  // 当鼠标进入/离开时，动态切换 hovered 类以控制滚动条显示
  // 这样可以利用 CSS 的 transition 实现平滑效果（仅 Firefox 支持）
  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;

    // 通过添加/移除 data 属性来触发 CSS 选择器
    if (isHovered) {
      contentElement.setAttribute('data-hovered', 'true');
    } else {
      contentElement.removeAttribute('data-hovered');
    }
  }, [isHovered]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!resizable) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  useEffect(() => {
    if (!resizable) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // 向上拖动是负数，向下拖动是正数
      // 因为手柄在顶部，向上拖应该增加高度
      const deltaY = startYRef.current - e.clientY;
      let newHeight = startHeightRef.current + deltaY;

      // 计算动态最大高度：考虑父容器和其他兄弟元素的最小需求
      const parentElement = sectionRef.current?.parentElement;
      if (parentElement) {
        const parentHeight = parentElement.clientHeight;
        
        // 计算所有兄弟元素的最小必需高度（标题 + 最小内容）
        let siblingsMinHeight = 0;
        Array.from(parentElement.children).forEach((child) => {
          if (child !== sectionRef.current && child instanceof HTMLElement) {
            const isExpanded = child.classList.contains('expanded');
            const isFlexGrow = child.classList.contains('flex-grow');
            
            if (isExpanded) {
              // 已展开的面板：标题高度 + 最小内容高度
              const headerHeight = 22; // 标题高度
              const minContentHeight = isFlexGrow ? 300 : 100; // flex-grow元素(文件树)保留300px，其他保留100px
              siblingsMinHeight += headerHeight + minContentHeight;
            } else {
              // 折叠的面板：只需要标题高度
              siblingsMinHeight += 22;
            }
          }
        });
        
        // 动态最大高度 = 父容器高度 - 兄弟元素最小高度
        const dynamicMaxHeight = parentHeight - siblingsMinHeight;
        
        // 使用动态计算的最大高度和配置的最大高度中较小的一个
        const effectiveMaxHeight = Math.min(maxHeight, Math.max(dynamicMaxHeight, minHeight));
        newHeight = Math.min(Math.max(newHeight, minHeight), effectiveMaxHeight);
      } else {
        // 如果无法获取父容器，使用配置的最大高度
        newHeight = Math.min(Math.max(newHeight, minHeight), maxHeight);
      }

      setHeight(newHeight);
      onHeightChange?.(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, minHeight, maxHeight, resizable, onHeightChange]);


  return (
    <div 
      ref={sectionRef}
      className={`accordion-section ${expanded ? 'expanded' : 'collapsed'} ${resizable ? 'resizable' : ''} ${flexGrow ? 'accordion-flex-grow' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {resizable && expanded && showResizeHandle && (
        <div 
          className={`accordion-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleMouseDown}
        >
          <div className="accordion-resize-line" />
        </div>
      )}
      <div className="accordion-header" onClick={handleToggle}>
        <div className="accordion-header-left">
          <span className={`accordion-chevron codicon ${expanded ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
          {icon && <span className={`accordion-icon codicon ${icon}`} />}
          <span className="accordion-title">{title}</span>
        </div>
        {actions.length > 0 && (
          <div
            className="accordion-actions"
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((action) => (
              <button
                key={action.id}
                className={`accordion-action-button codicon ${action.icon}`}
                title={action.tooltip}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  action.onClick();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                aria-label={action.tooltip}
              />
            ))}
          </div>
        )}
      </div>
      <div className={`accordion-content-wrapper ${expanded ? 'expanded' : 'collapsed'}`}>
        <div 
          ref={contentRef}
          className={`accordion-content ${flexGrow ? 'accordion-content-flex-grow' : ''} ${resizable ? 'resizable' : ''}`}
          style={{
            ...(resizable && expanded ? { height: `${height}px` } : {}),
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default AccordionSection;

