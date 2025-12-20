/**
 * 搜索输入框组件
 * 功能：可复用的搜索框，支持收缩/展开状态
 * 特点：
 * - 收缩状态只显示放大镜图标
 * - 展开状态显示完整输入框
 * - 禁用拼写检查
 */

import React, { useState, useRef, useEffect } from 'react';
import './SearchInput.scss';

interface SearchInputProps {
  /** 搜索值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 是否始终展开（不可收缩） */
  alwaysExpanded?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 展开时的宽度 */
  expandedWidth?: number | string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = '搜索',
  defaultExpanded = false,
  alwaysExpanded = false,
  className = '',
  expandedWidth = 280,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || alwaysExpanded);
  const inputRef = useRef<HTMLInputElement>(null);

  // 点击放大镜展开
  const handleIconClick = () => {
    if (!alwaysExpanded && !isExpanded) {
      setIsExpanded(true);
    }
  };

  // 展开后自动聚焦
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // 失焦时收缩（如果没有内容）
  const handleBlur = () => {
    if (!alwaysExpanded && !value) {
      setIsExpanded(false);
    }
  };

  // 清空搜索
  const handleClear = () => {
    onChange('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const widthStyle = typeof expandedWidth === 'number' ? `${expandedWidth}px` : expandedWidth;

  return (
    <div
      className={`search-input-container ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}
      style={{ width: isExpanded ? widthStyle : '32px' }}
    >
      <div className="search-input-icon" onClick={handleIconClick}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      </div>

      {isExpanded && (
        <>
          <input
            ref={inputRef}
            type="text"
            className="search-input-field"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
          {value && (
            <div className="search-input-clear" onClick={handleClear}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SearchInput;
