import React, { useEffect, useRef, useState } from 'react';

export interface InlineInputProps {
  initialValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}

/**
 * 内联输入框组件
 * 用于文件重命名、新建文件等场景
 */
export const InlineInput: React.FC<InlineInputProps> = ({
  initialValue = '',
  placeholder = '',
  onConfirm,
  onCancel,
  autoFocus = true,
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const isHandlingBlur = useRef(false);
  const isMounted = useRef(false);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
    }
    // 设置一个短暂的延迟，确保组件已完全挂载
    const timer = setTimeout(() => {
      isMounted.current = true;
    }, 100);
    
    return () => {
      clearTimeout(timer);
      isMounted.current = false;
    };
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!isHandlingBlur.current && value.trim()) {
        isHandlingBlur.current = true;
        onConfirm(value.trim());
      } else if (!value.trim()) {
        isHandlingBlur.current = true;
        onCancel();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!isHandlingBlur.current) {
        isHandlingBlur.current = true;
        onCancel();
      }
    }
  };

  const handleBlur = () => {
    // 防止在组件刚挂载时触发blur，或者已经处理过的情况下重复触发
    if (!isMounted.current || isHandlingBlur.current) {
      return;
    }
    
    isHandlingBlur.current = true;
    // 使用 setTimeout 延迟调用，避免在渲染期间更新父组件状态
    setTimeout(() => {
      if (value.trim()) {
        onConfirm(value.trim());
      } else {
        onCancel();
      }
    }, 0);
  };

  // 阻止鼠标事件冒泡，防止触发父组件的事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="inline-input"
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
    />
  );
};

export default InlineInput;




