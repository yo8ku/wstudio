/**
 * 目录大纲图标组件
 * 功能：显示目录/大纲的图标
 */

import { memo } from 'react';

type SvgProps = React.ComponentPropsWithoutRef<'svg'>;

export const TableOfContentsIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M16 5H3" />
      <path d="M16 12H3" />
      <path d="M16 19H3" />
      <path d="M21 5h.01" />
      <path d="M21 12h.01" />
      <path d="M21 19h.01" />
    </svg>
  );
});

TableOfContentsIcon.displayName = 'TableOfContentsIcon';
