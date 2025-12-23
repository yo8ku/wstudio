/**
 * 高亮块图标组件
 * 功能：用于表示高亮块/callout块的图标
 */

import { memo } from 'react';

type SvgProps = React.ComponentPropsWithoutRef<'svg'>;

export const HighlightBlockIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <svg
      width="24"
      height="24"
      className={className}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M12 15H5a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h5V5a1 1 0 0 0-1-1H3V2h6a3 3 0 0 1 3 3zM5 9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h5V9z"
        fill="currentColor"
      />
      <path d="M20 23v2a1 1 0 0 0 1 1h5v-4h-5a1 1 0 0 0-1 1z" fill="currentColor" />
      <path
        d="M2 30h28V2zm26-2h-7a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3h5v-2a1 1 0 0 0-1-1h-6v-2h6a3 3 0 0 1 3 3z"
        fill="currentColor"
      />
    </svg>
  );
});

HighlightBlockIcon.displayName = 'HighlightBlockIcon';
