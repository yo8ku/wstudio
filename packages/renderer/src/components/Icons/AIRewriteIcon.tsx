/**
 * AI 改写图标组件
 * 功能：用于显示 AI 改写、续写、差异对比功能的图标
 */

import React from 'react';

interface AIRewriteIconProps {
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const AIRewriteIcon: React.FC<AIRewriteIconProps> = ({ 
  size = 16, 
  className = '', 
  onClick 
}) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      xmlnsXlink="http://www.w3.org/1999/xlink"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      onClick={onClick}
      style={{ flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      <path 
        d="M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm0 6l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25zm-7.5-5.5L9 4L6.5 9.5L1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zm-1.51 3.49L9 15.17l-.99-2.18L5.83 12l2.18-.99L9 8.83l.99 2.18l2.18.99l-2.18.99z" 
        fill="currentColor"
      />
    </svg>
  );
};




