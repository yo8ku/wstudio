/**
 * 通用开关组件
 * 功能：提供可复用的 switch 控件，支持键盘交互、禁用态和局部样式变量覆盖。
 */

import React, { useCallback } from 'react';
import './Switch.scss';

export interface SwitchProps {
  checked?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  title?: string;
  onChange?: (checked: boolean) => void;
  onClick?: (event: React.MouseEvent<HTMLSpanElement>) => void;
}

export const Switch: React.FC<SwitchProps> = ({
  checked = false,
  disabled = false,
  className = '',
  ariaLabel,
  title,
  onChange,
  onClick,
}) => {
  const handleToggle = useCallback(() => {
    if (disabled) return;
    onChange?.(!checked);
  }, [checked, disabled, onChange]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (disabled) return;
    onClick?.(event);
    handleToggle();
  }, [disabled, handleToggle, onClick]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    handleToggle();
  }, [handleToggle]);

  const classes = ['ws-switch'];
  if (checked) classes.push('is-checked');
  if (disabled) classes.push('is-disabled');
  if (className) classes.push(className);

  return (
    <span
      className={classes.join(' ')}
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="ws-switch__thumb" />
    </span>
  );
};

export default Switch;
