import React from 'react';

interface ThemedMaskIconProps {
  readonly source: string;
  readonly size: number;
  readonly className?: string;
}

export const ThemedMaskIcon: React.FC<ThemedMaskIconProps> = ({
  source,
  size,
  className,
}) => {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    display: 'block',
    flexShrink: 0,
    backgroundColor: 'currentColor',
    maskImage: `url("${source}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    WebkitMaskImage: `url("${source}")`,
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
  };

  return <span aria-hidden="true" className={className} style={style} />;
};
