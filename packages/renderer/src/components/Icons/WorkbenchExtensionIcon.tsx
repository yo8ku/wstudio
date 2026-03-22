/**
 * Theme-aware icon renderer for extension entry points and menu items.
 */

import React from 'react';
import { Icon } from './Icon';
import { ThemedMaskIcon } from './ThemedMaskIcon';

interface WorkbenchExtensionIconProps {
  readonly iconPath: string | null;
  readonly size: number;
  readonly className?: string;
  readonly fallbackIconName?: string;
}

export const WorkbenchExtensionIcon: React.FC<WorkbenchExtensionIconProps> = ({
  iconPath,
  size,
  className,
  fallbackIconName = 'extensions',
}) => {
  if (!iconPath) {
    return <Icon className={className} name={fallbackIconName} size={size} />;
  }

  return (
    <ThemedMaskIcon
      className={className}
      source={iconPath}
      size={size}
    />
  );
};
