/**
 * CustomScrollbar 自定义滚动条组件
 * 功能：提供可复用的自定义滚动条，支持淡入淡出效果
 * 描述：隐藏原生滚动条，使用自定义滚动条实现统一的视觉效果
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import './CustomScrollbar.scss';

export interface CustomScrollbarProps {
  /** 子元素 */
  children: React.ReactNode;
  /** 自定义类名 */
  className?: string;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 滚动条宽度，默认 6px */
  scrollbarWidth?: number;
  /** 默认透明度，默认 0.5 */
  defaultOpacity?: number;
  /** 淡出延迟时间（毫秒），默认 0 */
  fadeOutDelay?: number;
  /** 滚动方向，默认 vertical */
  direction?: 'vertical' | 'horizontal' | 'both';
  /** 滚动事件回调 */
  onScroll?: (scrollTop: number) => void;
  /** 右键菜单事件 */
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** 点击事件 */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  /** 滚轮事件 */
  onWheel?: (event: React.WheelEvent<HTMLDivElement>) => void;
}

export interface CustomScrollbarRef {
  /** 获取滚动容器元素 */
  getContentElement: () => HTMLDivElement | null;
  /** 设置垂直滚动位置 */
  setScrollTop: (scrollTop: number) => void;
  /** 获取垂直滚动位置 */
  getScrollTop: () => number;
  /** 设置横向滚动位置 */
  setScrollLeft: (scrollLeft: number) => void;
  /** 获取横向滚动位置 */
  getScrollLeft: () => number;
  /** 更新滚动条 */
  updateScrollbar: () => void;
}

/**
 * 自定义滚动条组件
 * 提供统一的滚动条样式和淡入淡出效果
 */
export const CustomScrollbar = forwardRef<CustomScrollbarRef, CustomScrollbarProps>(
  (
    {
      children,
      className = '',
      style,
      scrollbarWidth = 6,
      defaultOpacity = 0.5,
      fadeOutDelay = 0,
      direction = 'vertical',
      onScroll,
      onContextMenu,
      onClick,
      onWheel,
    },
    ref
  ) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const hTrackRef = useRef<HTMLDivElement>(null);
    const hThumbRef = useRef<HTMLDivElement>(null);
    const scrollbarUpdateFrameRef = useRef<number | null>(null);
    const fadeTimerRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isThumbDraggingRef = useRef(false);
    const isHThumbDraggingRef = useRef(false);
    const dragStartYRef = useRef(0);
    const dragStartXRef = useRef(0);
    const dragStartScrollTopRef = useRef(0);
    const dragStartScrollLeftRef = useRef(0);

    const [scrollbarOpacity, setScrollbarOpacity] = useState(0);
    const [hasScrollableContent, setHasScrollableContent] = useState(false);
    const [hasHScrollableContent, setHasHScrollableContent] = useState(false);
    const [isThumbDragging, setIsThumbDragging] = useState(false);
    const [isHThumbDragging, setIsHThumbDragging] = useState(false);
    const hasScrollableContentRef = useRef(false);
    const hasHScrollableContentRef = useRef(false);
    
    const showVertical = direction === 'vertical' || direction === 'both';
    const showHorizontal = direction === 'horizontal' || direction === 'both';

    // 淡入：立即显示滚动条
    const fadeIn = useCallback(() => {
      if (fadeTimerRef.current) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setScrollbarOpacity(defaultOpacity);
    }, [defaultOpacity]);

    // 淡出：逐步降低透明度
    const fadeOut = useCallback(() => {
      const step = 0.01;
      const interval = 10;
      let currentOpacity = defaultOpacity;

      const animate = () => {
        currentOpacity -= step;

        if (currentOpacity <= 0) {
          setScrollbarOpacity(0);
          return;
        }

        setScrollbarOpacity(currentOpacity);
        animationFrameRef.current = window.setTimeout(() => {
          animate();
        }, interval) as unknown as number;
      };

      if (fadeOutDelay > 0) {
        fadeTimerRef.current = window.setTimeout(() => {
          animate();
        }, fadeOutDelay) as unknown as number;
      } else {
        animate();
      }
    }, [defaultOpacity, fadeOutDelay]);

    // 更新是否有可滚动内容
    const updateHasScrollableContent = useCallback((value: boolean) => {
      if (hasScrollableContentRef.current !== value) {
        hasScrollableContentRef.current = value;
        setHasScrollableContent(value);
      }
    }, []);

    // 更新是否有横向可滚动内容
    const updateHasHScrollableContent = useCallback((value: boolean) => {
      if (hasHScrollableContentRef.current !== value) {
        hasHScrollableContentRef.current = value;
        setHasHScrollableContent(value);
      }
    }, []);

    // 更新滚动条位置和大小
    const scheduleScrollbarUpdate = useCallback(() => {
      if (scrollbarUpdateFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollbarUpdateFrameRef.current);
      }

      scrollbarUpdateFrameRef.current = window.requestAnimationFrame(() => {
        scrollbarUpdateFrameRef.current = null;

        const contentElement = contentRef.current;
        const thumbElement = thumbRef.current;
        const trackElement = trackRef.current;
        const hThumbElement = hThumbRef.current;
        const hTrackElement = hTrackRef.current;

        if (!contentElement) {
          updateHasScrollableContent(false);
          updateHasHScrollableContent(false);
          return;
        }

        const { scrollHeight, clientHeight, scrollTop, scrollWidth, clientWidth, scrollLeft } = contentElement;
        
        // 垂直滚动条
        if (showVertical && thumbElement) {
          const hasScroll = scrollHeight - clientHeight > 1;
          updateHasScrollableContent(hasScroll);

          if (!hasScroll) {
            thumbElement.style.height = '0px';
            thumbElement.style.top = '0px';
            thumbElement.style.opacity = '0';
          } else {
            const trackHeight = trackElement?.clientHeight ?? clientHeight;
            const availableTrack = Math.max(trackHeight, 0);
            const ratio = scrollHeight > 0 ? clientHeight / scrollHeight : 0;
            const minThumbHeight = 24;
            const thumbHeight = Math.max(Math.round(availableTrack * ratio), minThumbHeight);
            const maxScrollTop = scrollHeight - clientHeight;
            const maxThumbOffset = Math.max(availableTrack - thumbHeight, 0);
            const thumbOffset = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbOffset : 0;

            thumbElement.style.height = `${thumbHeight}px`;
            thumbElement.style.top = `${thumbOffset}px`;
            thumbElement.style.opacity = '1';
          }
        }

        // 横向滚动条
        if (showHorizontal && hThumbElement) {
          const hasHScroll = scrollWidth - clientWidth > 1;
          updateHasHScrollableContent(hasHScroll);

          if (!hasHScroll) {
            hThumbElement.style.width = '0px';
            hThumbElement.style.left = '0px';
            hThumbElement.style.opacity = '0';
          } else {
            const trackWidth = hTrackElement?.clientWidth ?? clientWidth;
            const availableTrack = Math.max(trackWidth, 0);
            const ratio = scrollWidth > 0 ? clientWidth / scrollWidth : 0;
            const minThumbWidth = 24;
            const thumbWidth = Math.max(Math.round(availableTrack * ratio), minThumbWidth);
            const maxScrollLeft = scrollWidth - clientWidth;
            const maxThumbOffset = Math.max(availableTrack - thumbWidth, 0);
            const thumbOffset = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * maxThumbOffset : 0;

            hThumbElement.style.width = `${thumbWidth}px`;
            hThumbElement.style.left = `${thumbOffset}px`;
            hThumbElement.style.opacity = '1';
          }
        }
      });
    }, [updateHasScrollableContent, updateHasHScrollableContent, showVertical, showHorizontal]);

    // 鼠标进入
    const handleMouseEnter = useCallback(() => {
      fadeIn();
    }, [fadeIn]);

    // 鼠标离开
    const handleMouseLeave = useCallback(() => {
      if (isThumbDraggingRef.current || isHThumbDraggingRef.current) {
        return;
      }
      fadeOut();
    }, [fadeOut]);

    // 拖动滚动条
    const handleThumbMouseMove = useCallback(
      (event: MouseEvent) => {
        if (!isThumbDraggingRef.current) {
          return;
        }

        event.preventDefault();
        const contentElement = contentRef.current;
        const thumbElement = thumbRef.current;
        const trackElement = trackRef.current;

        if (!contentElement || !thumbElement) {
          return;
        }

        const { clientHeight, scrollHeight } = contentElement;
        const maxScrollTop = scrollHeight - clientHeight;

        if (maxScrollTop <= 0) {
          return;
        }

        const thumbHeight = parseFloat(thumbElement.style.height || '0');
        const trackHeight = trackElement?.clientHeight ?? clientHeight;
        const availableTrack = Math.max(trackHeight - thumbHeight, 0);

        if (availableTrack <= 0) {
          return;
        }

        const delta = event.clientY - dragStartYRef.current;
        const scrollRatio = maxScrollTop / availableTrack;
        const nextScrollTop = Math.min(
          Math.max(dragStartScrollTopRef.current + delta * scrollRatio, 0),
          maxScrollTop
        );

        contentElement.scrollTop = nextScrollTop;
        scheduleScrollbarUpdate();
      },
      [scheduleScrollbarUpdate]
    );

    const handleThumbMouseUp = useCallback(() => {
      if (!isThumbDraggingRef.current) {
        return;
      }

      isThumbDraggingRef.current = false;
      setIsThumbDragging(false);
      window.removeEventListener('mousemove', handleThumbMouseMove);
      window.removeEventListener('mouseup', handleThumbMouseUp);

      const wrapperElement = trackRef.current?.parentElement;
      if (!wrapperElement || !wrapperElement.matches(':hover')) {
        fadeOut();
      } else {
        fadeIn();
      }
    }, [handleThumbMouseMove, fadeOut, fadeIn]);

    const handleThumbMouseDown = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (!contentRef.current) {
          return;
        }

        isThumbDraggingRef.current = true;
        setIsThumbDragging(true);
        fadeIn();
        dragStartYRef.current = event.clientY;
        dragStartScrollTopRef.current = contentRef.current.scrollTop;

        window.addEventListener('mousemove', handleThumbMouseMove);
        window.addEventListener('mouseup', handleThumbMouseUp);
      },
      [handleThumbMouseMove, handleThumbMouseUp, fadeIn]
    );

    // 横向滚动条拖动
    const handleHThumbMouseMove = useCallback(
      (event: MouseEvent) => {
        if (!isHThumbDraggingRef.current) {
          return;
        }

        event.preventDefault();
        const contentElement = contentRef.current;
        const hThumbElement = hThumbRef.current;
        const hTrackElement = hTrackRef.current;

        if (!contentElement || !hThumbElement) {
          return;
        }

        const { clientWidth, scrollWidth } = contentElement;
        const maxScrollLeft = scrollWidth - clientWidth;

        if (maxScrollLeft <= 0) {
          return;
        }

        const thumbWidth = parseFloat(hThumbElement.style.width || '0');
        const trackWidth = hTrackElement?.clientWidth ?? clientWidth;
        const availableTrack = Math.max(trackWidth - thumbWidth, 0);

        if (availableTrack <= 0) {
          return;
        }

        const delta = event.clientX - dragStartXRef.current;
        const scrollRatio = maxScrollLeft / availableTrack;
        const nextScrollLeft = Math.min(
          Math.max(dragStartScrollLeftRef.current + delta * scrollRatio, 0),
          maxScrollLeft
        );

        contentElement.scrollLeft = nextScrollLeft;
        scheduleScrollbarUpdate();
      },
      [scheduleScrollbarUpdate]
    );

    const handleHThumbMouseUp = useCallback(() => {
      if (!isHThumbDraggingRef.current) {
        return;
      }

      isHThumbDraggingRef.current = false;
      setIsHThumbDragging(false);
      window.removeEventListener('mousemove', handleHThumbMouseMove);
      window.removeEventListener('mouseup', handleHThumbMouseUp);

      const wrapperElement = hTrackRef.current?.parentElement;
      if (!wrapperElement || !wrapperElement.matches(':hover')) {
        fadeOut();
      } else {
        fadeIn();
      }
    }, [handleHThumbMouseMove, fadeOut, fadeIn]);

    const handleHThumbMouseDown = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (!contentRef.current) {
          return;
        }

        isHThumbDraggingRef.current = true;
        setIsHThumbDragging(true);
        fadeIn();
        dragStartXRef.current = event.clientX;
        dragStartScrollLeftRef.current = contentRef.current.scrollLeft;

        window.addEventListener('mousemove', handleHThumbMouseMove);
        window.addEventListener('mouseup', handleHThumbMouseUp);
      },
      [handleHThumbMouseMove, handleHThumbMouseUp, fadeIn]
    );

    // 监听滚动事件
    useEffect(() => {
      const contentElement = contentRef.current;
      if (!contentElement) return;

      const handleScroll = () => {
        if (!contentElement) return;
        onScroll?.(contentElement.scrollTop);
        scheduleScrollbarUpdate();
      };

      contentElement.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
        contentElement.removeEventListener('scroll', handleScroll);
      };
    }, [scheduleScrollbarUpdate, onScroll]);

    // 监听内容变化
    useEffect(() => {
      scheduleScrollbarUpdate();
    }, [children, scheduleScrollbarUpdate]);

    // 监听容器大小变化
    useEffect(() => {
      const contentElement = contentRef.current;
      if (!contentElement) return;

      scheduleScrollbarUpdate();

      if (typeof ResizeObserver === 'undefined') return;

      const observer = new ResizeObserver(() => {
        scheduleScrollbarUpdate();
      });

      observer.observe(contentElement);

      return () => {
        observer.disconnect();
      };
    }, [scheduleScrollbarUpdate]);

    // 清理定时器
    useEffect(() => {
      return () => {
        if (fadeTimerRef.current) {
          clearTimeout(fadeTimerRef.current);
        }
        if (animationFrameRef.current) {
          clearTimeout(animationFrameRef.current);
        }
        if (scrollbarUpdateFrameRef.current) {
          window.cancelAnimationFrame(scrollbarUpdateFrameRef.current);
        }
      };
    }, []);

    // 清理拖动事件
    useEffect(() => {
      return () => {
        window.removeEventListener('mousemove', handleThumbMouseMove);
        window.removeEventListener('mouseup', handleThumbMouseUp);
        window.removeEventListener('mousemove', handleHThumbMouseMove);
        window.removeEventListener('mouseup', handleHThumbMouseUp);
      };
    }, [handleThumbMouseMove, handleThumbMouseUp, handleHThumbMouseMove, handleHThumbMouseUp]);

    // 暴露方法给父组件
    useImperativeHandle(
      ref,
      () => ({
        getContentElement: () => contentRef.current,
        setScrollTop: (scrollTop: number) => {
          if (contentRef.current) {
            contentRef.current.scrollTop = scrollTop;
            scheduleScrollbarUpdate();
          }
        },
        getScrollTop: () => contentRef.current?.scrollTop ?? 0,
        setScrollLeft: (scrollLeft: number) => {
          if (contentRef.current) {
            contentRef.current.scrollLeft = scrollLeft;
            scheduleScrollbarUpdate();
          }
        },
        getScrollLeft: () => contentRef.current?.scrollLeft ?? 0,
        updateScrollbar: scheduleScrollbarUpdate,
      }),
      [scheduleScrollbarUpdate]
    );

    // 根据方向确定 overflow 样式
    const contentOverflowStyle: React.CSSProperties = {
      overflowY: showVertical ? 'auto' : 'hidden',
      overflowX: showHorizontal ? 'auto' : 'hidden',
    };

    return (
      <div
        className={`custom-scrollbar-wrapper ${className} ${showHorizontal ? 'custom-scrollbar-wrapper--horizontal' : ''}`}
        style={
          {
            ...style,
            '--custom-scrollbar-width': `${scrollbarWidth}px`,
          } as React.CSSProperties
        }
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div
          ref={contentRef}
          className="custom-scrollbar-content"
          style={contentOverflowStyle}
          onContextMenu={onContextMenu}
          onClick={onClick}
          onWheel={onWheel}
        >
          {children}
        </div>
        {showVertical && (
          <div
            className="custom-scrollbar-track"
            ref={trackRef}
            aria-hidden="true"
            style={{ opacity: hasScrollableContent ? scrollbarOpacity : 0 }}
          >
            <div
              className={`custom-scrollbar-thumb ${isThumbDragging ? 'is-dragging' : ''}`}
              ref={thumbRef}
              onMouseDown={handleThumbMouseDown}
            />
          </div>
        )}
        {showHorizontal && (
          <div
            className="custom-scrollbar-track custom-scrollbar-track--horizontal"
            ref={hTrackRef}
            aria-hidden="true"
            style={{ opacity: hasHScrollableContent ? scrollbarOpacity : 0 }}
          >
            <div
              className={`custom-scrollbar-thumb ${isHThumbDragging ? 'is-dragging' : ''}`}
              ref={hThumbRef}
              onMouseDown={handleHThumbMouseDown}
            />
          </div>
        )}
      </div>
    );
  }
);

CustomScrollbar.displayName = 'CustomScrollbar';

export default CustomScrollbar;
