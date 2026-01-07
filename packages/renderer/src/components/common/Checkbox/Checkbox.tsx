/**
 * Checkbox 复选框组件
 * 功能：提供可复用的复选框，支持选中、未选中、半选状态
 * 描述：继承主题配色，支持自定义大小和禁用状态
 */

import React, { useCallback } from 'react';
import { Icon } from '../../Icons/Icon';
import './Checkbox.scss';

export interface CheckboxProps {
  /** 是否选中 */
  checked?: boolean;
  /** 是否半选状态（用于全选时部分选中） */
  indeterminate?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 复选框大小，默认 16 */
  size?: number;
  /** 自定义类名 */
  className?: string;
  /** 点击事件 */
  onChange?: (checked: boolean) => void;
  /** 点击事件（原始事件） */
  onClick?: (event: React.MouseEvent) => void;
}

/**
 * 复选框组件
 * 支持选中、未选中、半选三种状态
 */
export const Checkbox: React.FC<CheckboxProps> = ({
  checked = false,
  indeterminate = false,
  disabled = false,
  size = 16,
  className = '',
  onChange,
  onClick,
}) => {
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (disabled) return;
      onClick?.(event);
      onChange?.(!checked);
    },
    [checked, disabled, onChange, onClick]
  );

  const getClassName = () => {
    const classes = ['ws-checkbox'];
    if (checked) classes.push('checked');
    if (indeterminate && !checked) classes.push('indeterminate');
    if (disabled) classes.push('disabled');
    if (className) classes.push(className);
    return classes.join(' ');
  };

  // 计算图标大小（比复选框小一点）
  const iconSize = Math.max(size - 4, 10);

  return (
    <span
      className={getClassName()}
      style={{ width: size, height: size }}
      onClick={handleClick}
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-disabled={disabled}
    >
      {checked && <Icon name="check" size={iconSize} />}
      {indeterminate && !checked && <Icon name="minus" size={iconSize} />}
    </span>
  );
};

export default Checkbox;
