/**
 * useScrollbarFade Hook
 * 功能：提供滚动条淡入淡出效果的状态管理
 * 描述：通过 data-hovered 属性控制滚动条的显示/隐藏，配合 CSS 实现淡入淡出效果
 */

import { useRef, useState, useEffect, useCallback } from 'react';

export interface UseScrollbarFadeOptions {
  /** 是否启用淡入淡出效果，默认 true */
  enabled?: boolean;
}

export interface UseScrollbarFadeReturn<T extends HTMLElement> {
  /** 绑定到滚动容器的 ref */
  scrollRef: React.RefObject<T>;
  /** 是否处于 hover 状态 */
  isHovered: boolean;
  /** 鼠标进入处理函数 */
  handleMouseEnter: () => void;
  /** 鼠标离开处理函数 */
  handleMouseLeave: () => void;
}

/**
 * 滚动条淡入淡出 Hook
 * @param options 配置选项
 * @returns 滚动条淡入淡出相关的状态和方法
 */
export function useScrollbarFade<T extends HTMLElement = HTMLDivElement>(
  options: UseScrollbarFadeOptions = {}
): UseScrollbarFadeReturn<T> {
  const { enabled = true } = options;
  const scrollRef = useRef<T>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 当 hover 状态变化时，更新 data-hovered 属性
  useEffect(() => {
    if (!enabled) return;
    
    const element = scrollRef.current;
    if (!element) return;

    if (isHovered) {
      element.setAttribute('data-hovered', 'true');
    } else {
      element.removeAttribute('data-hovered');
    }
  }, [isHovered, enabled]);

  const handleMouseEnter = useCallback(() => {
    if (enabled) {
      setIsHovered(true);
    }
  }, [enabled]);

  const handleMouseLeave = useCallback(() => {
    if (enabled) {
      setIsHovered(false);
    }
  }, [enabled]);

  return {
    scrollRef,
    isHovered,
    handleMouseEnter,
    handleMouseLeave,
  };
}

export default useScrollbarFade;
