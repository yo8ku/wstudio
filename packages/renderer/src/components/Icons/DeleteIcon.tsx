/**
 * 删除图标组件
 */

import React from 'react';

interface DeleteIconProps {
  size?: number;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

export const DeleteIcon: React.FC<DeleteIconProps> = ({ size = 16, className = '', onClick }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      onClick={onClick}
      style={{ flexShrink: 0 }}
    >
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18"></path>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </g>
    </svg>
  );
};










