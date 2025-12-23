/**
 * 面板左侧打开图标
 * 功能：用于收缩大纲面板的图标
 */

import React from 'react';

interface PanelLeftOpenIconProps {
  className?: string;
}

export const PanelLeftOpenIcon: React.FC<PanelLeftOpenIconProps> = ({ className }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      <path d="m14 9 3 3-3 3" />
    </svg>
  );
};
