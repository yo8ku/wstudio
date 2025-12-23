/**
 * 分栏图标组件
 * 功能：用于表示分栏布局的图标
 */

import { memo } from 'react';

type SvgProps = React.ComponentPropsWithoutRef<'svg'>;

export const ColumnsIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M10 2.5a.5.5 0 0 0-1 0v15a.5.5 0 0 0 1 0v-15zM4 4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4v-1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4V4H4zm7 0v1h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4v1h4a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4z"
        fill="currentColor"
      />
    </svg>
  );
});

ColumnsIcon.displayName = 'ColumnsIcon';
