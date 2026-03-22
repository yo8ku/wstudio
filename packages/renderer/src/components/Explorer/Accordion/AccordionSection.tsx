import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../Icons/Icon';
import { AccordionSectionProps } from './types';
import './AccordionSection.scss';

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

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    if (isHovered) {
      contentElement.setAttribute('data-hovered', 'true');
    } else {
      contentElement.removeAttribute('data-hovered');
    }
  }, [isHovered]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!resizable) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  useEffect(() => {
    if (!resizable) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) {
        return;
      }

      const deltaY = startYRef.current - e.clientY;
      let newHeight = startHeightRef.current + deltaY;

      const parentElement = sectionRef.current?.parentElement;
      if (parentElement) {
        const parentHeight = parentElement.clientHeight;
        let siblingsMinHeight = 0;

        Array.from(parentElement.children).forEach((child) => {
          if (child !== sectionRef.current && child instanceof HTMLElement) {
            const isExpandedChild = child.classList.contains('expanded');
            const isFlexGrowChild = child.classList.contains('flex-grow');

            if (isExpandedChild) {
              const headerHeight = 22;
              const minContentHeight = isFlexGrowChild ? 300 : 100;
              siblingsMinHeight += headerHeight + minContentHeight;
            } else {
              siblingsMinHeight += 22;
            }
          }
        });

        const dynamicMaxHeight = parentHeight - siblingsMinHeight;
        const effectiveMaxHeight = Math.min(maxHeight, Math.max(dynamicMaxHeight, minHeight));
        newHeight = Math.min(Math.max(newHeight, minHeight), effectiveMaxHeight);
      } else {
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
          <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={16} className="accordion-chevron" />
          {icon && <span className="accordion-icon">{icon}</span>}
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
                className="accordion-action-button"
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
              >
                {action.icon}
              </button>
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
