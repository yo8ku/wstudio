/**
 * Shared pressable control.
 * Uses a div to emulate button interactions without relying on button elements.
 */

import React from 'react';

export interface PressableControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'onKeyDown' | 'role' | 'tabIndex'> {
  onPress?: (event: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  disabled?: boolean;
}

export const PressableControl = React.forwardRef<HTMLDivElement, PressableControlProps>(
  ({ onPress, onKeyDown, disabled = false, children, ...rest }, ref) => {
    const handleClick: React.MouseEventHandler<HTMLDivElement> = event => {
      if (disabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onPress?.(event);
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = event => {
      onKeyDown?.(event);

      if (event.defaultPrevented || disabled) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPress?.(event);
      }
    };

    return (
      <div
        {...rest}
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }
);

PressableControl.displayName = 'PressableControl';
