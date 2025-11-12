/**
 * 列表视图图标组件
 */

import React from 'react';

interface ListViewIconProps {
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const ListViewIcon: React.FC<ListViewIconProps> = ({ size = 16, className = '', onClick }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      onClick={onClick}
      style={{ flexShrink: 0 }}
      fill="currentColor"
    >
      <path d="M64.5 462.8h351.6v-361H64.5v361z m63.9-295.4h223.7v229.7H128.4V167.4zM64.5 922.2h351.6v-361H64.5v361z m63.9-295.3h223.7v229.7H128.4V626.9z m398.4-426.7h400.7c17.7 0 32-14.7 32-32.8s-14.3-32.8-32-32.8H526.8c-17.7 0-32 14.7-32 32.8s14.4 32.8 32 32.8zM927.5 594H526.8c-17.7 0-32 14.7-32 32.8s14.3 32.8 32 32.8h400.7c17.7 0 32-14.7 32-32.8s-14.3-32.8-32-32.8z m0-229.7H526.8c-17.7 0-32 14.7-32 32.8 0 18.1 14.3 32.8 32 32.8h400.7c17.7 0 32-14.7 32-32.8 0-18.1-14.3-32.8-32-32.8z m0 459.5H526.8c-17.7 0-32 14.7-32 32.8s14.3 32.8 32 32.8h400.7c17.7 0 32-14.7 32-32.8s-14.3-32.8-32-32.8z"/>
    </svg>
  );
};

