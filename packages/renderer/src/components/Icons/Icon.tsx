/**
 * Shared icon component.
 * Resolves icons through the internal icon registry.
 */

import React from 'react';
import { iconRegistry } from './IconRegistry';

export interface IconProps {
  iconSet?: string;
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

export const Icon: React.FC<IconProps> = ({
  iconSet = 'ui',
  name,
  size = 16,
  color,
  className,
  style,
  onClick,
}) => {
  let IconComponent = iconRegistry.getIconByAlias(name);

  if (!IconComponent) {
    IconComponent = iconRegistry.getIcon(iconSet, name);
  }

  if (!IconComponent) {
    IconComponent = iconRegistry.getIcon('ui', 'file');
  }

  if (!IconComponent) {
    console.error(`[Icon] Unable to resolve icon "${name}"`);
    return null;
  }

  const iconStyle: React.CSSProperties = {
    width: size,
    height: size,
    color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...style,
  };

  return (
    <span className={className} style={iconStyle} onClick={onClick}>
      <IconComponent style={{ width: '100%', height: '100%' }} className="" />
    </span>
  );
};

export default Icon;
