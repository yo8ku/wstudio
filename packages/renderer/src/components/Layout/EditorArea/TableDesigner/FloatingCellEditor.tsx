/**
 * 浮动单元格编辑器组件
 * 功能：在单元格位置显示浮动输入框
 * 描述：解决 TanStack Table 重渲染导致编辑器被卸载的问题
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import type { ColumnType, CellValue } from './types';

interface FloatingCellEditorProps {
  /** 是否显示编辑器 */
  visible: boolean;
  /** 编辑器位置 */
  position: { top: number; left: number; width: number; height: number };
  /** 当前值 */
  value: string;
  /** 列类型 */
  columnType: ColumnType;
  /** 额外的左内边距（用于子记录缩进） */
  extraPaddingLeft?: number;
  /** 值变化回调（编辑完成时调用） */
  onValueChange: (value: CellValue) => void;
  /** 关闭编辑器回调 */
  onClose: () => void;
  /** 键盘导航回调 */
  onKeyNavigation?: (key: string, shiftKey: boolean) => void;
}

/**
 * 浮动单元格编辑器
 * 独立于表格渲染，避免被 TanStack Table 重渲染影响
 */
export const FloatingCellEditor: React.FC<FloatingCellEditorProps> = ({
  visible,
  position,
  value,
  columnType,
  extraPaddingLeft = 0,
  onValueChange,
  onClose,
  onKeyNavigation,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(value);
  const internalValueRef = useRef(value);
  const initialValueRef = useRef(value); // 保存初始值用于比较
  const onValueChangeRef = useRef(onValueChange);
  const onCloseRef = useRef(onClose);
  const onKeyNavigationRef = useRef(onKeyNavigation);
  const columnTypeRef = useRef(columnType);

  // 同步更新 ref
  useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onCloseRef.current = onClose;
    onKeyNavigationRef.current = onKeyNavigation;
    columnTypeRef.current = columnType;
  }, [onValueChange, onClose, onKeyNavigation, columnType]);

  // 组件卸载时自动保存值
  useEffect(() => {
    return () => {
      // 组件卸载时，如果值有变化则保存
      if (internalValueRef.current !== initialValueRef.current) {
        const finalValue = columnTypeRef.current === 'number'
          ? (internalValueRef.current ? Number(internalValueRef.current) : '')
          : internalValueRef.current;
        onValueChangeRef.current(finalValue);
      }
    };
  }, []); // 空依赖，只在卸载时执行

  // 提交值并关闭
  const commitAndClose = useCallback(() => {
    const finalValue = columnTypeRef.current === 'number'
      ? (internalValueRef.current ? Number(internalValueRef.current) : '')
      : internalValueRef.current;
    onValueChangeRef.current(finalValue);
    onCloseRef.current();
  }, []);

  // 提交值并导航
  const commitAndNavigate = useCallback((key: string, shiftKey: boolean) => {
    const finalValue = columnTypeRef.current === 'number'
      ? (internalValueRef.current ? Number(internalValueRef.current) : '')
      : internalValueRef.current;
    onValueChangeRef.current(finalValue);
    onKeyNavigationRef.current?.(key, shiftKey);
  }, []);

  // 组件挂载后聚焦输入框
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
      // 将光标移到末尾
      inputRef.current.setSelectionRange(
        inputRef.current.value.length,
        inputRef.current.value.length
      );
    }
  }, [visible]);

  // 点击外部关闭（保存值）
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 如果点击的是当前编辑器内部，不处理
      if (target.closest('.floating-cell-editor')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target)) {
        // 点击外部时保存值并关闭
        commitAndClose();
        
        // 如果点击的是链接元素，直接打开链接
        if (target.classList.contains('cell-url-link')) {
          const urlValue = target.textContent || '';
          if (urlValue) {
            let url = urlValue;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              url = 'https://' + url;
            }
            window.electron?.shell?.openExternal(url);
          }
        }
      }
    };

    // 延迟添加监听，避免双击触发时立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 200);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, commitAndClose]);

  // 处理输入变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    internalValueRef.current = newValue;
  }, []);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      commitAndNavigate('Tab', e.shiftKey);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      commitAndNavigate('Enter', false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    }
  }, [commitAndNavigate]);

  // 阻止事件冒泡
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="floating-cell-editor"
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        zIndex: 20, // 降低 z-index，只需要高于表格单元格即可
      }}
      onMouseDown={handleMouseDown}
    >
      <input
        ref={inputRef}
        type={columnType === 'number' ? 'text' : 'text'}
        className="floating-cell-input"
        value={internalValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        style={{
          paddingLeft: extraPaddingLeft > 0 ? 7 + extraPaddingLeft : undefined, // 只有子记录才需要额外内边距
        }}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
};
