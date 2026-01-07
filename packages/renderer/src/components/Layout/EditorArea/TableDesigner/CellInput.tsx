/**
 * 单元格输入组件
 * 功能：处理表格单元格的输入，支持 IME 组合输入（中文等）
 * 描述：使用原生 input 配合 IME 事件处理，解决中文输入和按键重复问题
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { ColumnType, CellValue } from './types';

interface CellInputProps {
  type: 'text' | 'number' | 'date';
  value: string;
  isEditing: boolean;
  columnType: ColumnType;
  onValueChange: (value: CellValue) => void;
  onBlur: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * 单元格输入组件
 * 使用本地状态和 IME 组合事件处理来支持中文输入
 */
export const CellInput: React.FC<CellInputProps> = ({
  type,
  value,
  isEditing,
  columnType,
  onValueChange,
  onBlur,
  onKeyDown,
}) => {
  // 本地输入值状态
  const [localValue, setLocalValue] = useState(value);
  // IME 组合状态
  const isComposingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当外部 value 变化时同步本地状态（非编辑状态或非组合状态）
  useEffect(() => {
    if (!isComposingRef.current && !isEditing) {
      setLocalValue(value);
    }
  }, [value, isEditing]);

  // 进入编辑状态时，同步值并聚焦
  useEffect(() => {
    if (isEditing) {
      setLocalValue(value);
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [isEditing, value]);

  // 处理输入变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    
    // 如果不在 IME 组合状态，立即更新外部值
    if (!isComposingRef.current) {
      const finalValue = columnType === 'number' 
        ? (newValue ? Number(newValue) : '')
        : newValue;
      onValueChange(finalValue);
    }
  }, [columnType, onValueChange]);

  // IME 组合开始
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  // IME 组合结束
  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    // 组合结束后，使用最终的输入值更新
    const newValue = e.currentTarget.value;
    const finalValue = columnType === 'number' 
      ? (newValue ? Number(newValue) : '')
      : newValue;
    onValueChange(finalValue);
  }, [columnType, onValueChange]);

  // 处理失焦
  const handleBlur = useCallback(() => {
    // 确保最终值被保存
    if (isComposingRef.current) {
      isComposingRef.current = false;
      const finalValue = columnType === 'number' 
        ? (localValue ? Number(localValue) : '')
        : localValue;
      onValueChange(finalValue);
    }
    onBlur();
  }, [columnType, localValue, onValueChange, onBlur]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // 如果在 IME 组合状态，不处理键盘导航
    if (isComposingRef.current) {
      return;
    }
    onKeyDown?.(e);
  }, [onKeyDown]);

  return (
    <input
      ref={inputRef}
      type={type}
      className={`cell-input ${isEditing ? 'editing' : ''}`}
      value={localValue}
      readOnly={!isEditing}
      style={!isEditing ? { pointerEvents: 'none' } : undefined}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      onBlur={handleBlur}
      onKeyDown={isEditing ? handleKeyDown : undefined}
    />
  );
};
